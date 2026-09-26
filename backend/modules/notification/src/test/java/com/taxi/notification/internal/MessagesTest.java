package com.taxi.notification.internal;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.util.Map;
import org.junit.jupiter.api.Test;

class MessagesTest {

    private static final Map<String, Object> PAYLOAD = Map.of("price", new BigDecimal("30.00"), "final_price", "30");

    @Test
    void everyKindHasFrenchAndEnglish() {
        for (var kind : Messages.kinds()) {
            assertThat(Messages.text(kind, "fr", PAYLOAD)).doesNotContain("null");
            assertThat(Messages.text(kind, "en", PAYLOAD)).doesNotContain("null");
        }
    }

    @Test
    void usesPayloadValues() {
        assertThat(Messages.text("price_proposed", "en", PAYLOAD)).isEqualTo("The driver proposes €30.00. Do you accept?");
        assertThat(Messages.text("ride_cancelled_by_driver", "fr", Map.of("reason", "panne")))
                .isEqualTo("Votre course a été annulée : panne");
        assertThat(Messages.text("ride_cancelled_by_driver", "en", Map.of())).isEqualTo("Your ride was cancelled");
    }

    @Test
    void fallsBackForUnknownKindsAndLanguages() {
        assertThat(Messages.text("something_new", "de", Map.of())).isEqualTo("Mise à jour de votre course");
    }
}
