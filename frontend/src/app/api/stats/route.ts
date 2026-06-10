import { NextResponse } from "next/server";
import { getSupabaseClient } from "@/lib/supabase";

export async function GET() {
  try {
    const supabase = getSupabaseClient();

    // Total leads
    const { count: totalLeads } = await supabase
      .from("leads")
      .select("id", { count: "exact", head: true });

    // Total searches
    const { count: totalSearches } = await supabase
      .from("searches")
      .select("id", { count: "exact", head: true });

    // Leads with phone
    const { count: leadsWithPhone } = await supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .neq("phone", "");

    // Leads with address
    const { count: leadsWithAddress } = await supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .neq("address", "");

    return NextResponse.json({
      total_leads: totalLeads || 0,
      total_searches: totalSearches || 0,
      leads_with_phone: leadsWithPhone || 0,
      leads_with_address: leadsWithAddress || 0,
    });
  } catch (error) {
    console.error("Stats API error:", error);
    return NextResponse.json(
      { total_leads: 0, total_searches: 0, leads_with_phone: 0, leads_with_address: 0 },
      { status: 200 }
    );
  }
}
