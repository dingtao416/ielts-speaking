import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // 开发模式下允许局域网设备（手机）访问 dev 资源。
  // 手机通过 http://<电脑IP>:3000 访问时，Next.js 默认拦截跨域 JS。
  // 这里放行常见局域网来源 + localhost。
  allowedDevOrigins: [
    "localhost",
    "127.0.0.1",
    "10.1.1.235",
  ],
};

export default nextConfig;
