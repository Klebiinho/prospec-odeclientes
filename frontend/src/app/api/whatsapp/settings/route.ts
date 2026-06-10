import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/lib/supabase";

export async function GET() {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("whatsapp_settings")
      .select("*")
      .limit(1);

    if (error) {
      console.error("WhatsApp settings error:", error);
      return NextResponse.json(null, { status: 200 });
    }

    if (data && data.length > 0) {
      return NextResponse.json(data[0]);
    }
    return NextResponse.json(null, { status: 200 });
  } catch (error) {
    console.error("WhatsApp settings API error:", error);
    return NextResponse.json(null, { status: 200 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();
    const body = await request.json();

    // Check if settings already exist
    const { data: existing } = await supabase
      .from("whatsapp_settings")
      .select("id")
      .limit(1);

    if (existing && existing.length > 0) {
      // Update
      const { data, error } = await supabase
        .from("whatsapp_settings")
        .update({
          url: body.url,
          global_api_key: body.global_api_key,
          instance_name: body.instance_name,
          auto_approve_messages: body.auto_approve_messages || false,
          kokoro_voice: body.kokoro_voice || "pf_dora",
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing[0].id)
        .select()
        .single();

      if (error) throw error;
      return NextResponse.json(data);
    } else {
      // Insert
      const { data, error } = await supabase
        .from("whatsapp_settings")
        .insert({
          url: body.url,
          global_api_key: body.global_api_key,
          instance_name: body.instance_name,
          auto_approve_messages: body.auto_approve_messages || false,
          kokoro_voice: body.kokoro_voice || "pf_dora",
        })
        .select()
        .single();

      if (error) throw error;
      return NextResponse.json(data);
    }
  } catch (error) {
    console.error("WhatsApp settings save error:", error);
    return NextResponse.json(
      { detail: "Erro ao salvar configurações" },
      { status: 500 }
    );
  }
}
