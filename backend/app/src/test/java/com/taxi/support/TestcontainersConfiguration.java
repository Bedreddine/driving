package com.taxi.support;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Bean;
import org.springframework.test.context.DynamicPropertyRegistrar;
import org.testcontainers.kafka.KafkaContainer;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

/**
 * A real PostgreSQL 17 in Docker for tests (same major version as app/compose.yaml), and a real Kafka (same image
 * as docker-compose.yml).
 */
@TestConfiguration(proxyBeanMethods = false)
public class TestcontainersConfiguration {

    /**
     * One Kafka for the whole test run, shared by every Spring test context (a broker per context would cost
     * ~400 MB each). Only the context whose tests are running consumes ({@link KafkaListenersFollowTheTests}).
     */
    public static final KafkaContainer KAFKA = new KafkaContainer(DockerImageName.parse("apache/kafka:4.3.1"))
            .withEnv("KAFKA_HEAP_OPTS", "-Xmx384m -Xms384m")
            .withEnv("KAFKA_GROUP_INITIAL_REBALANCE_DELAY_MS", "0");

    static {
        KAFKA.start(); // stopped by Testcontainers when the test run ends
    }

    @Bean
    @ServiceConnection
    PostgreSQLContainer postgres() {
        return new PostgreSQLContainer(DockerImageName.parse("postgres:17"));
    }

    @Bean
    DynamicPropertyRegistrar kafkaProperties() {
        return registry -> {
            registry.add("spring.kafka.bootstrap-servers", KAFKA::getBootstrapServers);
            // Failing event handling: quick retries in tests (the dead-letter path is what is checked).
            registry.add("taxi.events.retry.first-pause", () -> "50ms");
            registry.add("taxi.events.retry.max-pause", () -> "200ms");
            registry.add("taxi.events.retry.attempts", () -> "2");
        };
    }
}
