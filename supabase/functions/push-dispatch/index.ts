// Sends pending notifications as phone push messages through Expo's free push service.
// Call it every minute (see README, "Push notifications"). Protected by PUSH_DISPATCH_SECRET.

import { createClient } from "npm:@supabase/supabase-js@2";
import { json } from "../_shared/http.ts";
import { messageFor } from "../_shared/messages.ts";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});
const secret = Deno.env.get("PUSH_DISPATCH_SECRET");

type Row = {
  id: number;
  recipient_id: string;
  ride_id: string | null;
  kind: string;
  payload: Record<string, unknown>;
};

Deno.serve(async (req) => {
  if (!secret || req.headers.get("x-dispatch-secret") !== secret) return json({ error: "FORBIDDEN" }, 403);

  const { data: rows, error } = await admin
    .from("notifications")
    .select("id, recipient_id, ride_id, kind, payload")
    .is("pushed_at", null)
    .order("created_at")
    .limit(200);
  if (error) return json({ error: error.message }, 500);
  if (!rows?.length) return json({ sent: 0 });

  const recipients = [...new Set(rows.map((r: Row) => r.recipient_id))];
  const [{ data: tokens }, { data: profiles }] = await Promise.all([
    admin.from("push_tokens").select("token, profile_id").in("profile_id", recipients),
    admin.from("profiles").select("id, language").in("id", recipients),
  ]);
  const lang = new Map((profiles ?? []).map((p) => [p.id, p.language]));

  const messages = (rows as Row[]).flatMap((n) =>
    (tokens ?? [])
      .filter((t) => t.profile_id === n.recipient_id)
      .map((t) => ({
        to: t.token,
        title: "Taxi",
        body: messageFor(n.kind, lang.get(n.recipient_id) ?? "fr", n.payload),
        data: { ride_id: n.ride_id, kind: n.kind },
      })),
  );

  // Expo accepts up to 100 messages per request.
  for (let i = 0; i < messages.length; i += 100) {
    const res = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(messages.slice(i, i + 100)),
    });
    if (!res.ok) return json({ error: `expo push ${res.status}` }, 502);
  }

  // Mark as pushed, including notifications for people without a phone token (they see them in the app).
  await admin
    .from("notifications")
    .update({ pushed_at: new Date().toISOString() })
    .in("id", rows.map((r: Row) => r.id));
  return json({ sent: messages.length, notifications: rows.length });
});
