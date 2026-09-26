// POST (no body). Deletes the signed-in customer's account, as the app stores require.
// Open rides are cancelled, the contact is anonymized, past rides are kept without personal data.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/http.ts";

const url = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    auth: { persistSession: false },
  });
  const { data, error } = await userClient.auth.getUser();
  if (error || !data.user) return json({ error: "UNAUTHENTICATED" }, 401);

  const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", data.user.id);
  if (roles?.some((r) => r.role === "admin" || r.role === "driver")) {
    // The owner account holds the business; it must be handed over, not self-deleted.
    return json({ error: "STAFF_ACCOUNT" }, 400);
  }

  const { error: forgetError } = await admin.rpc("forget_customer", { p_user: data.user.id });
  if (forgetError) {
    console.error("forget_customer failed", forgetError);
    return json({ error: "INTERNAL" }, 500);
  }
  const { error: deleteError } = await admin.auth.admin.deleteUser(data.user.id);
  if (deleteError) {
    console.error("deleteUser failed", deleteError);
    return json({ error: "INTERNAL" }, 500);
  }
  return json({ ok: true });
});
