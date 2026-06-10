import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    supabase_connected: !!(process.env.SUPABASE_URL && process.env.SUPABASE_KEY),
    browser_ready: false,
    mode: "vercel",
  });
}
