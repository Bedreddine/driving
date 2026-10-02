package com.taxi.notification.internal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;

import com.taxi.support.IntegrationTest;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

/** Customer emails leave through the outbox, with retries when the mail server fails. */
class CustomerMessagesIT extends IntegrationTest {

    @MockitoBean CustomerChannels.EmailSender email;
    @Autowired CustomerMessages messages;

    @Test
    void queuedEmailsAreSentOnce() {
        messages.queueEmail(null, "vip@example.com", "Subject", "Body");
        messages.dispatch();
        verify(email).send("vip@example.com", "Subject", "Body");
        assertThat(messages.unsent()).isEmpty();
        messages.dispatch();
        verify(email).send(eq("vip@example.com"), anyString(), anyString()); // still exactly once
    }

    @Test
    void failuresAreRetriedThenGivenUp() {
        doThrow(new RuntimeException("SMTP down")).when(email).send(anyString(), anyString(), anyString());
        messages.queueEmail(null, "vip@example.com", "Subject", "Body");
        for (int i = 0; i < 7; i++) {
            messages.dispatch();
        }
        var row = jdbc.sql("select attempts, last_error, sent_at from customer_messages").query().singleRow();
        assertThat(row.get("attempts")).isEqualTo(5);
        assertThat(row.get("last_error")).isEqualTo("SMTP down");
        assertThat(row.get("sent_at")).isNull();
    }

    @Test
    void smsIsOffByDefault() {
        messages.queueSms(UUID.randomUUID(), "+33611111111", "text");
        assertThat(jdbc.sql("select count(*) from customer_messages").query(Integer.class).single()).isZero();
    }
}
