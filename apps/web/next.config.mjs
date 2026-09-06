/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The gateway is the only backend origin the browser talks to. Proxying it
  // through the same host keeps cookies, CORS, and SSE simple in development.
  async rewrites() {
    const gateway = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
    return [{ source: '/api/:path*', destination: `${gateway}/api/:path*` }];
  },
};

export default nextConfig;
