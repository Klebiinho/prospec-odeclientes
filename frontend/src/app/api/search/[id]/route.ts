import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/lib/supabase";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = getSupabaseClient();

    // Get search
    const { data: searchData, error: searchError } = await supabase
      .from("searches")
      .select("*")
      .eq("id", id)
      .single();

    if (searchError || !searchData) {
      return NextResponse.json(
        { detail: "Search not found" },
        { status: 404 }
      );
    }

    // Get leads
    const { data: leadsData } = await supabase
      .from("leads")
      .select("*")
      .eq("search_id", id)
      .order("created_at", { ascending: false });

    return NextResponse.json({
      search: searchData,
      leads: leadsData || [],
    });
  } catch (error) {
    console.error("Search detail error:", error);
    return NextResponse.json(
      { detail: "Erro ao buscar detalhes da pesquisa" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = getSupabaseClient();

    // Delete leads first (if no cascade)
    await supabase.from("leads").delete().eq("search_id", id);

    // Delete search
    const { data, error } = await supabase
      .from("searches")
      .delete()
      .eq("id", id)
      .select();

    if (error) throw error;
    if (!data || data.length === 0) {
      return NextResponse.json(
        { detail: "Search not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      message: "Search and leads deleted successfully",
    });
  } catch (error) {
    console.error("Search delete error:", error);
    return NextResponse.json(
      { detail: "Erro ao deletar pesquisa" },
      { status: 500 }
    );
  }
}
