import type { NextConfig } from "next";

// 前端指向哪个后端在 build 时固化进产物（手册 21.6），部署时用构建命令注入 BACKEND_URL
const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8000";

const nextConfig: NextConfig = {
  output: "standalone",
  typedRoutes: true,
  async rewrites() {
    // 同源代理 /api/* → FastAPI，避免 CORS，浏览器里不出现后端地址
    return [{ source: "/api/:path*", destination: `${BACKEND_URL}/api/:path*` }];
  },
};

export default nextConfig;
