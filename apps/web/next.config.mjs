const isCloud = process.env.NEXT_PUBLIC_FLOW_MODE === 'cloud';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // The workspace packages ship as untranspiled ESM with JSDoc types. Letting
  // Next compile them means the browser uses the same schemas, prompt library,
  // and template renderer as the services, rather than a second copy that can
  // drift.
  transpilePackages: ['@flow/shared', '@flow/llm'],
  // The gateway is the only backend origin the browser talks to. Proxying it
  // through the same host keeps cookies, CORS, and SSE simple in development.
  async rewrites() {
    // Cloud mode has no gateway: /api/* is served from browser storage, and
    // /api/execute is a route handler in this app.
    if (isCloud) return [];

    const gateway = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
    return [{ source: '/api/:path*', destination: `${gateway}/api/:path*` }];
  },
};

export default nextConfig;
