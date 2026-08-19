import type { NextConfig } from "next";

const defaultAllowedDevOrigins = [
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "*.ngrok-free.app",
  "*.ngrok.app",
  "*.ngrok.io",
];

const allowedDevOrigins = Array.from(
  new Set(
    [
      ...(process.env.ALLOWED_DEV_ORIGINS ?? "")
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean),
      ...defaultAllowedDevOrigins,
    ],
  ),
);

const nextConfig: NextConfig = {
  allowedDevOrigins,
};

export default nextConfig;
