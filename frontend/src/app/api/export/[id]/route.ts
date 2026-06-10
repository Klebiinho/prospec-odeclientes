import { NextRequest, NextResponse } from "next/server";

const SCRAPER_API_URL = process.env.SCRAPER_API_URL || "http://localhost:8000";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const response = await fetch(`${SCRAPER_API_URL}/api/export/${id}`);

    if (!response.ok) {
      return NextResponse.json(
        { detail: "Erro ao exportar CSV" },
        { status: response.status }
      );
    }

    const csvContent = await response.text();
    const headers = new Headers();
    const contentDisposition = response.headers.get("content-disposition");
    if (contentDisposition) {
      headers.set("Content-Disposition", contentDisposition);
    }
    headers.set("Content-Type", "text/csv");

    return new NextResponse(csvContent, { status: 200, headers });
  } catch {
    return NextResponse.json(
      {
        detail:
          "Backend não disponível. O servidor Python precisa estar rodando para exportar CSV.",
      },
      { status: 503 }
    );
  }
}
