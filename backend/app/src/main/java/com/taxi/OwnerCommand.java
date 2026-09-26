package com.taxi;

import com.taxi.identity.Owners;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;

/**
 * Makes an existing account the business owner (driver + back office), then exits:
 * <pre>java -jar app.jar --taxi.make-owner=you@example.com --server.port=0</pre>
 * ({@code --server.port=0} avoids clashing with a server already running.) Deliberately not available over HTTP.
 * With a single driver, running it for another account moves the driver to that account.
 */
@Configuration(proxyBeanMethods = false)
@ConditionalOnProperty("taxi.make-owner")
class OwnerCommand {

    private static final Logger log = LoggerFactory.getLogger(OwnerCommand.class);

    @Bean
    ApplicationRunner makeOwner(Owners owners, Environment env, ConfigurableApplicationContext context) {
        return args -> {
            var email = env.getRequiredProperty("taxi.make-owner");
            owners.makeOwner(email);
            log.info("{} is now the owner (driver + back office). Sign out and in again in the app.", email);
            System.exit(SpringApplication.exit(context, () -> 0));
        };
    }
}
