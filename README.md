# Taxi booking app

A booking app for an independent chauffeur serving premium clients, branded **Élysée Chauffeur** by default (editable).

- **The QR code on the driver's business card** opens the home page (`/book`): Paris at night on a living map, the driver's name and car, what is on board, and one button. A client books **without an account**: pickup and drop-off from **suggested places** (airports, stations, palace hotels), an address search, or **a pin on the map** (address and GPS coordinates); the route draws itself on the map and the price appears; then name, phone, email. They follow the ride through a **private link** (`/b/<token>`, also emailed) with its map: accept or refuse a proposed price, cancel.
- **On the map:** tap to place a point, drag the pins to the exact door (price and route update), search results as numbered pins, and « Ma position » that follows the phone. Once a ride is confirmed, the client sees the driver's car approach live with its arrival time.
- **Remember me (opt-in):** a guest can tick « Se souvenir de moi sur cet appareil »: next time the site says « Bon retour, James », offers « Refaire ce trajet », and their details are already filled in, so booking is just choosing the time and confirming. Kept on their device only (nothing extra on the server); « Oublier mes données » erases it. The ride page also has « Refaire ce trajet ».
- **Legal pages:** mentions légales (`/legal`), CGV (`/terms`) and privacy policy (`/privacy`), in French and English, filled from the company details entered in the back office (Entreprise › Informations légales, which lists what is still missing). They are templates: have them checked by a professional before going live.
- **The car:** the driver describes it (model, colour, year, category, features) and adds up to 12 photos outside and inside; clients see it on the home page, while booking and on the ride page, with a full-screen gallery.
- **Animated QR card:** in Entreprise, the QR code draws itself line by line with the car photo, name and model; download it as a GIF to share, or show it full screen from the driver app (« Mon QR code »). The plain PNG stays for printing.
- **« À bord »:** the driver lists what is offered in the car (water, soft drinks, sweets, non-smoking, chargers, Wi-Fi, child seat…, or their own lines) and sets their name, car and photo in the back office.
- **Clients who want an account** can sign up (website or phone app) to see their history and book again in one tap. A "Get the app" link appears once the store links are set.
- **The driver** accepts each request, can propose a different price, adds rides that come in by phone or WhatsApp, and sends ready-written WhatsApp messages in one tap.
- **The back office** manages rides, customers, prices (per km with distance tiers, per minute, minimum, van price in %, paid options such as meet & greet, child seat, extra luggage, night/weekend surcharges, fixed zone prices, and a price simulator on a map), working hours, the business profile and the **printable QR code**.
- **Clients are notified** by email (any SMTP server) and SMS (pluggable, off until a paid provider is chosen).
- **Client reviews:** after a completed ride, the private link asks for stars and a word for the driver. A client who agrees appears as a reference ("J. Smith · London") on the booking page, only after the owner publishes it in the back office (Client reviews). No review is ever shown without that consent and approval.

Design: [docs/designs/taxi-booking-app.md](docs/designs/taxi-booking-app.md) (product) and [DESIGN.md](DESIGN.md) (visual system "Nuit Blanche": Paris at night, asphalt and street-lamp amber, Instrument Serif / Manrope / JetBrains Mono, a living dark map, the route drawing itself and the price counting up).

Everything is open source and free to run:

| Part | Tool |
|---|---|
| Backend API | Java 21, Spring Boot 4.1, Spring Modulith, Gradle |
| Database | PostgreSQL 17 + Flyway migrations |
| Events between modules | Apache Kafka 4.3 (KRaft, one node), Spring for Apache Kafka, Spring Modulith outbox |
| iPhone, Android and back-office website (one codebase) | [Expo](https://expo.dev) + Expo Router |
| Maps | [MapLibre](https://maplibre.org) (website and phones) with [OpenFreeMap](https://openfreemap.org) tiles, restyled at night; no API key |
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
  modules/review/            Client reviews: left from the ride link, approved by the owner
apps/mobile/                 Expo app: customer, driver and back office (src/app/admin, web)
docs/designs/                Design document
```

The backend is a **modular monolith**: one deployable app whose modules only talk through their public API and events. Spring Modulith checks the boundaries in the tests (`ModularityTest`), so any module can later become its own service without a rewrite. The events between booking and notifications go through Kafka (next section).

## Events and Kafka

Modules talk through **domain events**. The ones another part of the app reacts to later (ride created or changed, ride-day moment, message, new review, customer erased) travel through **Apache Kafka**, with a **transactional outbox** so that none is lost or invented:

```
 booking / review module                       PostgreSQL                         Kafka (KRaft, 1 node)
 ───────────────────────                       ──────────                         ─────────────────────
 change saved  ─┐  same transaction  ┌──────►  rides, reviews...
 event published┘ ──────────────────►└──────►  event_publication (outbox)
                                                     │ after commit, one sender thread, in order
                                                     └───────────────────────────► taxi.ride-events      (key: ride id)
                                                       deleted once Kafka has it    taxi.customer-events  (key: contact id)
                                                                                         │
 notification module (@KafkaListener, group taxi-notification) ◄─────────────────────────┘
   one transaction: processed_events (event id) + notices + queued emails / SMS (customer_messages)
   then: WebSocket "rides-changed" / "ride-message", browser push; phone push and emails leave from their own outboxes
   failing 6 times (pauses 1 s → 30 s), or unreadable ──► taxi.ride-events.DLT / taxi.customer-events.DLT
```

- **Publishing (outbox):** an event class annotated `@Externalized("taxi.ride-events::#{rideId()}")` is saved by Spring Modulith in `event_publication` in the transaction that publishes it, then sent to Kafka after the commit. A send that fails stays there and is sent again every minute (and at the next start). So: no ride change without its event, and no event for a change that was rolled back.
- **Order:** one ride's events share a key, hence a partition, and are sent by a single thread in commit order: they are handled in the order they happened.
- **Consuming (at least once, handled once):** each event has an `event_id`; the consumer writes it to `processed_events` in the same database transaction as the notices and queued emails. A second delivery of the same event changes nothing. This is how "no ride change without its notifications" holds now: outbox + at-least-once delivery + idempotent consumer.
- **Failures:** a message that keeps failing (database down...) is retried in place, then copied to the dead-letter topic (`<topic>.DLT`, kept 14 days) with the reason in its headers; an unreadable message goes there at once. Logs show topic, partition, offset and the error type, never the content.
- **Message format:** JSON body in snake_case (the event record), header `taxi-event` with the event name (`RideChanged`, `RideMomentReached`, `RideMessagePosted`, `ReviewSubmitted`, `CustomerForgotten`). (Spring also adds `__TypeId__` with the Java class; the consumer does not rely on it.)
- **Personal data:** messages hold names, emails, phone numbers and addresses. Kafka deletes them after 7 days; the outbox row is deleted as soon as Kafka has the event. An erased customer's events still waiting are not acted on (the consumer checks the ride first).

| Topic | Events | Key | Partitions | Kept |
|---|---|---|---|---|
| `taxi.ride-events` | RideChanged, RideMomentReached, RideMessagePosted, ReviewSubmitted | ride id | 3 | 7 days |
| `taxi.customer-events` | CustomerForgotten | contact id | 3 | 7 days |
| `taxi.ride-events.DLT`, `taxi.customer-events.DLT` | messages that could not be handled | same | 3 | 14 days |

The app creates the topics at startup. **See the messages** (Docker stack; for `npm run backend` use `docker compose -p app exec kafka ...` from `backend/app`):

```bash
docker compose exec kafka /opt/kafka/bin/kafka-console-consumer.sh --bootstrap-server localhost:9092 \
  --topic taxi.ride-events --from-beginning --formatter-property print.key=true --formatter-property print.headers=true
docker compose exec kafka /opt/kafka/bin/kafka-consumer-groups.sh --bootstrap-server localhost:9092 \
  --describe --group taxi-notification            # LAG 0 = everything handled
docker compose exec kafka /opt/kafka/bin/kafka-console-consumer.sh --bootstrap-server localhost:9092 \
  --topic taxi.ride-events.DLT --from-beginning --formatter-property print.headers=true   # what failed, and why
docker compose exec postgres psql -U taxi -c "select event_type, status, publication_date from event_publication"  # not yet sent
```

A dead letter is not replayed automatically: once the cause is fixed, send it back to its topic (e.g. `kafka-console-producer.sh` with the same key), handling is idempotent.


## Run it on your computer

You need Java 21, Node 22 (see `.node-version`; with fnm: `fnm use`) and Docker Desktop running.

```bash
npm install
npm run backend        # Spring Boot on :8080; starts PostgreSQL, Kafka (localhost:19092) and Mailpit in Docker automatically (backend/app/compose.yaml)
cp apps/mobile/.env.example apps/mobile/.env
npm run web            # back office + app in the browser
npm run mobile         # phone: needs a development build because of the native map (see docs/MOBILE.md); set EXPO_PUBLIC_API_URL to your computer's IP
```

**Emails in development** go to [Mailpit](https://mailpit.axllent.org), a fake mailbox started with the database: every email the app sends (booking received, price proposal, reminders) appears at **http://localhost:8025**, nothing reaches real people. (Mailpit replaces MailHog, which is no longer maintained.)

Test accounts (created on an empty database by the `dev` profile, used by `npm run backend`):

| Email | Password | Role |
|---|---|---|
| owner@taxi.test | password123 | driver + back office |
| client@taxi.test | password123 | customer |

## Tests

```bash
npm test               # everything below
npm run test:backend   # 154 tests: unit + integration on a real PostgreSQL and Kafka (Testcontainers) + module boundaries
npm run test:app       # 42 app tests (Paris time, prices, texts, reviewer names, map style, places, QR animation, remember-me)
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
| `GET/POST /api/public/bookings/{token}/messages` | Public: the client's messages with the driver (`{"body"}`, 1–500 chars; open while requested / price_proposed / accepted until 12 h after pickup, else `MESSAGES_CLOSED`; 20 per 10 min per link) |
| `GET /api/public/web-push/key`, `POST/DELETE /api/public/bookings/{token}/web-push` | Public: browser push for guests (server key, register / remove the browser's subscription) |
| `POST /api/rides` | Book, quick-add (driver) or price check (`dry_run`) |
| `GET /api/rides`, `/api/rides/{id}`, `/api/rides/conflicts` | Rides visible to the caller |
| `POST /api/rides/{id}/accept`, `propose-price`, `decline`, `respond`, `cancel`, `complete`, `no-show` | Status changes |
| `POST /api/rides/{id}/moments` | Driver: `{"kind":"on_the_way"}` or `"arrived"` on an accepted ride (`"arriving"` is automatic from the live position, ≤ 2.5 km from pickup); the customer is told |
| `GET/POST /api/rides/{id}/messages` | Messages of a ride: the driver (or admin) writes as `driver`, the signed-in customer as `client` |
| `POST /api/driver/location` | Driver's live position (shown to the customer around their ride) |
| `GET /api/drivers/current`, `/api/driver/time-off` | Driver info, time off |
| `/api/contacts`, `/api/admin/contact-links` | Customers, linking accounts |
| `/api/admin/pricing/{driverId}`, `/api/admin/zones`, `/api/admin/working-hours`, `/api/admin/business` | Back office |
| `POST /api/push-tokens`, `GET /api/notifications` | Notifications |
| `ws://…/ws?token=ACCESS_TOKEN` | Live updates: `{"type":"rides-changed"}`, `{"type":"ride-message","ride_id":"…"}` |

Browser push (guests) needs a VAPID key pair: `./scripts/docker-env.sh` and `deploy/setup-server.sh` put one in `.env` (made with openssl), or run `java -jar backend/app/build/libs/app-0.1.0.jar --taxi.generate-vapid` once (no database needed) and set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT` (a `mailto:` or `https:` contact, default `mailto:no-reply@localhost`). Without keys browser push is off; the dev profile makes temporary keys at startup.

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

## Run everything with Docker

One command runs the database, Kafka, the backend API and the website (nothing else to install but Docker):

```bash
./scripts/docker-env.sh      # creates .env with a random database password, login secret and browser push keys (once)
docker compose up -d --build # first build about 5 minutes, then seconds
```

Open http://localhost:8080 (another port: set `WEB_PORT` in `.env`) (`/book` is the page the QR code opens). nginx serves the website and forwards `/api` and `/ws` to the backend, so everything lives on **one address** and the same images work on any domain.

First-time setup of a fresh database:

```bash
# 1. sign up your own account on the website, then make it the owner (driver + back office):
docker compose run --rm backend --taxi.make-owner=you@example.com --server.port=0
# 2. sign in again, then set prices, hours and the business profile in the back office
```

| Command | What it does |
|---|---|
| `docker compose logs -f backend` | Follow the server log (emails are written there until SMTP is set) |
| `docker compose up -d --build` | Update after a code change |
| `docker compose --profile mail up -d` | Also start Mailpit (http://localhost:8025) to see the emails; set `SMTP_HOST=mailpit` and `SMTP_PORT=1025` in `.env` |
| `docker compose down` | Stop (data is kept in the `pgdata` and `kafkadata` volumes) |
| `docker compose down -v` | Stop **and erase all data** |
| `docker compose exec postgres pg_dump -U taxi taxi > backup.sql` | Back up the database |

**If it does not start:**

| You see | Cause | Fix |
|---|---|---|
| `container …-backend-1 is unhealthy` | The backend stopped at startup | `docker compose logs backend \| grep -A3 Description` says why |
| `JWT_SECRET … is still the example value` | Secrets not set | `./scripts/docker-env.sh` (or set them in `.env`), then `docker compose up -d` |
| `password authentication failed for user "taxi"` | The database was first created with another password | New install with no data to keep: `docker compose down -v`, then `docker compose up -d` |
| `port is already allocated` | Port 8080 is used by another program | Set `WEB_PORT=8090` in `.env` |
| Prices look wrong on a fresh install | Starting prices: 5 € + 1.60 €/km + 0.40 €/min, minimum 20 € | Back office › Tarifs |

If port 8080 is already used on your computer, choose another: `WEB_PORT=8099 SITE_URL=http://localhost:8099 docker compose up -d`.

In production, put HTTPS in front (e.g. Caddy or your host's load balancer) pointing to `WEB_PORT`, and set `SITE_URL` to your `https://` domain. The phone apps are not built by Docker: they use EAS (see below).

## Put it online

Step by step (GitHub Actions + a server + HTTPS): [docs/DEPLOY.md](docs/DEPLOY.md).

```bash
cd backend && ./gradlew :app:bootJar      # backend/app/build/libs/app-0.1.0.jar
```

Run the jar (or a container built with `./gradlew :app:bootBuildImage`) on any server with PostgreSQL and Kafka. Settings (environment variables):

| Variable | Meaning |
|---|---|
| `DATABASE_URL`, `DATABASE_USER`, `DATABASE_PASSWORD` | PostgreSQL connection (`jdbc:postgresql://host:5432/taxi`) |
| `SPRING_KAFKA_BOOTSTRAP_SERVERS` | Kafka broker(s) (`host:9092`, default `localhost:9092`) |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Browser push keys (see API overview); empty: browser push off |
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

The public Photon and OSRM servers are free but meant for light use. For real traffic, run your own (both are open source, Docker images exist) and set `EXPO_PUBLIC_GEOCODER_URL` (app) and `OSRM_URL` (backend). If the routing server is down, bookings still work with a cautious estimate (30 km/h + 15 min), and the app says so. Map tiles come from OpenFreeMap (free, no key, no usage limit announced; self-hostable too): point `EXPO_PUBLIC_MAP_STYLE_URL` at another MapLibre style if you ever move.

### Background jobs

Expiry of unanswered requests (every minute), reminders for rides left open, phone pushes (every 30 s), resending events Kafka did not take (every minute) and nightly data retention run inside the backend (`@Scheduled`). With **one** backend instance nothing else is needed; with several, add a lock (e.g. ShedLock) so each job runs once, and note that live updates (WebSocket) only reach the screens connected to the instance that handled the event.

## Not done yet

- **Taxi or VTC and city:** confirm your licence; it decides how prices may be shown (see design doc).
- **Password reset and email verification** for accounts: the email sending exists now, the screens are not built yet.
- **SMS provider:** the sending is pluggable (`CustomerChannels.SmsSender`); choose a provider (paid per message) and wire it.
- **Website address and domain:** decided at deployment; the QR code shows a warning until it is set.
- **Legal pages:** fill in the company details in the back office and have the generated texts checked by a professional (accountant, lawyer, or your VTC federation).
- **Phone apps in the stores:** the apps are finished and build (name, icon, splash, `fr.elyseechauffeur.app` ids, background live position). Publishing needs your accounts (Expo, Google Play 25 $ once, Apple 99 $/year) and the server's address: see [docs/MOBILE.md](docs/MOBILE.md).
- **Email links opening the app** (universal links): needs the final domain.
- **Card payments** (phase 2): card payments always cost a fee per transaction, whoever the provider.
- **Second driver:** the database supports it; bookings still go to the first active driver.
- Travel times are typical road times from OpenStreetMap, not live traffic.
