import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    "localhost",
    "127.0.0.1",
    "0.0.0.0",
    "8504-24-152-148-2.ngrok-free.app",
    "*.ngrok-free.app",
    "*.ngrok.app",
  ],
};

export default nextConfig;
