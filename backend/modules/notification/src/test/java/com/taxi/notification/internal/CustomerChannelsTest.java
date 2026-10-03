package com.taxi.notification.internal;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

/** Customer emails and phones never reach the log in full. */
class CustomerChannelsTest {

    @Test
    void emailsAndPhonesAreMasked() {
        assertThat(CustomerChannels.maskEmail("jane.doe@example.com")).isEqualTo("j***@example.com");
        assertThat(CustomerChannels.maskEmail("nonsense")).isEqualTo("***");
        assertThat(CustomerChannels.maskPhone("+33 6 12 34 56 78")).isEqualTo("***78");
        assertThat(CustomerChannels.maskPhone("+")).isEqualTo("***");
    }
}
