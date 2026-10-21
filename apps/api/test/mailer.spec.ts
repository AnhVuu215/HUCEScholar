import { createServer, type Server } from 'node:net';
import { Mailer, parseMailEnvironment } from '../src/auth/mailer';

describe('mail configuration', () => {
  it('is off unless configured, and refuses unsafe settings', () => {
    expect(parseMailEnvironment({})).toEqual({ transport: 'disabled' });
    expect(() =>
      parseMailEnvironment({ MAIL_TRANSPORT: 'file', MAIL_DIR: '/tmp/x', NODE_ENV: 'production' }),
    ).toThrow('development and tests only');
    expect(() => parseMailEnvironment({ MAIL_TRANSPORT: 'file', MAIL_DIR: 'relative' })).toThrow(
      'absolute',
    );
    expect(() =>
      parseMailEnvironment({ MAIL_TRANSPORT: 'smtp', SMTP_URL: 'http://x', MAIL_FROM: 'a@b' }),
    ).toThrow('smtp://');
    expect(() =>
      parseMailEnvironment({ MAIL_TRANSPORT: 'smtp', SMTP_URL: 'smtp://localhost:25' }),
    ).toThrow('MAIL_FROM');
    expect(() => parseMailEnvironment({ MAIL_TRANSPORT: 'sendgrid' })).toThrow('smtp, file');
  });
});

/** A minimal SMTP peer: enough of RFC 5321 to accept one message and record it. */
function fakeSmtp(received: string[]) {
  return createServer((socket) => {
    let data = false;
    let body = '';
    socket.write('220 fake ESMTP\r\n');
    socket.on('data', (chunk) => {
      for (const line of chunk.toString('utf8').split('\r\n')) {
        if (data) {
          if (line === '.') {
            data = false;
            received.push(body);
            socket.write('250 queued\r\n');
          } else body += `${line}\n`;
          continue;
        }
        if (!line) continue;
        const verb = line.slice(0, 4).toUpperCase();
        if (verb === 'EHLO' || verb === 'HELO') socket.write('250 fake\r\n');
        else if (verb === 'DATA') {
          data = true;
          socket.write('354 go ahead\r\n');
        } else if (verb === 'QUIT') socket.end('221 bye\r\n');
        else socket.write('250 ok\r\n');
      }
    });
  });
}

describe('SMTP delivery', () => {
  let server: Server;
  const received: string[] = [];
  const saved = { ...process.env };
  beforeAll(async () => {
    server = fakeSmtp(received);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  });
  afterAll(async () => {
    process.env = saved;
    await new Promise((resolve) => server.close(resolve));
  });
  it('speaks SMTP to the configured server with the configured sender', async () => {
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('No port.');
    Object.assign(process.env, {
      MAIL_TRANSPORT: 'smtp',
      SMTP_URL: `smtp://127.0.0.1:${address.port}?ignoreTLS=true`,
      MAIL_FROM: 'HUCEScholar <no-reply@example.test>',
    });
    const mailer = new Mailer();
    expect(mailer.enabled).toBe(true);
    await mailer.send({
      to: 'sinh-vien@example.test',
      subject: 'Đặt lại mật khẩu',
      text: 'Liên kết: http://127.0.0.1:3100/reset-password#token=abc',
    });
    expect(received).toHaveLength(1);
    expect(received[0]).toContain('To: sinh-vien@example.test');
    expect(received[0]).toContain('From: HUCEScholar <no-reply@example.test>');
  });
  it('reports a generic failure when the server is unreachable', async () => {
    Object.assign(process.env, {
      MAIL_TRANSPORT: 'smtp',
      SMTP_URL: 'smtp://127.0.0.1:1?ignoreTLS=true',
      MAIL_FROM: 'a@example.test',
    });
    await expect(
      new Mailer().send({ to: 'x@example.test', subject: 's', text: 't' }),
    ).rejects.toThrow('Mail delivery failed.');
  });
});
