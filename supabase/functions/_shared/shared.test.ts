import { describe, expect, it, vi } from "vitest";
import { fallbackRoute, route, straightLineMeters } from "./routing.ts";
import { createRide, InputError, validate, type Deps } from "./rideCreate.ts";
import { knownKinds, messageFor } from "./messages.ts";

const louvre = { lat: 48.8606, lng: 2.3376, address: "Louvre" };
const arc = { lat: 48.8738, lng: 2.295, address: "Arc de Triomphe" };
const okBody = (distance: number, duration: number) =>
  ({ ok: true, json: async () => ({ code: "Ok", routes: [{ distance, duration }] }) }) as Response;

describe("routing", () => {
  it("measures straight-line distance", () => {
    expect(Math.round(straightLineMeters(louvre, arc) / 100) / 10).toBeCloseTo(3.5, 0);
  });

  it("uses OSRM distance and duration", async () => {
    const fetchImpl = vi.fn(async () => okBody(4123.4, 901.6));
    const r = await route(louvre, arc, { fetchImpl: fetchImpl as unknown as typeof fetch, baseUrl: "http://osrm/" });
    expect(r).toEqual({ distance_m: 4123, duration_s: 902, estimated: false });
    expect(fetchImpl).toHaveBeenCalledWith(
      "http://osrm/route/v1/driving/2.3376,48.8606;2.295,48.8738?overview=false",
      expect.anything(),
    );
  });

  it("falls back when the server errors", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false }) as Response);
    const r = await route(louvre, arc, { fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(r).toEqual(fallbackRoute(louvre, arc));
    expect(r.estimated).toBe(true);
  });

  it("falls back when the network fails", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("offline");
    });
    const r = await route(louvre, arc, { fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(r.estimated).toBe(true);
  });

  it("falls back on an unexpected answer", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => ({ code: "NoRoute" }) }) as Response);
    expect((await route(louvre, arc, { fetchImpl: fetchImpl as unknown as typeof fetch })).estimated).toBe(true);
  });

  it("fallback is pessimistic: 30 km/h plus 15 minutes", () => {
    const r = fallbackRoute(louvre, arc);
    expect(r.duration_s).toBeGreaterThan(15 * 60);
  });
});

describe("validate", () => {
  const good = { pickup_at: "2030-01-01T10:00:00Z", pickup: louvre, dropoff: arc };

  it("accepts a minimal ride", () => {
    expect(validate(good).pickup.address).toBe("Louvre");
  });

  it.each([
    [null, "Body"],
    [{ ...good, pickup_at: "tomorrow" }, "pickup_at"],
    [{ ...good, pickup: { lat: 1, lng: 2 } }, "pickup"],
    [{ ...good, dropoff: { ...arc, lat: 123 } }, "out of range"],
    [{ ...good, passengers: -1 }, "passengers"],
    [{ ...good, luggage: 1.5 }, "luggage"],
    [{ ...good, vehicle: "bus" }, "vehicle"],
    [{ ...good, mode: "admin" }, "mode"],
    [{ ...good, agreed_price: -5 }, "agreed_price"],
    [{ ...good, customer_notes: "x".repeat(501) }, "customer_notes"],
  ])("rejects bad input %#", (body, msg) => {
    expect(() => validate(body)).toThrow(InputError);
    expect(() => validate(body)).toThrow(msg);
  });
});

describe("createRide", () => {
  const deps = (overrides: Partial<Deps> = {}): Deps => ({
    route: vi.fn(async () => ({ distance_m: 4000, duration_s: 900, estimated: false })),
    defaultDriverId: vi.fn(async () => "driver-1"),
    neighbours: vi.fn(async () => ({ prev: null, next: null })),
    createRide: vi.fn(async () => ({ ok: true, ride_id: "ride-1" })),
    ...overrides,
  });
  const input = validate({ pickup_at: "2030-01-01T10:00:00Z", pickup: louvre, dropoff: arc });

  it("books with the road distance and no neighbours", async () => {
    const d = deps();
    const res = await createRide(d, "user-1", input);
    expect(res).toMatchObject({ ok: true, ride_id: "ride-1", distance_m: 4000, route_estimated: false });
    expect(d.route).toHaveBeenCalledTimes(1);
    expect(d.createRide).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: "user-1",
        dryRun: false,
        override: false,
        ride: expect.objectContaining({ mode: "request", driver_id: "driver-1", distance_m: 4000, passengers: 1 }),
        travel: { prev_id: undefined, prev_s: undefined, next_id: undefined, next_s: undefined },
      }),
    );
  });

  it("computes road time from the previous drop-off and to the next pickup", async () => {
    const route = vi
      .fn()
      .mockResolvedValueOnce({ distance_m: 4000, duration_s: 900, estimated: false })
      .mockResolvedValueOnce({ distance_m: 2000, duration_s: 600, estimated: false })
      .mockResolvedValueOnce({ distance_m: 3000, duration_s: 700, estimated: false });
    const d = deps({
      route,
      neighbours: vi.fn(async () => ({
        prev: { id: "p", lat: 48.85, lng: 2.35, end_at: "2030-01-01T09:00:00Z" },
        next: { id: "n", lat: 48.9, lng: 2.3, pickup_at: "2030-01-01T12:00:00Z" },
      })),
    });
    await createRide(d, "user-1", input, { dryRun: true });
    expect(route).toHaveBeenNthCalledWith(2, { lat: 48.85, lng: 2.35 }, louvre);
    expect(route).toHaveBeenNthCalledWith(3, arc, { lat: 48.9, lng: 2.3 });
    expect(d.createRide).toHaveBeenCalledWith(
      expect.objectContaining({ dryRun: true, travel: { prev_id: "p", prev_s: 600, next_id: "n", next_s: 700 } }),
    );
  });

  it("reports when no driver is set up", async () => {
    const d = deps({ defaultDriverId: vi.fn(async () => null) });
    expect(await createRide(d, "user-1", input)).toEqual({ ok: false, errors: ["NO_DRIVER"], warnings: [] });
    expect(d.createRide).not.toHaveBeenCalled();
  });

  it("passes the driver's override flag through", async () => {
    const d = deps();
    await createRide(d, "u", { ...input, mode: "quick_add", contact_id: "c" }, { override: true });
    expect(d.createRide).toHaveBeenCalledWith(expect.objectContaining({ override: true }));
  });
});

describe("messages", () => {
  it("has French and English text for every kind", () => {
    for (const kind of knownKinds) {
      expect(messageFor(kind, "fr", { price: 30, final_price: 30 })).not.toMatch(/undefined/);
      expect(messageFor(kind, "en", { price: 30, final_price: 30 })).not.toMatch(/undefined/);
    }
  });

  it("falls back for unknown kinds and languages", () => {
    expect(messageFor("something_new", "de")).toBe("Mise à jour de votre course");
    expect(messageFor("price_proposed", "en", { price: 42 })).toContain("€42");
  });
});
