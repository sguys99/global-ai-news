import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // better-sqlite3는 네이티브 모듈이므로 서버 번들에 포함하지 않고 외부 패키지로 처리한다.
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
