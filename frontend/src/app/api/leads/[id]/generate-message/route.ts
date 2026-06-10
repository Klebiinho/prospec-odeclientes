import { NextRequest, NextResponse } from "next/server";

const SCRAPER_API_URL = process.env.SCRAPER_API_URL || "http://localhost:8000";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const response = await fetch(
      `${SCRAPER_API_URL}/api/leads/${id}/generate-message`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }
    );
    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch {
    return NextResponse.json(
      {
        detail:
          "Backend não disponível. O servidor Python precisa estar rodando para gerar mensagens com IA.",
      },
      { status: 503 }
    );
  }
}
