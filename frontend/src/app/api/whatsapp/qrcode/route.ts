import { NextResponse } from "next/server";

const SCRAPER_API_URL = process.env.SCRAPER_API_URL || "http://localhost:8000";

export async function GET() {
  try {
    const response = await fetch(`${SCRAPER_API_URL}/api/whatsapp/qrcode`);
    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch {
    return NextResponse.json(
      { error: "Backend não disponível para gerar QR Code." },
      { status: 503 }
    );
  }
}
