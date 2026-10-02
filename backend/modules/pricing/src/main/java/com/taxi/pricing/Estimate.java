package com.taxi.pricing;

import java.math.BigDecimal;
import java.util.List;

/**
 * A price estimate. {@code fixed} means a zone-to-zone fixed price was used instead of the formula.
 *
 * @param breakdown how the price is made, in order; the amounts add up to {@code price} exactly
 */
public record Estimate(BigDecimal price, boolean fixed, String currency, List<Line> breakdown) {

    /**
     * One line of the price, shown to the client.
     *
     * @param code     base, distance, time, minimum, fixed, van, surcharge, meet_greet, child_seat, extra_luggage
     * @param amount   2 decimals
     * @param quantity km of a distance segment, minutes, percent (van, surcharge), seats or bags; null otherwise
     * @param rate     price per km, minute, seat or bag; null otherwise
     */
    public record Line(String code, BigDecimal amount, Double quantity, Double rate) {}
}
