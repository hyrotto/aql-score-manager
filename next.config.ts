import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 開発時のローカルIP接続におけるHMRエラーを解消するため allowedDevOrigins を指定 (TS型定義エラー回避のためキャスト)
  ...({
    allowedDevOrigins: ["192.168.1.26", "131.206.228.248", "localhost"],
  } as any),
};

export default nextConfig;
