import { Client } from 'pg';

describe('migrated PostgreSQL authentication lifecycle', () => {
  let client: Client;
  beforeAll(async () => {
    const url = new URL(process.env.TEST_DATABASE_URL ?? '');
    if (!url.pathname.endsWith('_test'))
      throw new Error('Only isolated _test databases are permitted.');
    client = new Client({ connectionString: url.href });
    await client.connect();
  });
  afterAll(async () => {
    await client?.end();
  });

  it('preserves 31 tables, constraints, partial indexes and snapshot triggers', async () => {
    const tables = await client.query(
      "SELECT count(*)::int n FROM information_schema.tables WHERE table_schema='hucescholar' AND table_type='BASE TABLE'",
    );
    expect(tables.rows[0].n).toBe(31);
    const constraints = await client.query(
      "SELECT contype, count(*)::int n FROM pg_constraint WHERE connamespace='hucescholar'::regnamespace GROUP BY contype",
    );
    expect(constraints.rows).toEqual(
      expect.arrayContaining([
        { contype: 'f', n: 65 },
        { contype: 'c', n: 98 },
      ]),
    );
    const partial = await client.query(
      "SELECT count(*)::int n FROM pg_indexes WHERE schemaname='hucescholar' AND indexdef LIKE '% WHERE %'",
    );
    expect(partial.rows[0].n).toBe(11);
    const guards = await client.query(
      "SELECT count(*)::int n FROM pg_trigger WHERE tgrelid IN ('hucescholar.document_versions'::regclass,'hucescholar.version_courses'::regclass,'hucescholar.files'::regclass,'hucescholar.documents'::regclass) AND NOT tgisinternal",
    );
    expect(guards.rows[0].n).toBe(7);
  });

  it.each(['status', 'password_hash', 'role', 'verified_at'])(
    'revokes sessions on changing %s and does not revive after unlock',
    async (field) => {
      await client.query('BEGIN');
      try {
        const user = await client.query(
          "INSERT INTO hucescholar.users(email,display_name,password_hash,role,status,verified_at) VALUES($1,'Lifecycle test','hash','STUDENT','ACTIVE',now()) RETURNING id",
          [`lifecycle-${field}@example.test`],
        );
        await client.query(
          "INSERT INTO hucescholar.auth_sessions(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval '1 hour')",
          [user.rows[0].id, 'b'.repeat(64)],
        );
        const updates: Record<string, string> = {
          status: "status='LOCKED'",
          password_hash: "password_hash='changed'",
          role: "role='LECTURER'",
          verified_at: "status='PENDING',verified_at=NULL",
        };
        await client.query(`UPDATE hucescholar.users SET ${updates[field]} WHERE id=$1`, [
          user.rows[0].id,
        ]);
        await client.query(
          "UPDATE hucescholar.users SET status='ACTIVE',verified_at=now() WHERE id=$1",
          [user.rows[0].id],
        );
        const session = await client.query(
          'SELECT revoked_at FROM hucescholar.auth_sessions WHERE user_id=$1',
          [user.rows[0].id],
        );
        expect(session.rows[0].revoked_at).not.toBeNull();
      } finally {
        await client.query('ROLLBACK');
      }
    },
  );
});
