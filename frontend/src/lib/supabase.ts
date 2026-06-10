import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_KEY || "";

export function getSupabaseClient() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error("SUPABASE_URL and SUPABASE_KEY environment variables are required");
  }
  return createClient(SUPABASE_URL, SUPABASE_KEY);
}
