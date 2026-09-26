# Taxi booking app

A booking app for an independent taxi / VTC driver. Customers book a ride from A to B and see the price. The driver accepts each request, can propose a different price, and adds rides that come in by phone or WhatsApp. A web back office manages rides, customers, prices and working hours.

Design: [docs/designs/taxi-booking-app.md](docs/designs/taxi-booking-app.md)

Everything is open source and free to run:

| Part | Tool |
|---|---|
| iPhone, Android and back-office website (one codebase) | [Expo](https://expo.dev) + Expo Router |
| Database, login, live updates, server functions, scheduled jobs | [Supabase](https://supabase.com) (self-hostable) |
| Address search | [Photon](https://photon.komoot.io) (OpenStreetMap) |
| Road distance and time | [OSRM](https://project-osrm.org) (OpenStreetMap) |
| Push notifications | Expo push service (free) |

## Project layout

```
apps/mobile/            Expo app: customer, driver and back office (src/app/admin, web only)
supabase/migrations/    Database: tables, rules, access control, scheduled jobs
supabase/functions/     Server functions: ride-create, delete-account, push-dispatch
supabase/tests/         Database tests (pgTAP)
supabase/seed.sql       Local test data and example prices
docs/designs/           Design document
```

## Run it on your computer

You need Node 22 (see `.node-version`; with fnm: `fnm use`) and Docker Desktop running.

```bash
npm install
npm run db:start                      # starts Supabase in Docker (first time: a few minutes)
npx supabase functions serve          # in a second terminal: server functions
cp apps/mobile/.env.example apps/mobile/.env
npx supabase status                   # copy the "anon key" into apps/mobile/.env
npm run web                           # back office + app in the browser
npm run mobile                        # phone: scan the QR code with the Expo Go app
```

Test accounts (local only, created by `supabase/seed.sql`):

| Email | Password | Role |
|---|---|---|
| owner@taxi.test | password123 | driver + back office |
| client@taxi.test | password123 | customer |

Supabase Studio (database admin) runs at http://127.0.0.1:54323.

## Tests

```bash
npm test               # everything below
npm run db:test        # 77 business-rule tests in the database
npm run test:functions # 23 server function tests
npm run test:app       # 17 app tests (Paris time, prices, texts)
cd apps/mobile && npx tsc --noEmit && npx expo lint
```

## Set up your own business

1. **Prices:** edit them in the back office (Tarifs), or in `supabase/seed.sql` before the first start.
   Choose **VTC** or **Taxi**: with a taxi licence the app shows an estimate only and hides price proposals.
2. **Your account:** sign up in the app with your real email, then run once in Supabase Studio → SQL editor:
   ```sql
   select public.make_owner('your@email.com');
   ```
   This makes you driver and back-office admin. It can't be done from the app, on purpose.
3. **Working hours, zones, fixed prices, surcharges:** back office.

## Put it online for free

- **Backend:** create a free project on supabase.com (choose an EU region), or self-host Supabase with Docker on your own server. Then:
  ```bash
  npx supabase link --project-ref <your-project>
  npx supabase db push
  npx supabase functions deploy
  ```
  Put the project URL and anon key in `apps/mobile/.env`.
- **Back-office website:** `cd apps/mobile && npx expo export --platform web` creates `dist/`, a static site you can host for free (Cloudflare Pages, Netlify, GitHub Pages...). Configure it to send every path to `index.html`.
- **Phone apps:** `npx eas-cli@latest build` then `npx eas-cli@latest submit` (EAS has a free tier).
  **Unavoidable store fees:** Apple Developer $99/year, Google Play $25 once.

### Map servers in production

The public Photon and OSRM servers are free but meant for light use. For real traffic, run your own (both are open source, Docker images exist) and set:
- `EXPO_PUBLIC_GEOCODER_URL` in `apps/mobile/.env` (address search)
- `OSRM_URL` as a Supabase function secret (`npx supabase secrets set OSRM_URL=https://...`)

If the routing server is down, bookings still work: the app uses a cautious straight-line estimate (30 km/h + 15 min) and says so.

### Push notifications

Notifications are always stored and shown live in the app. To also send them to phones:
1. Build the app with EAS (push needs a real build with an EAS project id).
2. Set a secret: `npx supabase secrets set PUSH_DISPATCH_SECRET=<random string>`.
3. Call `https://<project>.supabase.co/functions/v1/push-dispatch` every minute with header `x-dispatch-secret: <same string>` (for example with Supabase's `pg_net` + `pg_cron`, or any free cron service).

## Not done yet

- **Taxi or VTC and city:** confirm your licence; it decides how prices may be shown (see design doc).
- **Card payments** (phase 2): card payments always cost a fee per transaction, whoever the provider.
- **Second driver:** the database supports it; the app still books the first active driver.
- **Push scheduling** (see above) and store listings (icons, privacy policy page).
- Travel times are typical road times from OpenStreetMap, not live traffic.
