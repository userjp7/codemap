/** @type {import('next').NextConfig} */
const nextConfig = {
  // Disable StrictMode to prevent double effect invocation in development,
  // which was causing the ELK layout to be overwritten by a second effect run.
  reactStrictMode: false,
};

export default nextConfig;
