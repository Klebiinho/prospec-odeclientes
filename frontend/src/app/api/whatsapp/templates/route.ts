import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/lib/supabase";

export async function GET() {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("message_templates")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Templates query error:", error);
      return NextResponse.json([], { status: 200 });
    }

    return NextResponse.json(data || []);
  } catch (error) {
    console.error("Templates API error:", error);
    return NextResponse.json([], { status: 200 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();
    const body = await request.json();

    const { data, error } = await supabase
      .from("message_templates")
      .insert({
        title: body.title,
        content: body.content,
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json(data);
  } catch (error) {
    console.error("Template create error:", error);
    return NextResponse.json(
      { detail: "Erro ao criar template" },
      { status: 500 }
    );
  }
}
