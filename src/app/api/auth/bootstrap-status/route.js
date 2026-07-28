import {NextResponse} from "next/server";
import {createClient} from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function isMissingProfileTable(error) {
  const message = String(error?.message || error?.details || "").toLowerCase();
  return error?.code === "PGRST205" || message.includes("user_profiles") || message.includes("schema cache");
}

export async function GET() {
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json({allowRegistration: false, hasUsers: true, configured: false});
  }

  const key = supabaseServiceKey || supabaseAnonKey;
  const client = createClient(supabaseUrl, key, {
    auth: {persistSession: false, autoRefreshToken: false},
  });

  const {count, error} = await client
    .from("user_profiles")
    .select("id", {count: "exact", head: true});

  if (error) {
    if (isMissingProfileTable(error)) {
      return NextResponse.json({allowRegistration: true, hasUsers: false, missingSchema: true});
    }
    return NextResponse.json({allowRegistration: false, hasUsers: true, error: error.message}, {status: 200});
  }

  const hasUsers = Number(count || 0) > 0;
  return NextResponse.json({allowRegistration: !hasUsers, hasUsers});
}
