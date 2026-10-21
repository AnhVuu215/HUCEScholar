import { Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { createTransport, type Transporter } from 'nodemailer';

export type Mail = { to: string; subject: string; text: string };
export type MailConfiguration =
  | { transport: 'disabled' }
  | { transport: 'file'; directory: string; from: string }
  | { transport: 'smtp'; url: string; from: string };

/**
 * MAIL_TRANSPORT=smtp needs SMTP_URL and MAIL_FROM; `file` writes JSON messages to MAIL_DIR for
 * development and tests and is refused in production. Unset means recovery mail is off.
 */
export function parseMailEnvironment(env: NodeJS.ProcessEnv): MailConfiguration {
  const transport = env.MAIL_TRANSPORT ?? '';
  const from = env.MAIL_FROM ?? 'HUCEScholar <no-reply@localhost>';
  if (!transport) return { transport: 'disabled' };
  if (transport === 'file') {
    if (env.NODE_ENV === 'production')
      throw new Error('MAIL_TRANSPORT=file is for development and tests only.');
    const directory = env.MAIL_DIR ?? '';
    if (!isAbsolute(directory)) throw new Error('MAIL_DIR must be an absolute directory.');
    return { transport, directory, from };
  }
  if (transport === 'smtp') {
    let url: URL;
    try {
      url = new URL(env.SMTP_URL ?? '');
    } catch {
      throw new Error('SMTP_URL must be an smtp:// or smtps:// URL.');
    }
    if (!['smtp:', 'smtps:'].includes(url.protocol))
      throw new Error('SMTP_URL must be an smtp:// or smtps:// URL.');
    if (!env.MAIL_FROM) throw new Error('MAIL_FROM is required with MAIL_TRANSPORT=smtp.');
    return { transport, url: url.href, from: env.MAIL_FROM };
  }
  throw new Error('MAIL_TRANSPORT must be smtp, file or unset.');
}

@Injectable()
export class Mailer {
  private readonly config = parseMailEnvironment(process.env);
  private smtp?: Transporter;
  get enabled() {
    return this.config.transport !== 'disabled';
  }
  /** Throws a generic error; SMTP diagnostics can contain hosts and credentials. */
  async send(mail: Mail) {
    const config = this.config;
    if (config.transport === 'disabled') throw new Error('Mail is not configured.');
    try {
      if (config.transport === 'file') {
        await mkdir(config.directory, { recursive: true, mode: 0o700 });
        const name = `${Date.now()}-${randomBytes(4).toString('hex')}.json`;
        await writeFile(
          join(config.directory, name),
          JSON.stringify({ from: config.from, ...mail }),
          { mode: 0o600 },
        );
        return;
      }
      this.smtp ??= createTransport({
        url: config.url,
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 20_000,
      });
      await this.smtp.sendMail({ from: config.from, ...mail });
    } catch {
      Logger.warn('Mail delivery failed.', 'Mail');
      throw new Error('Mail delivery failed.');
    }
  }
}
