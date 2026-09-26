package com.taxi.pricing.internal;

import static org.assertj.core.api.Assertions.assertThat;

import com.taxi.pricing.internal.PriceCalculator.Rates;
import com.taxi.pricing.internal.PriceCalculator.SurchargeWindow;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.Test;

class PriceCalculatorTest {

    private static final Rates RATES = new Rates(new BigDecimal("5.00"), new BigDecimal("1.60"),
            new BigDecimal("0.40"), new BigDecimal("20.00"));
    private static final ZoneId PARIS = ZoneId.of("Europe/Paris");
    private static final SurchargeWindow NIGHT =
            new SurchargeWindow(Set.of(0, 1, 2, 3, 4, 5, 6), LocalTime.of(20, 0), LocalTime.of(7, 0), new BigDecimal("15"));
    private static final SurchargeWindow SUNDAY =
            new SurchargeWindow(Set.of(0), LocalTime.of(0, 0), LocalTime.of(23, 59), new BigDecimal("10"));

    // 2027-01-12 is a Tuesday, 2027-01-17 a Sunday.
    private static ZonedDateTime at(int day, int hour) {
        return ZonedDateTime.of(LocalDateTime.of(2027, 1, day, hour, 0), PARIS);
    }

    private static BigDecimal price(int distanceM, int durationS, ZonedDateTime when) {
        var pct = PriceCalculator.largestSurcharge(List.of(NIGHT, SUNDAY), when);
        return PriceCalculator.withSurcharge(PriceCalculator.formula(RATES, distanceM, durationS), pct);
    }

    @Test
    void formula() {
        assertThat(price(10_000, 1200, at(12, 10))).isEqualByComparingTo("29.00"); // 5 + 16 + 8
    }

    @Test
    void minimumFareForShortRides() {
        assertThat(price(1000, 60, at(12, 10))).isEqualByComparingTo("20.00");
        assertThat(price(4000, 900, at(12, 10))).isEqualByComparingTo("20.00"); // 17.40 -> 20
    }

    @Test
    void nightSurchargeCrossingMidnight() {
        assertThat(price(10_000, 1200, at(12, 23))).isEqualByComparingTo("33.35");
        assertThat(price(10_000, 1200, at(13, 6))).isEqualByComparingTo("33.35"); // Wednesday 06:00
        assertThat(price(10_000, 1200, at(13, 7))).isEqualByComparingTo("29.00"); // window ended
    }

    @Test
    void onlyTheLargestSurchargeApplies() {
        assertThat(price(10_000, 1200, at(17, 12))).isEqualByComparingTo("31.90"); // Sunday 10%
        assertThat(price(10_000, 1200, at(17, 21))).isEqualByComparingTo("33.35"); // Sunday night: 15%, not 25%
    }

    @Test
    void nightWindowOnlyOnSelectedDays() {
        var fridayNightOnly = new SurchargeWindow(Set.of(5), LocalTime.of(22, 0), LocalTime.of(5, 0), BigDecimal.TEN);
        // Saturday 02:00 belongs to Friday night
        assertThat(PriceCalculator.largestSurcharge(List.of(fridayNightOnly), at(16, 2))).isEqualByComparingTo("10");
        // Sunday 02:00 belongs to Saturday night: not selected
        assertThat(PriceCalculator.largestSurcharge(List.of(fridayNightOnly), at(17, 2))).isEqualByComparingTo("0");
    }
}
