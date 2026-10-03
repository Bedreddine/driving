package com.taxi.notification.internal;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnExpression;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;

/**
 * How customer emails and SMS leave the server.
 * Email: any SMTP server (spring.mail.host, e.g. your mailbox provider); without one, emails are only logged.
 * SMS: always costs money per message; no provider is wired yet, so texts are logged until one is chosen.
 */
@Configuration(proxyBeanMethods = false)
class CustomerChannels {

    interface EmailSender {
        void send(String to, String subject, String body);
    }

    interface SmsSender {
        void send(String to, String text);
    }

    private static final Logger log = LoggerFactory.getLogger(CustomerChannels.class);

    /** Only when an SMTP host is really set: an empty value (e.g. from docker compose) means "no server". */
    @Bean
    @ConditionalOnExpression("!'${spring.mail.host:}'.isBlank()")
    EmailSender smtpEmail(JavaMailSender mail, @Value("${taxi.mail.from}") String from,
                          @Value("${taxi.mail.reply-to:}") String replyTo) {
        return (to, subject, body) -> {
            var m = new SimpleMailMessage();
            m.setFrom(from);
            if (!replyTo.isBlank()) {
                m.setReplyTo(replyTo);
            }
            m.setTo(to);
            m.setSubject(subject);
            m.setText(body);
            mail.send(m);
        };
    }

    @Bean
    @ConditionalOnMissingBean(EmailSender.class)
    EmailSender loggedEmail() {
        log.info("No SMTP server configured (spring.mail.host): customer emails are not sent (the log shows a masked recipient and the subject; the full text only at DEBUG).");
        // The text holds the customer's name, addresses and private ride link: only at DEBUG (on in the dev profile).
        return (to, subject, body) -> {
            log.info("EMAIL to {} | {} (not sent: no SMTP server)", maskEmail(to), subject);
            log.debug("EMAIL to {} | {}\n{}", to, subject, body);
        };
    }

    @Bean
    @ConditionalOnMissingBean(SmsSender.class)
    SmsSender loggedSms() {
        return (to, text) -> {
            log.info("SMS to {} (not sent: no SMS provider)", maskPhone(to));
            log.debug("SMS to {} | {}", to, text);
        };
    }

    /** "jane.doe@example.com" -> "j***@example.com": enough to tell messages apart in the log. */
    static String maskEmail(String email) {
        if (email == null) {
            return null;
        }
        int at = email.indexOf('@');
        return at <= 0 ? "***" : email.charAt(0) + "***" + email.substring(at);
    }

    /** "+33 6 12 34 56 78" -> "***78". */
    static String maskPhone(String phone) {
        if (phone == null) {
            return null;
        }
        var digits = phone.replaceAll("[^0-9]", "");
        return digits.length() < 2 ? "***" : "***" + digits.substring(digits.length() - 2);
    }
}
