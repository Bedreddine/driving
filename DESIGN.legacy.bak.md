---
# gstack: design-md-format=spec
name: Élysée Chauffeur
description: Parisian stationery meets the station departure board; ivory paper, street-sign navy, one mechanical flip of the price.
colors:
  paper: "#F1EBE0"
  surface: "#FAF7F1"
  text: "#13213F"
  text-muted: "#7A7366"
  rule: "#D9D0C0"
  primary: "#1F3FA0"
  on-primary: "#FAF7F1"
  board: "#13213F"
  board-cell: "#1B2A4A"
  board-text: "#F1EBE0"
  success: "#2E6B4E"
  warning: "#A86F12"
  error: "#B3261E"
  evening-paper: "#0F1A2E"
  evening-surface: "#17243D"
  evening-text: "#F1EBE0"
  evening-text-muted: "#9AA3B5"
  evening-rule: "#2A3956"
  evening-primary: "#8FA8F0"
  evening-on-primary: "#0F1A2E"
  evening-board: "#0A1222"
  evening-board-cell: "#14213A"
  evening-success: "#6FBF95"
  evening-warning: "#E0AE55"
  evening-error: "#F08A80"
typography:
  display:
    fontFamily: Bodoni Moda
    fontWeight: 400
    fontSize: 40px
    letterSpacing: 0em
  heading:
    fontFamily: Bodoni Moda
    fontWeight: 400
    fontSize: 28px
  body:
    fontFamily: Hanken Grotesk
    fontSize: 16px
    lineHeight: 1.55
  label:
    fontFamily: Hanken Grotesk
    fontWeight: 500
    fontSize: 12px
    letterSpacing: 0.06em
  mono:
    fontFamily: Martian Mono
    fontFeature: tnum
rounded:
  hairline: 2px
  sm: 4px
  phone: 28px
  full: 9999px
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  2xl: 56px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.hairline}"
  button-ghost:
    borderColor: "{colors.rule}"
    textColor: "{colors.text}"
    rounded: "{rounded.hairline}"
  input:
    borderColor: "{colors.rule}"
    focusColor: "{colors.primary}"
  ticket:
    backgroundColor: "{colors.surface}"
    borderColor: "{colors.rule}"
    rounded: "{rounded.sm}"
  board:
    backgroundColor: "{colors.board}"
    cellColor: "{colors.board-cell}"
    textColor: "{colors.board-text}"
---

# Élysée Chauffeur

## Overview

**Creative North Star:** "Plaque & Solari": the booking page continues the printed business card (ivory paper, Paris street-sign navy), and the client's own trip is set like a station timetable whose price flips into place like the old Gare de Lyon board.
**Product context:** independent private chauffeur in Paris for high-end clients (business travellers, hotel guests, airport and station transfers). Clients arrive from a QR code on a business card, book without an account, and follow the ride on a private link. Same Expo / React Native codebase for the website, the phone apps, the driver screens and the back office.
**Mode per surface:** booking page /book: Persuade + Operate. Private ride link /b/<token>: Operate. Review after the ride: Operate. Driver screens: Operate. Back office: Operate (desktop).
**Reference sites:** blacklane.com, wheely.com, aman.com, viptransitparis.fr (observed 2026-10-02).
**Key characteristics:**
- Recognition: the screen looks like the card the client was just handed.
- Calm: generous space, hairline rules, left-aligned timetable layout, nothing shouts.
- Their trip is the hero: route, time and price, not a stock photo of a car.
- One mechanical moment of delight: the price (and later the status) flips into place.
- Proof from real clients only: reviews appear after a real ride, with consent and the driver's approval.

## Colors

**Strategy:** Committed. Street-sign navy owns the page; ivory paper is the ground; plaque blue is the only action colour. No gold: the category is black and gold, this brand is not.
**Light or dark:** decided by the scene, automatically, in Paris time: the day palette (ivory paper) from 07:00 to 19:00, the evening palette (navy) otherwise, because clients book in hotel lobbies and arrival halls by day and after dinner by night. Evening is not an inversion: surfaces get lighter navy (`evening-surface`) to keep depth, the primary turns to a lighter plaque blue (`evening-primary`) so text on it stays readable, and the flip board keeps its own darker cells in both modes. The driver screens and the back office use the day palette.
- `primary` is for the one main action on a screen and for focus underlines, never for decoration.
- `text-muted` carries labels and secondary information; `rule` draws every hairline, dotted leader and perforation.
- `error` is the "rubber stamp" red for refusals and errors only.

## Typography

Three voices, each with one job, all Google Fonts under the OFL, loaded in the app with `@expo-google-fonts/bodoni-moda`, `@expo-google-fonts/hanken-grotesk` and `@expo-google-fonts/martian-mono` (`expo-font`), before the first render.
- **Bodoni Moda** (display, headings): a Didone with high contrast, the register of Parisian fashion houses and printed menus. Upright for headings; italic only for the one greeting per screen ("Où allons-nous ?", "Votre course", "Merci, Monsieur Smith"). Never for body text or buttons.
- **Hanken Grotesk** (body, UI, buttons, labels): calm and very readable at 15-17px in dim light. Labels are 12px uppercase with 0.06em tracking.
- **Martian Mono** (figures): prices, times, dates, flight and train numbers, routes, and the flip board. Tabular figures so numbers do not jump.
Scale: 40 display / 28 heading / 17 field values / 16 body / 14 secondary / 12 labels. Headings are never within one step of body size.

## Layout

- Phone first: a single column, max width 640px on the website, 20px side gutters.
- Timetable layout: label left, value right, joined by a dotted leader (`rule`); everything is left-aligned except the language switch.
- The trip summary is a **ticket**: a surface block with a row of small dots as the perforation, the route on top, the price below the perforation.
- Large rhythm between sections (`2xl` 56px), small rhythm inside them (`sm`/`md`).
- The back office keeps its desktop layout (side menu, tables) with the same tokens.

## Elevation & Depth

Depth comes from tone, not shadows: `surface` on `paper`, hairline `rule` borders, and the board's darker cells. No drop shadows on cards, no glow. The only movement in depth is the flip board's 3D rotation and the ticket's tear.

## Shapes

- `hairline` 2px radius on buttons and inputs: crisp, like printed stationery.
- `sm` 4px on the ticket and board cells.
- `phone` 28px only for device frames in previews.
- `full` for dots: the perforation, the timeline markers.

## Components

- **Primary button:** solid `primary`, `on-primary` text, 600 weight, full width on phones. Pressed: scales to 0.985. Disabled: 50% opacity with an explanation shown nearby (never a silent grey button). Focus-visible: 2px `primary` outline offset 2px.
- **Ghost button:** transparent with a `rule` border; for secondary actions (call, cancel).
- **Field:** label above (12px uppercase muted), value in 17px, a 1px `rule` underline; on focus a 2px `primary` underline grows from the left. Errors appear directly under the field in `error`.
- **Ticket:** route line in mono, timetable rows (passengers, luggage, meet & greet), perforation, then the price board. On sending a request the lower part tears: moves down 8px and rotates 1.5°.
- **Flip board (Solari):** dark cells (`board-cell`) with ivory mono characters; each character flips through 3-5 random characters before landing. Used for the price and the ride status.
- **Status timeline:** vertical rule with dots; reached steps fill in `primary` and the rule fills down to them.
- **Guest book (reviews):** approved reviews only, each with stars, the comment in Bodoni Moda between French quotation marks, and "INITIAL. NAME · CITY · MONTH YEAR" in small caps. Hidden entirely when there are none.
- **Star rating:** five square hairline buttons; selected stars fill in `primary`.
- States: every screen designs loading (quiet placeholder text, no spinner wall), empty (honest sentence), error (stamp red with a way forward) and long content (addresses wrap, never truncate on the ticket).

## Do's and Don'ts

- Do: put the client's route, time and price at the centre of every client screen.
- Do: print the QR business card in the same ivory and navy, so card and screen are one object.
- Do: use Martian Mono for every number the client compares (price, time, flight).
- Do: show only real reviews, with the client's consent and the driver's approval.
- Do: respect "reduce motion": every animation becomes a 150ms crossfade.
- Don't: use gold, black-and-gold, glows, gradients or drop shadows.
- Don't: use a stock photo of a car or a chauffeur; a real photo of the driver may appear on the ride page.
- Don't: centre body text or headings; only the brand mark and language switch break the left alignment.
- Don't: show invented reviews, star counts or "trusted by" numbers.
- Don't: animate for decoration; every motion explains a change (arrival, focus, sending, status).

## Motion

- **Approach:** intentional, with one authored moment.
- **Easing:** enter `cubic-bezier(0.22, 1, 0.36, 1)` (ease-out), exit ease-in, move ease-in-out.
- **Duration:** micro 70-120ms (flip steps, press), short 180-250ms (field focus), medium 380ms (screen content rising 12px with a 60ms stagger per section), long 500-600ms (ticket tear, timeline fill), the full price reveal under 900ms.
- **The one authored moment:** the Solari price reveal: each character of the price flips like a departure board (70ms per flip, columns 45ms apart, a light haptic tick on phones as each settles), and the same board flips the ride status to "CONFIRMÉ".
- **Reduce motion:** all of the above become a 150ms opacity crossfade.

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-10-02 | Initial design system "Plaque & Solari" | Created by /design-consultation from the product context, research on Blacklane, Wheely, Aman and VIP Transit Paris, and two independent proposals that converged on Bodoni Moda + Hanken Grotesk on ivory and navy |
| 2026-10-02 | No gold, ivory + street-sign navy | Every competitor template is black and gold; continuity with the printed card makes the brand recognisable |
| 2026-10-02 | Automatic day / evening by Paris time | Clients book in lobbies by day and after dinner at night |
| 2026-10-02 | Client reviews (guest book) | Requested by the owner; real reviews only, with consent and approval |
