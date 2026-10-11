import 'reflect-metadata';
import { PrismaPg } from '@prisma/adapter-pg';
import * as argon2 from 'argon2';
import { isEmail } from 'class-validator';
import { PrismaClient } from '../generated/prisma/client';
import { parseAuthEnvironment } from '../auth/auth.config';
import { passwordOptions } from '../auth/auth.service';

async function bootstrap(): Promise<void> {
  const config = parseAuthEnvironment(process.env);
  const email = (process.env.BOOTSTRAP_ADMIN_EMAIL ?? '').trim().toLowerCase();
  const displayName = (process.env.BOOTSTRAP_ADMIN_NAME ?? '').trim();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD ?? '';
  if (
    !isEmail(email) ||
    email.length > 254 ||
    !displayName ||
    displayName.length > 150 ||
    password.length < 16 ||
    password.length > 128
  ) {
    throw new Error(
      'Provide a valid BOOTSTRAP_ADMIN_EMAIL, NAME (1–150 chars) and PASSWORD (16–128 chars) in the ignored .env.bootstrap file.',
    );
  }
  const passwordHash = await argon2.hash(password, passwordOptions);
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: config.databaseUrl }) });
  try {
    await db.$transaction(async (tx) => {
      // Concurrent bootstrap commands must not create multiple first administrators.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(18437, 1)`;
      if (await tx.users.count({ where: { role: 'ADMIN' } }))
        throw new Error('An administrator already exists; bootstrap will not change any account.');
      if (await tx.users.findUnique({ where: { email } }))
        throw new Error('This email already exists; bootstrap will not change any account.');
      const user = await tx.users.create({
        data: {
          email,
          display_name: displayName,
          password_hash: passwordHash,
          role: 'ADMIN',
          status: 'ACTIVE',
          verified_at: new Date(),
        },
      });
      await tx.audit_events.create({
        data: {
          actor_id: user.id,
          event_type: 'ACCOUNT_BOOTSTRAPPED',
          entity_type: 'USER',
          entity_id: user.id,
        },
      });
    });
    console.log(
      'First administrator created. Credentials were not printed. Remove the bootstrap password file after use.',
    );
  } finally {
    await db.$disconnect();
  }
}

bootstrap().catch((error: unknown) => {
  // Do not print driver errors, URLs, hashes, or the environment.
  console.error(
    error instanceof Error && /^(Provide|An administrator|This email)/.test(error.message)
      ? error.message
      : 'Administrator bootstrap failed. Check local configuration and database availability.',
  );
  process.exitCode = 1;
});
