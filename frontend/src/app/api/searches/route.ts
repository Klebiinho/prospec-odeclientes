import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();
    const { searchParams } = new URL(request.url);

    const limit = parseInt(searchParams.get("limit") || "20");
    const offset = parseInt(searchParams.get("offset") || "0");

    const { data, error } = await supabase
      .from("searches")
      .select("*")
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error("Searches query error:", error);
      return NextResponse.json({ searches: [], count: 0 }, { status: 200 });
    }

    return NextResponse.json({
      searches: data || [],
      count: (data || []).length,
    });
  } catch (error) {
    console.error("Searches API error:", error);
    return NextResponse.json({ searches: [], count: 0 }, { status: 200 });
  }
}
