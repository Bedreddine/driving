package com.taxi.notification.internal;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
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

    @Bean
    @ConditionalOnProperty("spring.mail.host")
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
        log.info("No SMTP server configured (spring.mail.host): customer emails are only written to the log.");
        return (to, subject, body) -> log.info("EMAIL to {} | {}\n{}", to, subject, body);
    }

    @Bean
    @ConditionalOnMissingBean(SmsSender.class)
    SmsSender loggedSms() {
        return (to, text) -> log.info("SMS to {} | {}", to, text);
    }
}
