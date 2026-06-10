import { NextRequest, NextResponse } from "next/server";

const SCRAPER_API_URL = process.env.SCRAPER_API_URL || "http://localhost:8000";

async function proxyToBackend(
  path: string,
  method: string,
  body?: unknown
): Promise<NextResponse> {
  try {
    const fetchOptions: RequestInit = {
      method,
      headers: { "Content-Type": "application/json" },
    };
    if (body) {
      fetchOptions.body = JSON.stringify(body);
    }

    const response = await fetch(`${SCRAPER_API_URL}${path}`, fetchOptions);
    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch {
    return NextResponse.json(
      {
        detail:
          "Backend de scraping não disponível. O servidor Python (FastAPI) precisa estar rodando para esta operação.",
      },
      { status: 503 }
    );
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  return proxyToBackend("/api/search", "POST", body);
}
