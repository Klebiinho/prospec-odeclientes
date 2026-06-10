import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // API routes are now handled by Next.js API route handlers in src/app/api/
  // No rewrites needed - routes query Supabase directly for reads,
  // and proxy to SCRAPER_API_URL for heavy operations (scraping, WhatsApp, TTS)
};

export default nextConfig;
