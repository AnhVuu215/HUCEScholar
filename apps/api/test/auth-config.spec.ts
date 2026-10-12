import { parseAuthEnvironment } from '../src/auth/auth.config';

const input = {
  DATABASE_URL: 'postgresql://localhost/hucescholar_test',
  REDIS_URL: 'redis://localhost:6379/15',
  APP_ORIGIN: 'http://127.0.0.1:3100',
  CSRF_SECRET: 'a'.repeat(64),
};

describe('authentication environment', () => {
  it('accepts explicit local configuration without leaking connection data', () => {
    expect(parseAuthEnvironment(input).origin).toBe(input.APP_ORIGIN);
  });
  it('trusts no proxies by default and accepts only explicit IP addresses', () => {
    expect(parseAuthEnvironment(input).trustedProxyIps).toEqual([]);
    expect(
      parseAuthEnvironment({ ...input, TRUSTED_PROXY_IPS: '127.0.0.1, ::1' }).trustedProxyIps,
    ).toEqual(['127.0.0.1', '::1']);
    for (const value of ['true', '1', 'loopback', '10.0.0.0/8', '*']) {
      expect(() => parseAuthEnvironment({ ...input, TRUSTED_PROXY_IPS: value })).toThrow(
        'TRUSTED_PROXY_IPS',
      );
    }
  });
  it.each(['DATABASE_URL', 'REDIS_URL', 'APP_ORIGIN', 'CSRF_SECRET'])('requires %s', (key) => {
    expect(() => parseAuthEnvironment({ ...input, [key]: '' })).toThrow(key);
  });
  it.each(['http://a.test/path', 'http://a.test/?x=1', 'http://user@a.test', 'not-url'])(
    'rejects malformed origin %s',
    (origin) => {
      expect(() => parseAuthEnvironment({ ...input, APP_ORIGIN: origin })).toThrow('APP_ORIGIN');
    },
  );
  it('requires HTTPS and uses secure host cookies in production', () => {
    expect(() => parseAuthEnvironment({ ...input, NODE_ENV: 'production' })).toThrow('HTTPS');
    expect(
      parseAuthEnvironment({
        ...input,
        NODE_ENV: 'production',
        APP_ORIGIN: 'https://school.example.test',
      }).secureCookies,
    ).toBe(true);
  });
  it('rejects an insufficient CSRF key and wrong service URL protocols', () => {
    expect(() => parseAuthEnvironment({ ...input, CSRF_SECRET: 'short' })).toThrow('CSRF_SECRET');
    expect(() => parseAuthEnvironment({ ...input, DATABASE_URL: 'http://localhost' })).toThrow(
      'DATABASE_URL',
    );
    expect(() => parseAuthEnvironment({ ...input, REDIS_URL: 'http://localhost' })).toThrow(
      'REDIS_URL',
    );
  });
});
