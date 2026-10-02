package com.taxi.pricing.internal;

import static org.assertj.core.api.Assertions.assertThat;

import com.taxi.pricing.Estimate.Line;
import com.taxi.pricing.internal.PriceCalculator.Rates;
import com.taxi.pricing.internal.PriceCalculator.SurchargeWindow;
import com.taxi.pricing.internal.PriceCalculator.Tier;
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

    // ------------------------------------------------------------------ tiers, van, extras, breakdown

    private static final List<Tier> TIERS = List.of(new Tier(new BigDecimal("10"), new BigDecimal("1.20")),
            new Tier(new BigDecimal("30"), new BigDecimal("1.00")));

    private static BigDecimal sum(List<Line> lines) {
        return lines.stream().map(Line::amount).reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    private static List<String> codes(List<Line> lines) {
        return lines.stream().map(Line::code).toList();
    }

    @Test
    void distanceTiersArePiecewise() {
        // 45 km, 40 min: 5 + 10 x 1.60 + 20 x 1.20 + 15 x 1.00 + 40 x 0.40 = 76
        var base = PriceCalculator.formula(RATES, TIERS, 45_000, 2400);
        assertThat(base.price()).isEqualByComparingTo("76");
        assertThat(codes(base.lines())).containsExactly("base", "distance", "distance", "distance", "time");
        var segments = base.lines().subList(1, 4);
        assertThat(segments).extracting(Line::quantity).containsExactly(10.0, 20.0, 15.0);
        assertThat(segments).extracting(Line::rate).containsExactly(1.6, 1.2, 1.0);
        assertThat(segments).extracting(l -> l.amount().toPlainString()).containsExactly("16.00", "24.00", "15.00");
        assertThat(base.lines().get(4).quantity()).isEqualTo(40.0);

        // A short ride only uses the first rate; without tiers nothing changes
        assertThat(codes(PriceCalculator.formula(RATES, TIERS, 8000, 600).lines()))
                .containsExactly("base", "distance", "time");
        assertThat(PriceCalculator.formula(RATES, List.of(), 45_000, 2400).price()).isEqualByComparingTo("93"); // 5+72+16
    }

    @Test
    void vanSurchargeAndExtras() {
        var extras = PriceCalculator.extras(new BigDecimal("10"), new BigDecimal("5"), 3, new BigDecimal("2"),
                true, 2, 5);
        assertThat(codes(extras)).containsExactly("meet_greet", "child_seat", "extra_luggage");
        assertThat(extras.get(1).quantity()).isEqualTo(2.0);
        assertThat(extras.get(2).quantity()).isEqualTo(2.0); // 5 bags, 3 included

        // 76 x 120% = 91.20, +15% = 104.88; extras (not multiplied) 10 + 10 + 4
        var q = PriceCalculator.finish(PriceCalculator.formula(RATES, TIERS, 45_000, 2400), 120, new BigDecimal("15"), extras);
        assertThat(q.price()).isEqualByComparingTo("128.88");
        assertThat(codes(q.lines())).containsExactly("base", "distance", "distance", "distance", "time", "van",
                "surcharge", "meet_greet", "child_seat", "extra_luggage");
        assertThat(q.lines().get(5).amount()).isEqualByComparingTo("15.20");
        assertThat(q.lines().get(5).quantity()).isEqualTo(120.0);
        assertThat(q.lines().get(6).amount()).isEqualByComparingTo("13.68");
        assertThat(sum(q.lines())).isEqualByComparingTo(q.price());

        // Free options are not listed
        assertThat(PriceCalculator.extras(BigDecimal.ZERO, BigDecimal.ZERO, 3, BigDecimal.ZERO, true, 2, 9)).isEmpty();
    }

    @Test
    void vanAppliesAfterTheMinimumAndToFixedPrices() {
        var q = PriceCalculator.finish(PriceCalculator.formula(RATES, List.of(), 4000, 900), 150, BigDecimal.ZERO, List.of());
        assertThat(q.price()).isEqualByComparingTo("30.00"); // 17.40 -> minimum 20 -> x 1.5
        assertThat(codes(q.lines())).containsExactly("base", "distance", "time", "minimum", "van");
        assertThat(q.lines().get(3).amount()).isEqualByComparingTo("2.60");

        var fixed = PriceCalculator.finish(PriceCalculator.fixed(new BigDecimal("65")), 80, BigDecimal.ZERO, List.of());
        assertThat(fixed.price()).isEqualByComparingTo("52.00");
        assertThat(codes(fixed.lines())).containsExactly("fixed", "van");
        assertThat(fixed.lines().get(1).amount()).isEqualByComparingTo("-13.00");
    }

    @Test
    void breakdownAlwaysAddsUpAndDefaultsKeepOldPrices() {
        var odd = new Rates(new BigDecimal("3.33"), new BigDecimal("1.37"), new BigDecimal("0.29"), BigDecimal.ZERO);
        for (int d = 1; d < 60_000; d += 1777) {
            for (int t = 7; t < 4000; t += 613) {
                for (var pct : List.of(BigDecimal.ZERO, new BigDecimal("15"), new BigDecimal("12.5"))) {
                    var before = PriceCalculator.withSurcharge(PriceCalculator.formula(odd, d, t), pct);
                    var same = PriceCalculator.finish(PriceCalculator.formula(odd, List.of(), d, t), 100, pct, List.of());
                    assertThat(same.price()).isEqualByComparingTo(before);
                    assertThat(sum(same.lines())).isEqualByComparingTo(same.price());

                    var tiers = List.of(new Tier(new BigDecimal("2.5"), new BigDecimal("1.11")),
                            new Tier(new BigDecimal("17.333"), new BigDecimal("0.97")));
                    var q = PriceCalculator.finish(PriceCalculator.formula(odd, tiers, d, t), 137, pct,
                            PriceCalculator.extras(new BigDecimal("7.5"), new BigDecimal("3.25"), 1,
                                    new BigDecimal("1.1"), true, 1, 3));
                    assertThat(sum(q.lines())).as("d=%d t=%d pct=%s", d, t, pct).isEqualByComparingTo(q.price());
                    assertThat(q.lines()).allSatisfy(l -> assertThat(l.amount().scale()).isEqualTo(2));
                }
            }
        }
    }
}
