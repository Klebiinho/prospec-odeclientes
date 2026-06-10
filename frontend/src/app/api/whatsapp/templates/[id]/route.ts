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
      .from("message_templates")
      .delete()
      .eq("id", id)
      .select();

    if (error) throw error;
    if (!data || data.length === 0) {
      return NextResponse.json(
        { detail: "Template não encontrado" },
        { status: 404 }
      );
    }

    return NextResponse.json({ message: "Template deletado com sucesso" });
  } catch (error) {
    console.error("Template delete error:", error);
    return NextResponse.json(
      { detail: "Erro ao deletar template" },
      { status: 500 }
    );
  }
}
