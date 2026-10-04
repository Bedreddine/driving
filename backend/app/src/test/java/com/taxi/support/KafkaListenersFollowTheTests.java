package com.taxi.support;

import org.springframework.context.ApplicationContext;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.core.Ordered;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.kafka.config.KafkaListenerEndpointRegistry;
import org.springframework.test.context.TestContext;
import org.springframework.test.context.TestExecutionListener;

/**
 * Spring keeps one application context per test configuration, each with its own database, all alive at once;
 * Kafka is shared. Their consumers would share the event topics' partitions (same consumer group), and one context
 * would handle events of another into the wrong database. So only the context of the test class about to run
 * consumes: the previous one first finishes its events, then its Kafka listeners stop.
 * Registered in META-INF/spring.factories.
 */
public class KafkaListenersFollowTheTests implements TestExecutionListener, Ordered {

    private static ApplicationContext consuming;

    @Override
    public int getOrder() {
        return 1500; // after Spring's own listeners that prepare the context
    }

    @Override
    public synchronized void beforeTestClass(TestContext testContext) {
        var previous = consuming;
        if (previous instanceof ConfigurableApplicationContext c && c.isActive()) {
            EventsSettled.await(previous.getBean(JdbcClient.class));
        }
        var context = testContext.getApplicationContext();
        if (context == previous) {
            return;
        }
        if (previous instanceof ConfigurableApplicationContext c && c.isActive()) {
            c.getBean(KafkaListenerEndpointRegistry.class).stop();
        }
        var registry = context.getBean(KafkaListenerEndpointRegistry.class);
        if (!registry.isRunning()) {
            registry.start();
        }
        consuming = context;
    }
}
