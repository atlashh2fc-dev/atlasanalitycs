/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: { serverActions: { bodySizeLimit: "10mb" } },
  async rewrites() {
    return [{ source: "/administracion", destination: "/mantenedor" }];
  },
};

export default nextConfig;
