// Orchestrates a booking: validate input, get road times, then let the database decide.
// Kept free of Deno/Supabase imports so it can be unit-tested with vitest.

import { type Point, type Route } from "./routing.ts";

export type RideInput = {
  mode?: "request" | "quick_add";
  driver_id?: string;
  contact_id?: string;
  source?: "phone" | "whatsapp" | "in_person" | "other";
  pickup_at: string;
  pickup: Point & { address: string };
  dropoff: Point & { address: string };
  passengers?: number;
  luggage?: number;
  vehicle?: "sedan" | "van";
  meet_greet?: boolean;
  travel_ref?: string;
  customer_notes?: string;
  agreed_price?: number;
};

export type Neighbours = {
  prev: { id: string; lat: number; lng: number; end_at: string } | null;
  next: { id: string; lat: number; lng: number; pickup_at: string } | null;
};

export type Deps = {
  route: (a: Point, b: Point) => Promise<Route>;
  defaultDriverId: () => Promise<string | null>;
  neighbours: (driverId: string, pickupAt: string) => Promise<Neighbours>;
  createRide: (args: {
    actor: string;
    ride: Record<string, unknown>;
    travel: Record<string, unknown>;
    dryRun: boolean;
    override: boolean;
  }) => Promise<Record<string, unknown>>;
};

export class InputError extends Error {}

const isNum = (v: unknown) => typeof v === "number" && Number.isFinite(v);

function checkPoint(p: unknown, name: string) {
  const pt = p as Record<string, unknown> | undefined;
  if (!pt || !isNum(pt.lat) || !isNum(pt.lng) || typeof pt.address !== "string" || !pt.address.trim()) {
    throw new InputError(`${name} needs lat, lng and address`);
  }
  if ((pt.lat as number) < -90 || (pt.lat as number) > 90 || (pt.lng as number) < -180 || (pt.lng as number) > 180) {
    throw new InputError(`${name} coordinates out of range`);
  }
}

export function validate(body: unknown): RideInput {
  const b = body as Record<string, unknown> | null;
  if (!b || typeof b !== "object") throw new InputError("Body must be a JSON object");
  if (typeof b.pickup_at !== "string" || Number.isNaN(Date.parse(b.pickup_at))) {
    throw new InputError("pickup_at must be an ISO date");
  }
  checkPoint(b.pickup, "pickup");
  checkPoint(b.dropoff, "dropoff");
  if (b.mode !== undefined && b.mode !== "request" && b.mode !== "quick_add") throw new InputError("bad mode");
  for (const k of ["passengers", "luggage"] as const) {
    if (b[k] !== undefined && (!Number.isInteger(b[k]) || (b[k] as number) < 0 || (b[k] as number) > 50)) {
      throw new InputError(`${k} must be a small whole number`);
    }
  }
  if (b.vehicle !== undefined && b.vehicle !== "sedan" && b.vehicle !== "van") throw new InputError("bad vehicle");
  if (b.agreed_price !== undefined && (!isNum(b.agreed_price) || (b.agreed_price as number) < 0)) {
    throw new InputError("bad agreed_price");
  }
  for (const k of ["travel_ref", "customer_notes"] as const) {
    if (b[k] !== undefined && (typeof b[k] !== "string" || (b[k] as string).length > 500)) {
      throw new InputError(`${k} must be text under 500 characters`);
    }
  }
  return b as unknown as RideInput;
}

export async function createRide(
  deps: Deps,
  actor: string,
  input: RideInput,
  opts: { dryRun?: boolean; override?: boolean } = {},
) {
  const driverId = input.driver_id ?? (await deps.defaultDriverId());
  if (!driverId) return { ok: false, errors: ["NO_DRIVER"], warnings: [] };

  // The ride itself, and road time to/from the neighbouring rides, in parallel.
  const nb = await deps.neighbours(driverId, input.pickup_at);
  const [main, fromPrev, toNext] = await Promise.all([
    deps.route(input.pickup, input.dropoff),
    nb.prev ? deps.route({ lat: nb.prev.lat, lng: nb.prev.lng }, input.pickup) : null,
    nb.next ? deps.route(input.dropoff, { lat: nb.next.lat, lng: nb.next.lng }) : null,
  ]);

  const ride = {
    mode: input.mode ?? "request",
    driver_id: driverId,
    contact_id: input.contact_id,
    source: input.source,
    pickup_at: input.pickup_at,
    pickup_address: input.pickup.address.trim(),
    pickup_lat: input.pickup.lat,
    pickup_lng: input.pickup.lng,
    dropoff_address: input.dropoff.address.trim(),
    dropoff_lat: input.dropoff.lat,
    dropoff_lng: input.dropoff.lng,
    distance_m: main.distance_m,
    duration_s: main.duration_s,
    passengers: input.passengers ?? 1,
    luggage: input.luggage ?? 0,
    vehicle: input.vehicle ?? "sedan",
    meet_greet: input.meet_greet ?? false,
    travel_ref: input.travel_ref,
    customer_notes: input.customer_notes,
    agreed_price: input.agreed_price,
  };
  const travel = {
    prev_id: nb.prev?.id,
    prev_s: fromPrev?.duration_s,
    next_id: nb.next?.id,
    next_s: toNext?.duration_s,
  };

  const result = await deps.createRide({
    actor,
    ride,
    travel,
    dryRun: opts.dryRun ?? false,
    override: opts.override ?? false,
  });
  return {
    ...result,
    distance_m: main.distance_m,
    duration_s: main.duration_s,
    route_estimated: main.estimated,
  };
}
