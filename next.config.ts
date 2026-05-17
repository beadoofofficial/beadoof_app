import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  allowedDevOrigins: [
    "http://localhost:3000",
    "100.92.1.18",
    "oaf-lily-oozy.ngrok-free.dev",
  ],
};

export default nextConfig;
