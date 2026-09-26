package com.taxi.pricing;

import java.math.BigDecimal;

/** A price estimate. {@code fixed} means a zone-to-zone fixed price was used instead of the formula. */
public record Estimate(BigDecimal price, boolean fixed, String currency) {}
