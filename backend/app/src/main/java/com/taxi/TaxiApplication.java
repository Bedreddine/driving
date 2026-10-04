package com.taxi;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
public class TaxiApplication {

    public static void main(String[] args) {
        if (java.util.Arrays.stream(args).anyMatch(a -> a.equals("--taxi.generate-vapid") || a.startsWith("--taxi.generate-vapid="))) {
            printVapidKeys();
            return;
        }
        SpringApplication.run(TaxiApplication.class, args);
    }

    /**
     * Browser push keys, made once per installation, without starting the server or touching the database:
     * <pre>java -jar app.jar --taxi.generate-vapid</pre>
     */
    private static void printVapidKeys() {
        var keys = com.taxi.notification.VapidKeys.generate();
        System.out.println("VAPID_PUBLIC_KEY=" + keys.publicKey());
        System.out.println("VAPID_PRIVATE_KEY=" + keys.privateKey());
        System.out.println("# Keep the private key secret. Changing the keys later means browsers must subscribe again.");
    }

    /** Background jobs (expiry, reminders, push, retention). Tests turn them off and run them directly. */
    @Configuration(proxyBeanMethods = false)
    @EnableScheduling
    @ConditionalOnProperty(name = "taxi.scheduling.enabled", matchIfMissing = true)
    static class Scheduling {}
}
