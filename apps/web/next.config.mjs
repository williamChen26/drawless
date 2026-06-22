/**
 * Next.js 配置对象的类型提示。
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  // 本地有 next dev 常驻时，可用 NEXT_DIST_DIR 指向临时目录，避免 next build 与 dev server 争用 .next。
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  transpilePackages: ["@drawless/ui"]
};

export default nextConfig;
