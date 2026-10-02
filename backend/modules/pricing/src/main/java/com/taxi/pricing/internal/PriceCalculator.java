package com.taxi.pricing.internal;

import com.taxi.pricing.Estimate.Line;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalTime;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;

/** Pure pricing math, no database: easy to test. */
final class PriceCalculator {

    private PriceCalculator() {}

    record Rates(BigDecimal baseFare, BigDecimal perKm, BigDecimal perMinute, BigDecimal minimumFare) {}

    /** From fromKm on (until the next tier), each km costs perKm. */
    record Tier(BigDecimal fromKm, BigDecimal perKm) {}

    /** days: 0 = Sunday ... 6 = Saturday. start after end means the window crosses midnight. */
    record SurchargeWindow(Set<Integer> days, LocalTime start, LocalTime end, BigDecimal percent) {}

    /**
     * The ride price before van, surcharge and extras: exact (not rounded), with its lines (rounded each).
     * The lines are balanced against the final rounded price in {@link #finish}.
     */
    record Base(BigDecimal price, List<Line> lines) {}

    record Quote(BigDecimal price, List<Line> lines) {}

    static final BigDecimal HUNDRED = BigDecimal.valueOf(100);

    /** max(minimum, base + km x per_km + minutes x per_minute), without distance tiers. */
    static BigDecimal formula(Rates r, int distanceM, int durationS) {
        return formula(r, List.of(), distanceM, durationS).price();
    }

    /**
     * max(minimum, base + distance + minutes x per_minute). The distance is piecewise: rates.perKm from 0 to the
     * first tier, then each tier's per_km from its from_km to the next tier's (tiers sorted by from_km).
     */
    static Base formula(Rates r, List<Tier> tiers, int distanceM, int durationS) {
        var km = BigDecimal.valueOf(distanceM).divide(BigDecimal.valueOf(1000), 6, RoundingMode.HALF_UP);
        var minutes = BigDecimal.valueOf(durationS).divide(BigDecimal.valueOf(60), 6, RoundingMode.HALF_UP);
        var lines = new ArrayList<Line>();
        lines.add(line("base", r.baseFare(), null, null));

        var raw = r.baseFare();
        var from = BigDecimal.ZERO;
        var rate = r.perKm();
        for (int i = 0; i <= tiers.size(); i++) {
            var to = i < tiers.size() ? tiers.get(i).fromKm() : null;
            var inSegment = (to == null ? km : km.min(to)).subtract(from).max(BigDecimal.ZERO);
            if (i == 0 || inSegment.signum() > 0) {
                var cost = inSegment.multiply(rate);
                raw = raw.add(cost);
                lines.add(line("distance", cost, inSegment.setScale(3, RoundingMode.HALF_UP).doubleValue(), rate.doubleValue()));
            }
            if (to == null) {
                break;
            }
            from = to;
            rate = tiers.get(i).perKm();
        }

        var time = minutes.multiply(r.perMinute());
        raw = raw.add(time);
        lines.add(line("time", time, minutes.setScale(2, RoundingMode.HALF_UP).doubleValue(), r.perMinute().doubleValue()));

        if (raw.compareTo(r.minimumFare()) < 0) {
            lines.add(line("minimum", r.minimumFare().subtract(raw), null, null));
            return new Base(r.minimumFare(), lines);
        }
        return new Base(raw, lines);
    }

    /** A zone-to-zone fixed price, instead of the formula. */
    static Base fixed(BigDecimal price) {
        return new Base(price, List.of(line("fixed", price, null, null)));
    }

    /**
     * Final price: base x van percent x (1 + surcharge), rounded to cents, then the extras (never multiplied).
     * Every line is rounded on its own; the rounding difference goes on the last line of the base, so the lines
     * add up to the price exactly.
     */
    static Quote finish(Base base, int vanPercent, BigDecimal surchargePercent, List<Line> extras) {
        var lines = new ArrayList<>(base.lines());
        var price = base.price();
        if (vanPercent != 100) {
            var van = BigDecimal.valueOf(vanPercent);
            lines.add(line("van", price.multiply(van.subtract(HUNDRED)).divide(HUNDRED), (double) vanPercent, null));
            price = price.multiply(van).divide(HUNDRED);
        }
        if (surchargePercent.signum() > 0) {
            lines.add(line("surcharge", price.multiply(surchargePercent).divide(HUNDRED),
                    surchargePercent.doubleValue(), null));
        }
        var ride = withSurcharge(price, surchargePercent);

        var sum = lines.stream().map(Line::amount).reduce(BigDecimal.ZERO, BigDecimal::add);
        var diff = ride.subtract(sum);
        if (diff.signum() != 0) {
            int last = base.lines().size() - 1;
            var l = lines.get(last);
            lines.set(last, new Line(l.code(), l.amount().add(diff), l.quantity(), l.rate()));
        }

        var total = ride;
        for (var e : extras) {
            lines.add(e);
            total = total.add(e.amount());
        }
        return new Quote(total, List.copyOf(lines));
    }

    /**
     * Priced options, only those that cost something: meet & greet, child seats (per seat),
     * luggage over the included number (per bag).
     */
    static List<Line> extras(BigDecimal meetGreetFee, BigDecimal childSeatFee, int includedLuggage,
                             BigDecimal extraLuggageFee, boolean meetGreet, int childSeats, int luggage) {
        var lines = new ArrayList<Line>();
        if (meetGreet && meetGreetFee.signum() > 0) {
            lines.add(line("meet_greet", meetGreetFee, null, null));
        }
        if (childSeats > 0 && childSeatFee.signum() > 0) {
            lines.add(line("child_seat", childSeatFee.multiply(BigDecimal.valueOf(childSeats)), (double) childSeats,
                    childSeatFee.doubleValue()));
        }
        int extraBags = luggage - includedLuggage;
        if (extraBags > 0 && extraLuggageFee.signum() > 0) {
            lines.add(line("extra_luggage", extraLuggageFee.multiply(BigDecimal.valueOf(extraBags)), (double) extraBags,
                    extraLuggageFee.doubleValue()));
        }
        return lines;
    }

    static BigDecimal withSurcharge(BigDecimal price, BigDecimal percent) {
        return price.multiply(BigDecimal.ONE.add(percent.divide(HUNDRED, 6, RoundingMode.HALF_UP)))
                .setScale(2, RoundingMode.HALF_UP);
    }

    /** Only the largest surcharge applies; windows never stack. Decided by the local pickup time. */
    static BigDecimal largestSurcharge(List<SurchargeWindow> windows, ZonedDateTime localPickup) {
        int day = localPickup.getDayOfWeek().getValue() % 7;
        int previousDay = (day + 6) % 7;
        var time = localPickup.toLocalTime();
        return windows.stream()
                .filter(w -> applies(w, day, previousDay, time))
                .map(SurchargeWindow::percent)
                .max(BigDecimal::compareTo)
                .orElse(BigDecimal.ZERO);
    }

    private static boolean applies(SurchargeWindow w, int day, int previousDay, LocalTime t) {
        if (w.start().isBefore(w.end())) {
            return w.days().contains(day) && !t.isBefore(w.start()) && t.isBefore(w.end());
        }
        // Crosses midnight: the evening part belongs to `day`, the early-morning part to the day before.
        return (w.days().contains(day) && !t.isBefore(w.start()))
                || (w.days().contains(previousDay) && t.isBefore(w.end()));
    }

    private static Line line(String code, BigDecimal amount, Double quantity, Double rate) {
        return new Line(code, amount.setScale(2, RoundingMode.HALF_UP), quantity, rate);
    }
}
