import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // O projeto usa Route Handlers dinâmicos autenticados e o runtime Node padrão.
  // Cache Components/Partial Prefetching conflitam com a segmentação atual dessas APIs.
};

export default nextConfig;
