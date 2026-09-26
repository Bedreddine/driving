package com.taxi.pricing.internal;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalTime;
import java.time.ZonedDateTime;
import java.util.List;
import java.util.Set;

/** Pure pricing math, no database: easy to test. */
final class PriceCalculator {

    private PriceCalculator() {}

    record Rates(BigDecimal baseFare, BigDecimal perKm, BigDecimal perMinute, BigDecimal minimumFare) {}

    /** days: 0 = Sunday ... 6 = Saturday. start after end means the window crosses midnight. */
    record SurchargeWindow(Set<Integer> days, LocalTime start, LocalTime end, BigDecimal percent) {}

    static final BigDecimal HUNDRED = BigDecimal.valueOf(100);

    /** max(minimum, base + km x per_km + minutes x per_minute) */
    static BigDecimal formula(Rates r, int distanceM, int durationS) {
        var km = BigDecimal.valueOf(distanceM).divide(BigDecimal.valueOf(1000), 6, RoundingMode.HALF_UP);
        var minutes = BigDecimal.valueOf(durationS).divide(BigDecimal.valueOf(60), 6, RoundingMode.HALF_UP);
        var raw = r.baseFare().add(km.multiply(r.perKm())).add(minutes.multiply(r.perMinute()));
        return raw.max(r.minimumFare());
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
}
