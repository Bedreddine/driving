package com.taxi.notification.internal;

import java.util.List;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/** Outbox of customer emails and SMS: queued with the ride change, sent by a job with retries. */
@Component
class CustomerMessages {

    record Pending(long id, String channel, String recipient, String subject, String body, int attempts) {}

    private static final Logger log = LoggerFactory.getLogger(CustomerMessages.class);
    private static final int MAX_ATTEMPTS = 5;

    private final JdbcClient jdbc;
    private final CustomerChannels.EmailSender email;
    private final CustomerChannels.SmsSender sms;
    private final boolean smsEnabled;

    CustomerMessages(JdbcClient jdbc, CustomerChannels.EmailSender email, CustomerChannels.SmsSender sms,
                     @Value("${taxi.sms.enabled:false}") boolean smsEnabled) {
        this.jdbc = jdbc;
        this.email = email;
        this.sms = sms;
        this.smsEnabled = smsEnabled;
    }

    void queueEmail(UUID rideId, String to, String subject, String body) {
        insert(rideId, "email", to, subject, body);
    }

    /** Queued only when SMS is switched on (taxi.sms.enabled): every SMS costs money. */
    void queueSms(UUID rideId, String to, String text) {
        if (smsEnabled) {
            insert(rideId, "sms", to, null, text);
        }
    }

    private void insert(UUID rideId, String channel, String to, String subject, String body) {
        jdbc.sql("insert into customer_messages (ride_id, channel, recipient, subject, body) values (:r, :c, :to, :s, :b)")
                .param("r", rideId).param("c", channel).param("to", to).param("s", subject).param("b", body).update();
    }

    @Scheduled(fixedDelayString = "${taxi.mail.delay:PT20S}", initialDelayString = "PT15S")
    @Transactional
    void dispatch() {
        var pending = jdbc.sql("""
                select id, channel, recipient, subject, body, attempts from customer_messages
                where sent_at is null and attempts < :max order by created_at limit 50 for update skip locked""")
                .param("max", MAX_ATTEMPTS).query(Pending.class).list();
        for (var m : pending) {
            try {
                if ("email".equals(m.channel())) {
                    email.send(m.recipient(), m.subject(), m.body());
                } else {
                    sms.send(m.recipient(), m.body());
                }
                jdbc.sql("update customer_messages set sent_at = now(), attempts = attempts + 1, last_error = null where id = :id")
                        .param("id", m.id()).update();
            } catch (RuntimeException e) {
                // The mail server's message may quote the address: details go to last_error, not to the log.
                log.warn("Could not send {} #{} (attempt {}): {}", m.channel(), m.id(), m.attempts() + 1,
                        e.getClass().getSimpleName());
                jdbc.sql("update customer_messages set attempts = attempts + 1, last_error = :e where id = :id")
                        .param("id", m.id()).param("e", String.valueOf(e.getMessage())).update();
            }
        }
    }

    List<Pending> unsent() {
        return jdbc.sql("select id, channel, recipient, subject, body, attempts from customer_messages where sent_at is null order by id")
                .query(Pending.class).list();
    }

    /**
     * An erased customer (account deletion or GDPR request): the emails / SMS about their rides hold their address,
     * name and trip, so they go too, sent or not (same transaction).
     */
    @org.springframework.context.event.EventListener
    void on(com.taxi.booking.CustomerForgotten e) {
        if (!e.rideIds().isEmpty()) {
            jdbc.sql("delete from customer_messages where ride_id in (:ids)").param("ids", e.rideIds()).update();
        }
    }

    @Scheduled(cron = "0 50 3 * * *", zone = "UTC")
    @Transactional
    void retention() {
        jdbc.sql("delete from customer_messages where created_at < now() - interval '90 days'").update();
    }
}
