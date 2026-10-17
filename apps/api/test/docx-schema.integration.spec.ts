import { Client } from 'pg';
import { randomUUID } from 'node:crypto';

describe('DOCX source snapshot SQL guards', () => {
  let db: Client;
  beforeAll(async () => {
    const url = new URL(process.env.TEST_DATABASE_URL ?? '');
    if (!url.pathname.endsWith('_test')) throw new Error('Test DB required');
    db = new Client({ connectionString: url.href });
    await db.connect();
  });
  afterAll(async () => {
    await db.end();
  });
  it('has a source relation without broadening the files PDF-only contract', async () => {
    const table = await db.query(
      "SELECT to_regclass('hucescholar.document_source_uploads') AS relation",
    );
    expect(table.rows[0].relation).not.toBeNull();
    const column = await db.query(
      "SELECT column_name FROM information_schema.columns WHERE table_schema='hucescholar' AND table_name='document_versions' AND column_name='source_upload_id'",
    );
    expect(column.rowCount).toBe(1);
  });
  async function fixture() {
    const user = (
      await db.query(
        "INSERT INTO hucescholar.users(email,display_name,password_hash,role,status,verified_at) VALUES($1,'Source fixture','hash','LECTURER','ACTIVE',now()) RETURNING id",
        [`source-${randomUUID()}@example.test`],
      )
    ).rows[0].id;
    const doc = (
      await db.query(
        "INSERT INTO hucescholar.documents(kind,created_by,manager_id) VALUES('LECTURER_MATERIAL',$1,$1) RETURNING id",
        [user],
      )
    ).rows[0].id;
    const version = (
      await db.query(
        "INSERT INTO hucescholar.document_versions(document_id,version_no,created_by,title,material_type,source_reference,rights_basis) VALUES($1,1,$2,'Source fixture','LECTURE','','') RETURNING id",
        [doc, user],
      )
    ).rows[0].id;
    const source = (
      await db.query(
        "INSERT INTO hucescholar.document_source_uploads(version_id,uploaded_by,request_id,object_key,original_name,byte_size,sha256) VALUES($1,$2,$3,$4,'fixture.docx',100,$5) RETURNING id",
        [version, user, randomUUID(), `sources/${randomUUID()}.docx`, 'a'.repeat(64)],
      )
    ).rows[0].id;
    await db.query('UPDATE hucescholar.document_versions SET source_upload_id=$1 WHERE id=$2', [
      source,
      version,
    ]);
    return { user, doc, version, source };
  }
  it.each([
    'byte_size=101',
    "sha256=repeat('b',64)",
    "object_key='sources/00000000-0000-4000-8000-000000000001.docx'",
  ])('keeps source identity immutable: %s', async (set) => {
    await db.query('BEGIN');
    try {
      const f = await fixture();
      await expect(
        db.query(`UPDATE hucescholar.document_source_uploads SET ${set} WHERE id=$1`, [f.source]),
      ).rejects.toMatchObject({ code: '23514' });
    } finally {
      await db.query('ROLLBACK');
    }
  });
  it('rejects READY without a real safe PDF', async () => {
    await db.query('BEGIN');
    try {
      const f = await fixture();
      await expect(
        db.query(
          "UPDATE hucescholar.document_source_uploads SET conversion_status='READY' WHERE id=$1",
          [f.source],
        ),
      ).rejects.toMatchObject({ code: '23514' });
    } finally {
      await db.query('ROLLBACK');
    }
  });
  it('rejects a source from another version', async () => {
    await db.query('BEGIN');
    try {
      const a = await fixture();
      const b = await fixture();
      await expect(
        db.query('UPDATE hucescholar.document_versions SET source_upload_id=$1 WHERE id=$2', [
          a.source,
          b.version,
        ]),
      ).rejects.toMatchObject({ code: '23503' });
    } finally {
      await db.query('ROLLBACK');
    }
  });
});
