import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/lib/supabase";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from("leads")
      .delete()
      .eq("id", id)
      .select();

    if (error) throw error;
    if (!data || data.length === 0) {
      return NextResponse.json(
        { detail: "Lead não encontrado" },
        { status: 404 }
      );
    }

    return NextResponse.json({ message: "Lead deleted successfully" });
  } catch (error) {
    console.error("Lead delete error:", error);
    return NextResponse.json(
      { detail: "Erro ao deletar lead" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = getSupabaseClient();
    const body = await request.json();

    const updateData: Record<string, unknown> = {};
    if (body.contacted !== undefined) {
      updateData.contacted = body.contacted;
      updateData.contacted_at = body.contacted
        ? new Date().toISOString()
        : null;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { detail: "Nenhum campo para atualizar informado." },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("leads")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json(data);
  } catch (error) {
    console.error("Lead update error:", error);
    return NextResponse.json(
      { detail: "Erro ao atualizar lead" },
      { status: 500 }
    );
  }
}
