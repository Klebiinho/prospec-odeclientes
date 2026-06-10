import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();
    const { searchParams } = new URL(request.url);

    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = parseInt(searchParams.get("offset") || "0");
    const searchId = searchParams.get("search_id");
    const search = searchParams.get("search");

    let query = supabase.from("leads").select("*");

    if (searchId) {
      query = query.eq("search_id", searchId);
    }

    if (search) {
      query = query.or(
        `name.ilike.%${search}%,address.ilike.%${search}%,phone.ilike.%${search}%`
      );
    }

    const { data, error } = await query
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error("Leads query error:", error);
      return NextResponse.json({ leads: [], count: 0 }, { status: 200 });
    }

    return NextResponse.json({
      leads: data || [],
      count: (data || []).length,
    });
  } catch (error) {
    console.error("Leads API error:", error);
    return NextResponse.json({ leads: [], count: 0 }, { status: 200 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();
    const body = await request.json();

    const leadData = {
      name: body.name,
      phone: body.phone || "",
      address: body.address || "",
      website: body.website || "",
      category: body.category || "",
      search_id: body.search_id || null,
      contacted: false,
      contacted_at: null,
    };

    const { data, error } = await supabase
      .from("leads")
      .insert(leadData)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json(data);
  } catch (error) {
    console.error("Lead create error:", error);
    return NextResponse.json(
      { detail: "Erro ao criar lead" },
      { status: 500 }
    );
  }
}

