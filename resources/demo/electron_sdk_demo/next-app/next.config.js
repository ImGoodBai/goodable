/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow external packages in server components
  serverExternalPackages: ['@anthropic-ai/claude-agent-sdk'],
};

module.exports = nextConfig;
