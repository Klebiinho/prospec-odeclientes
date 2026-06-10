import { NextResponse } from "next/server";

const SCRAPER_API_URL = process.env.SCRAPER_API_URL || "http://localhost:8000";

export async function POST() {
  try {
    const response = await fetch(`${SCRAPER_API_URL}/api/whatsapp/logout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch {
    return NextResponse.json(
      { detail: "Backend não disponível para logout." },
      { status: 503 }
    );
  }
}
