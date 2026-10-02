package com.taxi.review.internal;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class DisplayNamesTest {

    @Test
    void firstNameInitialAndLastWord() {
        assertThat(DisplayNames.of("James Smith")).isEqualTo("J. Smith");
        assertThat(DisplayNames.of("  james   van der Berg ")).isEqualTo("J. Berg");
        assertThat(DisplayNames.of("Élodie Martin")).isEqualTo("É. Martin");
    }

    @Test
    void titlesAreLeftOut() {
        assertThat(DisplayNames.of("Mr James Smith")).isEqualTo("J. Smith");
        assertThat(DisplayNames.of("Mme Claire Dubois")).isEqualTo("C. Dubois");
        assertThat(DisplayNames.of("M. Jean Dupont")).isEqualTo("J. Dupont");
        assertThat(DisplayNames.of("dr. Ana Lopez")).isEqualTo("A. Lopez");
        assertThat(DisplayNames.of("Mr Smith")).isEqualTo("Smith");
        assertThat(DisplayNames.of("M Dupont")).isEqualTo("M. Dupont"); // a bare M may be an initial
    }

    @Test
    void singleWordsAndEmptyNames() {
        assertThat(DisplayNames.of("Madonna")).isEqualTo("Madonna");
        assertThat(DisplayNames.of("Mr")).isEqualTo("Mr");
        assertThat(DisplayNames.of(" ")).isNull();
        assertThat(DisplayNames.of(null)).isNull();
    }
}
