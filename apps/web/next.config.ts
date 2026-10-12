import type { NextConfig } from 'next';

// Rewrites are evaluated during build; set this before `pnpm build` for another API origin.
const target = new URL(process.env.API_PROXY_TARGET ?? 'http://127.0.0.1:3001');
if (
  !['http:', 'https:'].includes(target.protocol) ||
  target.username ||
  target.password ||
  target.pathname !== '/' ||
  target.search ||
  target.hash
) {
  throw new Error('API_PROXY_TARGET must be an HTTP(S) origin without credentials, path or query.');
}

const config: NextConfig = {
  poweredByHeader: false,
  devIndicators: false,
  experimental: { proxyClientMaxBodySize: '50mb', proxyTimeout: 120_000 },
  async headers() {
    return [
      {
        source: '/workspace/:path*',
        headers: [{ key: 'Cache-Control', value: 'private, no-store' }],
      },
    ];
  },
  async rewrites() {
    return [{ source: '/api/v1/:path*', destination: `${target.origin}/api/v1/:path*` }];
  },
};

export default config;
