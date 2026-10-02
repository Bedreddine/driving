package com.taxi.pricing;

import java.math.BigDecimal;

/**
 * Prices of ride options, shown on the booking page before the client picks them.
 *
 * @param childSeatFee     per seat
 * @param includedLuggage  bags included in the price
 * @param extraLuggageFee  per bag over includedLuggage
 * @param waitingPerMinute only shown to clients: waiting is charged on the day, never added to a quote
 */
public record Extras(BigDecimal meetGreetFee, BigDecimal childSeatFee, int includedLuggage,
                     BigDecimal extraLuggageFee, BigDecimal waitingPerMinute) {}
