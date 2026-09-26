// POST { ride: RideInput, dry_run?: boolean, override?: boolean }
// Customer request (mode "request") or driver quick-add (mode "quick_add").
// dry_run returns the price estimate and availability without booking.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/http.ts";
import { route } from "../_shared/routing.ts";
import { createRide, InputError, validate, type Neighbours } from "../_shared/rideCreate.ts";

const url = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const osrmUrl = Deno.env.get("OSRM_URL") ?? undefined;

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return json({ error: "UNAUTHENTICATED" }, 401);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "BAD_JSON" }, 400);
  }

  try {
    const input = validate(body.ride);
    const result = await createRide(
      {
        route: (a, b) => route(a, b, { baseUrl: osrmUrl }),
        defaultDriverId: async () => {
          const { data } = await admin.rpc("default_driver_id");
          return (data as string | null) ?? null;
        },
        neighbours: async (driverId, pickupAt) => {
          const { data, error } = await admin.rpc("ride_neighbours", {
            p_driver: driverId,
            p_pickup_at: pickupAt,
          });
          if (error) throw error;
          return data as Neighbours;
        },
        createRide: async ({ actor, ride, travel, dryRun, override }) => {
          const { data, error } = await admin.rpc("create_ride", {
            p_actor: actor,
            p_ride: ride,
            p_travel: travel,
            p_dry_run: dryRun,
            p_override: override,
          });
          if (error) throw error;
          return data as Record<string, unknown>;
        },
      },
      userData.user.id,
      input,
      { dryRun: body.dry_run === true, override: body.override === true },
    );
    return json(result, 200);
  } catch (e) {
    if (e instanceof InputError) return json({ error: "BAD_INPUT", message: e.message }, 400);
    // Business errors raised by the database carry a short code as message (FORBIDDEN, NOT_CONFIGURED...)
    const message = (e as { message?: string })?.message ?? "";
    if (/^[A-Z_]+$/.test(message)) return json({ error: message }, message === "FORBIDDEN" ? 403 : 400);
    console.error("ride-create failed", e);
    return json({ error: "INTERNAL" }, 500);
  }
});
