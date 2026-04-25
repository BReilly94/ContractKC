/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@ckb/ui-kit', '@ckb/domain', '@ckb/shared'],
  env: {
    // Empty string → browser calls go to relative /api/* paths, which Next.js
    // proxies server-side to the API. Works in Codespaces and local dev alike.
    NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL ?? '',
    NEXT_PUBLIC_AUTH_MODE: process.env.NEXT_PUBLIC_AUTH_MODE ?? 'local-dev',
  },
};

export default nextConfig;
