---
# gstack: design-md-format=spec
name: Élysée Chauffeur
description: Paris at night seen from a private car; a living dark map, one colour, the amber of the street lamps.
colors:
  asphalt: "#0D0F12"
  surface: "#171A1F"
  raised: "#20242B"
  line: "#3A3F48"
  text: "#EEE9E0"
  text-muted: "#8E8A82"
  primary: "#E9A23B"
  on-primary: "#1A1206"
  success: "#6CC08F"
  warning: "#E9A23B"
  error: "#E5735F"
  map-land: "#121417"
  map-water: "#1B2430"
  map-park: "#14181A"
  map-building: "#1A1D22"
  map-road: "#23272D"
  map-road-major: "#343841"
  map-label: "#77736B"
typography:
  display:
    fontFamily: Instrument Serif
    fontWeight: 400
    fontSize: 46px
    letterSpacing: -0.01em
  heading:
    fontFamily: Instrument Serif
    fontWeight: 400
    fontSize: 32px
  body:
    fontFamily: Manrope
    fontSize: 16px
    lineHeight: 1.55
  label:
    fontFamily: JetBrains Mono
    fontWeight: 500
    fontSize: 11px
    letterSpacing: 0.06em
  mono:
    fontFamily: JetBrains Mono
    fontFeature: tnum
rounded:
  sm: 3px
  sheet: 14px
  full: 9999px
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 22px
  xl: 32px
  2xl: 48px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.sm}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    borderColor: "{colors.line}"
    textColor: "{colors.text}"
    rounded: "{rounded.sm}"
  sheet:
    backgroundColor: "{colors.asphalt}"
    borderColor: "{colors.line}"
    rounded: "{rounded.sheet}"
  input:
    borderColor: "{colors.line}"
    focusColor: "{colors.primary}"
  route-line:
    color: "{colors.primary}"
---

# Élysée Chauffeur

## Overview

**Creative North Star:** "Nuit Blanche": the client opens the site from the driver's business card and is already in the car, at night, in Paris. The city itself is the image: a living dark map that turns slowly, and one colour, the amber of the street lamps, that marks the client's route, the price and the one thing to tap.
**Product context:** one independent private chauffeur in Paris for high-end clients (palace-hotel guests, business travellers, airport and station transfers). Clients scan the QR code on the card, mostly on a phone, in a hotel lobby, an arrival hall or a restaurant, often in the evening. Same Expo / React Native codebase for the website, the phone apps, the driver screens and the back office.
**Mode per surface:** landing `/` and `/book`: Experience + Persuade. Booking over the map: Operate. Private ride link `/b/<token>`: Operate. Review: Operate. Driver screens and back office: Operate.
**Reference sites:** blacklane.com, wheely.com, aman.com, viptransitparis.fr (2026-10-02); map-first ride apps for the booking pattern.
**Key characteristics:**
- Cinematic: the first screen is Paris itself, moving, not a stock photo of a car.
- Effortless: one amber button, then suggested places (airports, stations, palaces), a search, or a pin on the map; the price follows by itself.
- Personal: the driver's name, car and photo, and what is on board ("À bord"), set by the driver.
- Precise: every place shows its distance; a pin placed on the map shows its address and GPS coordinates.

## Colors

**Strategy:** Restrained. Asphalt neutrals carry the whole interface; amber (`primary`) is the only colour and is rare: the main action of a screen, the route line, the selected state, the availability dot. Never two amber elements competing in one view.
**Light or dark:** dark, always. The use scene is the evening and the inside of hotels and cars; the map at night is the brand image. Depth comes from three asphalt steps (`asphalt` → `surface` → `raised`), not from shadows or glows.
- `text-muted` carries labels, distances and secondary lines; `line` draws every hairline and divider.
- `error` (coral) for refusals and errors only; `success` (sage) for confirmed states.
- The map is restyled from the free OpenFreeMap vector style with the `map-*` tokens: no points of interest, no shields, dim labels, so the amber route is the only bright thing on it.

## Typography

Three voices, all Google Fonts under the OFL, loaded with `@expo-google-fonts/*` before first render.
- **Instrument Serif** (display, headings): a condensed, high-contrast serif with a cinematic poster feel; upright for titles ("Paris ce soir, à votre heure."), italic only inside quotes (reviews). Never for buttons or body.
- **Manrope** (body, buttons, UI): open, geometric, very readable in dim light at 14-17px. Buttons in 700, body 400-600.
- **JetBrains Mono** (figures and labels): prices, times, distances, flight numbers, coordinates, route lines ("RITZ → CDG 2E"), and the small uppercase field labels. Tabular figures.
Scale: 46 display / 32 heading / 22 sub-heading / 16 body / 13 secondary / 11 labels.

## Layout

- The map is the page: full-bleed behind everything on the client screens.
- Landing: text sits at the bottom third over a dark linear fade (no halo), brand top-left, FR/EN top-right.
- Visual grouping: a form is cut into numbered sections (1 Le trajet, 2 L'heure, 3 Les options, 4 Vos coordonnées), each on its own `surface` panel with a `line` border and 14px padding, 14px apart. Clients must see where one step ends and the next begins without reading.
- Booking: a bottom sheet (`rounded.sheet` top corners) rises over the map; the map stays visible above it and frames the route (camera fits the route above the sheet).
- Phone first; on wide screens the sheet becomes a 440px left column over the map.
- Back office: desktop layout, side menu, same tokens.

## Elevation & Depth

Tone, not shadow: asphalt surfaces step up in lightness, divided by 1px `line` hairlines. The map gets a 3D tilt (pitch 45-55°) on the landing for depth. No drop shadows, no glows, no frosted glass.

## Shapes

- `sm` 3px for buttons, inputs, chips.
- `sheet` 14px for the top corners of the booking sheet only.
- `full` for dots: availability dot, map pins.

## Components

- **Primary button:** solid amber, dark text, Manrope 700, label left and the price or an arrow right ("Réserver avec Karim · 95 €"). Pressed: scale 0.985. Disabled: 45% opacity with a reason shown under it.
- **Secondary / chip:** `surface` with a `line` border; selected chip turns its border and text amber.
- **Field:** small mono uppercase label, value in Manrope 16-17px, `line` underline; focus draws an amber underline from the left.
- **Place row:** name + one muted line (terminal, street), distance in mono on the right; amber distance on hover/focus.
- **Map pins:** pickup amber with asphalt border; drop-off ivory with amber border. A pin placed by hand shows its address and coordinates (`48.8681° N · 2.3290° E`).
- **Route line:** amber, 4px, rounded, drawn from start to end in 1.1s.
- **Price:** JetBrains Mono 54px, counts up from 0 in 700ms when it appears.
- **À bord menu:** a restaurant-menu list (item left, detail right, hairline between rows) on the confirmation and the landing; one mono summary line on the landing. Set by the driver in the back office.
- **Reviews:** approved reviews only, Instrument Serif italic in « », name · city · month in mono. Hidden when there are none.
- States: loading is a quiet line of muted text or a thin amber progress line on the sheet; empty states say what to do; errors in coral with a way forward.

## Do's and Don'ts

- Do: keep amber for one thing per view (the main action or the route).
- Do: always show distance and time next to a place or a route, in mono.
- Do: let the driver's own name, car, photo and amenities speak; never invent them.
- Do: respect "reduce motion": no orbit, no route drawing, no count-up, 150ms fades only.
- Don't: gold, black-and-gold, glows, halos, gradients on buttons, frosted glass.
- Don't: stock photos of cars or chauffeurs.
- Don't: an icon grid for amenities; it is a menu, written in words.
- Don't: show reviews, ratings or availability that are not real.

## Motion

- **Approach:** expressive on the client pages (they are an experience), functional in the back office.
- **Easing:** enter `cubic-bezier(0.22, 1, 0.36, 1)`; map camera moves ease-out.
- **Duration:** micro 100-150ms (press, chip), short 200-300ms (fades), medium 500-600ms (sheet rise, landing text out), long 1100-1200ms (route drawing, camera fly to fit the route).
- **The one authored moment:** the city turns slowly under the landing title (pitch 55°); when the client picks a destination, the camera flies to frame the trip, the amber route draws itself from pickup to drop-off and the price counts up.
- **Reduce motion:** static map, route shown at once, price shown at once, 150ms fades.

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-10-02 | Initial design system "Plaque & Solari" | First /design-consultation (kept in DESIGN.legacy.bak.md) |
| 2026-10-02 | Replaced by "Nuit Blanche" | Owner found the result not immersive or intuitive enough; chose this among three working prototypes (Nuit Blanche, Back-Seat Cinema from an independent voice, Cartographe) |
| 2026-10-02 | Map-first booking with suggested places, pin with address + GPS | Owner asked for a map, a list of places and coordinates |
| 2026-10-02 | "À bord" amenities and driver name/car/photo editable by the driver | Owner request; personal and honest |
| 2026-10-02 | MapLibre + OpenFreeMap + OSRM | Free and open source, no API key |
| 2026-10-02 | Numbered section panels, `line` raised to #3A3F48 | Owner: clients struggled to tell the parts of the booking sheet apart |
| 2026-10-02 | Filled text fields with floating labels, Feather line icons (MIT) in buttons, fields and the back-office menu, custom switch and counters, visible amber focus ring | Owner asked for richer buttons and inputs, client pages and back office alike |
| 2026-10-02 | Car profile with photos, animated QR card (lines slide in, amber scan line, ends as a still, scannable QR on ivory) | Owner request; the card stays scannable at rest |
| 2026-10-02 | Map as an input: tap to place, drag pins, numbered search results, "my location" that follows the phone; driver's live car on the ride page | Owner request |
