# Taxi booking app

A booking app for an independent chauffeur serving premium clients, branded **Élysée Chauffeur** by default (editable).

- **The QR code on the driver's business card** opens the booking website (`/book`). A client books **without an account**: trip, name, phone, email. They see the price, send the request, and follow the ride through a **private link** (`/b/<token>`, also emailed): accept or refuse a proposed price, cancel.
- **Clients who want an account** can sign up (website or phone app) to see their history and book again in one tap. A "Get the app" link appears once the store links are set.
- **The driver** accepts each request, can propose a different price, adds rides that come in by phone or WhatsApp, and sends ready-written WhatsApp messages in one tap.
- **The back office** manages rides, customers, prices, working hours, the business profile and the **printable QR code**.
- **Clients are notified** by email (any SMTP server) and SMS (pluggable, off until a paid provider is chosen).

Design: [docs/designs/taxi-booking-app.md](docs/designs/taxi-booking-app.md)

Everything is open source and free to run:

| Part | Tool |
|---|---|
| Backend API | Java 21, Spring Boot 4.1, Spring Modulith, Gradle |
| Database | PostgreSQL 17 + Flyway migrations |
| iPhone, Android and back-office website (one codebase) | [Expo](https://expo.dev) + Expo Router |
| Address search | [Photon](https://photon.komoot.io) (OpenStreetMap) |
| Road distance and time | [OSRM](https://project-osrm.org) (OpenStreetMap) |
| Push notifications | Expo push service (free) |

## Project layout

```
backend/                     Gradle monorepo (Java 21, Spring Boot 4.1)
  app/                       Runnable application: wiring, config, Flyway migrations, integration tests
  modules/shared/            Error format, geo helpers
  modules/identity/          Accounts, roles, login (JWT access + refresh tokens)
  modules/pricing/           Price formula, fixed zone prices, surcharges
  modules/booking/           Rides, customers, drivers, availability, status rules, jobs
  modules/notification/      Notifications, Expo push, live updates (WebSocket)
apps/mobile/                 Expo app: customer, driver and back office (src/app/admin, web)
docs/designs/                Design document
```

The backend is a **modular monolith**: one deployable app whose modules only talk through their public API and events. Spring Modulith checks the boundaries in the tests (`ModularityTest`), so any module can later become its own service without a rewrite.

## Run it on your computer

You need Java 21, Node 22 (see `.node-version`; with fnm: `fnm use`) and Docker Desktop running.

```bash
npm install
npm run backend        # Spring Boot on :8080; starts PostgreSQL in Docker automatically (backend/app/compose.yaml)
cp apps/mobile/.env.example apps/mobile/.env
npm run web            # back office + app in the browser
npm run mobile         # phone: scan the QR code with Expo Go (set EXPO_PUBLIC_API_URL to your computer's IP)
```

Test accounts (created on an empty database by the `dev` profile, used by `npm run backend`):

| Email | Password | Role |
|---|---|---|
| owner@taxi.test | password123 | driver + back office |
| client@taxi.test | password123 | customer |

## Tests

```bash
npm test               # everything below
npm run test:backend   # 60 tests: unit + integration on a real PostgreSQL (Testcontainers) + module boundaries
npm run test:app       # 17 app tests (Paris time, prices, texts)
cd apps/mobile && npx tsc --noEmit && npx expo lint
```

## API overview

All JSON is snake_case. Errors come back as `{"error": "CODE"}` (e.g. `SLOT_TAKEN`), translated by the app.

| | |
|---|---|
| `POST /api/auth/signup`, `/login`, `/refresh`, `/logout` | Accounts and tokens |
| `GET/PATCH/DELETE /api/me` | Profile, language, account deletion |
| `GET /api/public/business`, `/api/public/driver` | Public: brand, contact, vehicle capacity |
| `POST /api/public/bookings` | Public: guest price check (`dry_run`, no details needed) or booking (with `client`) |
| `GET /api/public/bookings/{token}`, `POST …/respond`, `POST …/cancel` | Public: the guest's private link |
| `POST /api/rides` | Book, quick-add (driver) or price check (`dry_run`) |
| `GET /api/rides`, `/api/rides/{id}`, `/api/rides/conflicts` | Rides visible to the caller |
| `POST /api/rides/{id}/accept`, `propose-price`, `decline`, `respond`, `cancel`, `complete`, `no-show` | Status changes |
| `GET /api/drivers/current`, `/api/driver/time-off` | Driver info, time off |
| `/api/contacts`, `/api/admin/contact-links` | Customers, linking accounts |
| `/api/admin/pricing/{driverId}`, `/api/admin/zones`, `/api/admin/working-hours`, `/api/admin/business` | Back office |
| `POST /api/push-tokens`, `GET /api/notifications` | Notifications |
| `ws://…/ws?token=ACCESS_TOKEN` | Live updates: `{"type":"rides-changed"}` |

## Set up your own business

1. **Prices:** edit them in the back office (Tarifs). Choose **VTC** or **Taxi**: with a taxi licence the app shows an estimate only and hides price proposals.
2. **Your account:** sign up in the app with your real email, then run once:
   ```bash
   java -jar backend/app/build/libs/app-0.1.0.jar --taxi.make-owner=your@email.com --server.port=0
   # or locally: cd backend && ./gradlew :app:bootRun --args='--taxi.make-owner=your@email.com --server.port=0'
   ```
   This makes you driver and back-office admin, then stops. It can't be done over the API, on purpose.
   With one driver, running it later for another account moves the driver to that account.
3. **Working hours, zones, fixed prices, surcharges:** back office.
4. **Business profile and QR code:** back office → Entreprise. Set the website address **before printing cards**: the QR code points to `<website>/book`, and email links use the same address. Download the QR code as a high-resolution PNG for the printer.

## Put it online

```bash
cd backend && ./gradlew :app:bootJar      # backend/app/build/libs/app-0.1.0.jar
```

Run the jar (or a container built with `./gradlew :app:bootBuildImage`) on any server with PostgreSQL. Settings (environment variables):

| Variable | Meaning |
|---|---|
| `DATABASE_URL`, `DATABASE_USER`, `DATABASE_PASSWORD` | PostgreSQL connection (`jdbc:postgresql://host:5432/taxi`) |
| `JWT_SECRET` | **Required**, at least 32 random characters. Keep it secret |
| `CORS_ORIGINS` | Back-office website address(es), comma separated |
| `OSRM_URL` | Your own routing server (default: public demo server) |
| `PUSH_ENABLED` | `false` to stop sending phone notifications |
| `SPRING_MAIL_HOST`, `SPRING_MAIL_PORT`, `SPRING_MAIL_USERNAME`, `SPRING_MAIL_PASSWORD` | SMTP server for client emails (unset: emails only logged) |
| `MAIL_FROM`, `MAIL_REPLY_TO` | Sender and reply-to address of client emails |
| `SMS_ENABLED` | `true` once an SMS provider is wired (every SMS costs money) |
| `FORWARD_HEADERS` | `framework` behind a reverse proxy, so the anti-spam limits see the real visitor IP |

- **Back-office website:** `cd apps/mobile && npx expo export --platform web` creates `dist/`, a static site you can host for free (Cloudflare Pages, Netlify...). Send every path to `index.html`.
- **Phone apps:** `npx eas-cli@latest build` then `npx eas-cli@latest submit` (EAS has a free tier).
- **Unavoidable costs:** Apple Developer $99/year, Google Play $25 once, and a server for the backend + database (free tiers exist; a small VPS is a few euros a month).

### Map servers in production

The public Photon and OSRM servers are free but meant for light use. For real traffic, run your own (both are open source, Docker images exist) and set `EXPO_PUBLIC_GEOCODER_URL` (app) and `OSRM_URL` (backend). If the routing server is down, bookings still work with a cautious estimate (30 km/h + 15 min), and the app says so.

### Background jobs

Expiry of unanswered requests (every minute), reminders for rides left open, phone pushes (every 30 s) and nightly data retention run inside the backend (`@Scheduled`). With **one** backend instance nothing else is needed; with several, add a lock (e.g. ShedLock) so each job runs once.

## Not done yet

- **Taxi or VTC and city:** confirm your licence; it decides how prices may be shown (see design doc).
- **Password reset and email verification** for accounts: the email sending exists now, the screens are not built yet.
- **SMS provider:** the sending is pluggable (`CustomerChannels.SmsSender`); choose a provider (paid per message) and wire it.
- **Website address and domain:** decided at deployment; the QR code shows a warning until it is set.
- **Card payments** (phase 2): card payments always cost a fee per transaction, whoever the provider.
- **Second driver:** the database supports it; bookings still go to the first active driver.
- Travel times are typical road times from OpenStreetMap, not live traffic.
