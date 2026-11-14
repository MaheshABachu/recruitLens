import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// Turns job-alert emails off for the account that owns an unsubscribe token
// (alert_preferences.unsubscribe_token). No login: the token in the email is
// the credential. MUST be deployed with verify_jwt: false
// (`supabase functions deploy alerts-unsubscribe --no-verify-jwt`).
//
// Two callers, both POST (a GET never unsubscribes, so link scanners and
// prefetchers can't trigger it):
//   - mail clients' one-click unsubscribe (RFC 8058, List-Unsubscribe-Post),
//     token in the query string: POST /alerts-unsubscribe?token=<uuid>
//   - the app's /unsubscribe page (src/components/alerts/UnsubscribePage.tsx),
//     token in the JSON body: { "token": "<uuid>" }

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let token = new URL(req.url).searchParams.get("token");
  if (!token && (req.headers.get("Content-Type") ?? "").includes("application/json")) {
    try {
      const body = await req.json();
      if (typeof body?.token === "string") token = body.token;
    } catch {
      // Fall through to the missing-token response.
    }
  }
  if (!token || !UUID.test(token)) return json({ error: "Invalid unsubscribe link" }, 400);

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  const { data, error } = await supabase
    .from("alert_preferences")
    .update({ email_enabled: false })
    .eq("unsubscribe_token", token)
    .select("user_id");
  if (error) {
    console.error("Unsubscribe failed:", error);
    return json({ error: "Couldn't unsubscribe. Try again." }, 500);
  }
  if (!data || data.length === 0) return json({ error: "This unsubscribe link isn't valid anymore." }, 404);
  return json({ unsubscribed: true });
});
