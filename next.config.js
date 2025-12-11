/** @type {import('next').NextConfig} */
const path = require('path');

const projectsDirRaw = process.env.PROJECTS_DIR || './data/projects';
const projectsDirAbsolute = path.isAbsolute(projectsDirRaw)
  ? path.resolve(projectsDirRaw)
  : path.resolve(process.cwd(), projectsDirRaw);
const nextConfig = {
  output: 'standalone',
  outputFileTracingRoot: path.join(__dirname),
  reactStrictMode: true,
  typescript: {
    ignoreBuildErrors: false,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  productionBrowserSourceMaps: false,
  // Disable critters optimizeCss to avoid missing module during build
  experimental: {
    optimizeCss: false,
    scrollRestoration: true,
  },
  // Reduce logging noise
  logging: {
    fetches: {
      fullUrl: false,
    },
  },
  // Inject project root path as environment variable
  env: {
    NEXT_PUBLIC_PROJECT_ROOT: process.cwd(),
    NEXT_PUBLIC_PROJECTS_DIR_ABSOLUTE: projectsDirAbsolute,
  },
  // Add webpack configuration to handle server-side code properly
  webpack: (config, { isServer, dev }) => {
    // Use memory cache for faster builds
    if (dev) {
      config.cache = {
        type: 'memory',
      };
    }

    if (!isServer) {
      // Exclude server-only modules from client bundle
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        os: false,
      };
    }
    return config;
  },
};

module.exports = nextConfig;
