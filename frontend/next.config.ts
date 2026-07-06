import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  /** Reduce el JS generado al importar solo los iconos usados de lucide-react */
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
  /**
   * Next 16 + Turbopack a veces infiere mal la raíz (p. ej. .../app) con `src/app`.
   * Fija la raíz al directorio del repo para que resuelva `next/package.json` bien.
   */
  turbopack: {
    root: path.resolve(process.cwd()),
  },
};

export default nextConfig;
