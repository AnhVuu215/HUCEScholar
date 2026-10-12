import { isIP } from 'node:net';

export const AUTH_CONFIG = Symbol('AUTH_CONFIG');

export interface AuthConfiguration {
  databaseUrl: string;
  redisUrl: string;
  origin: string;
  csrfSecret: string;
  secureCookies: boolean;
  sessionCookie: string;
  csrfCookie: string;
  trustedProxyIps: string[];
}

export function parseAuthEnvironment(env: NodeJS.ProcessEnv): AuthConfiguration {
  function serviceUrl(key: string, protocols: string[]): string {
    try {
      const value = env[key] ?? '';
      const url = new URL(value);
      if (!protocols.includes(url.protocol) || !url.hostname) throw new Error();
      return value;
    } catch {
      throw new Error(`${key} must be a valid service connection URL.`);
    }
  }

  let origin: URL;
  try {
    origin = new URL(env.APP_ORIGIN ?? '');
    if (
      !['http:', 'https:'].includes(origin.protocol) ||
      origin.username ||
      origin.password ||
      origin.pathname !== '/' ||
      origin.search ||
      origin.hash
    )
      throw new Error();
  } catch {
    throw new Error('APP_ORIGIN must be an HTTP(S) origin without path, credentials or query.');
  }

  const secureCookies = env.NODE_ENV === 'production';
  if (secureCookies && origin.protocol !== 'https:')
    throw new Error('APP_ORIGIN requires HTTPS in production.');
  const csrfSecret = env.CSRF_SECRET ?? '';
  if (!/^[a-f0-9]{64}$/i.test(csrfSecret))
    throw new Error('CSRF_SECRET must contain 32 random bytes encoded as 64 hex characters.');
  const trustedProxyIps = (env.TRUSTED_PROXY_IPS ?? '')
    .split(',')
    .map((ip) => ip.trim())
    .filter(Boolean);
  if (trustedProxyIps.some((ip) => !isIP(ip)))
    throw new Error(
      'TRUSTED_PROXY_IPS must be a comma-separated list of exact proxy IP addresses.',
    );

  return {
    databaseUrl: serviceUrl('DATABASE_URL', ['postgres:', 'postgresql:']),
    redisUrl: serviceUrl('REDIS_URL', ['redis:', 'rediss:']),
    origin: origin.origin,
    csrfSecret,
    secureCookies,
    sessionCookie: secureCookies ? '__Host-hs_session' : 'hs_session',
    csrfCookie: secureCookies ? '__Host-hs_csrf' : 'hs_csrf',
    trustedProxyIps,
  };
}
