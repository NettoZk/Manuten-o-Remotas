/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: process.env.REMOTAS_E2E === "true" ? ".next-e2e" : process.env.REMOTAS_LOCAL_TESTS === "true" ? ".next-local" : ".next",
  images: {
    unoptimized: true,
  },
}

export default nextConfig
