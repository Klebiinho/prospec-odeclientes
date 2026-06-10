import { NextResponse } from "next/server";

const SCRAPER_API_URL = process.env.SCRAPER_API_URL || "http://localhost:8000";

export async function GET() {
  try {
    const response = await fetch(`${SCRAPER_API_URL}/api/whatsapp/status`);
    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch {
    return NextResponse.json(
      { configured: false, status: { instance: { state: "close" } } },
      { status: 200 }
    );
  }
}
