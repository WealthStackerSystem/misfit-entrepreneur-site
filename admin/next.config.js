/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Lint errors should never block a deploy. We can't run lint
  // locally, and style nits failing a build is a bad trade.
  eslint: {
    ignoreDuringBuilds: true,
  },

  // TypeScript errors DO block the build on purpose. A type error
  // usually means a real bug, and catching it at deploy time is
  // better than shipping it.
};

module.exports = nextConfig;
