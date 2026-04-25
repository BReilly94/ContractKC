/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@ckb/ui-kit', '@ckb/domain', '@ckb/shared'],
  env: {
    NEXT_PUBLIC_AUTH_MODE: process.env.NEXT_PUBLIC_AUTH_MODE ?? 'local-dev',
  },
};

export default nextConfig;
