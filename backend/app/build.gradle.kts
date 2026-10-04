plugins {
    id("org.springframework.boot")
}

// The runnable application: wires all modules together, owns the database migrations.
dependencies {
    implementation(project(":modules:shared"))
    implementation(project(":modules:identity"))
    implementation(project(":modules:pricing"))
    implementation(project(":modules:booking"))
    implementation(project(":modules:review"))
    implementation(project(":modules:notification"))

    implementation("org.springframework.boot:spring-boot-starter-actuator")
    implementation("org.springframework.boot:spring-boot-starter-flyway")
    implementation("org.flywaydb:flyway-database-postgresql")
    runtimeOnly("org.postgresql:postgresql")
    runtimeOnly("org.springframework.modulith:spring-modulith-actuator")
    runtimeOnly("org.springframework.modulith:spring-modulith-runtime")
    // Transactional outbox: every published domain event is first saved in the event_publication table (same
    // database transaction as the change), then sent to Kafka; unsent ones are sent again after a restart.
    implementation("org.springframework.boot:spring-boot-starter-kafka")
    implementation("org.springframework.modulith:spring-modulith-starter-jdbc")
    implementation("org.springframework.modulith:spring-modulith-events-kafka")
    developmentOnly("org.springframework.boot:spring-boot-docker-compose")

    testImplementation("org.springframework.boot:spring-boot-starter-webmvc-test")
    testImplementation("org.springframework.boot:spring-boot-starter-security-test")
    testImplementation("org.springframework.boot:spring-boot-starter-websocket-test")
    testImplementation("org.springframework.boot:spring-boot-starter-jdbc-test")
    testImplementation("org.springframework.boot:spring-boot-starter-flyway-test")
    testImplementation("org.springframework.boot:spring-boot-testcontainers")
    testImplementation("org.springframework.modulith:spring-modulith-starter-test")
    testImplementation("org.testcontainers:testcontainers-junit-jupiter")
    testImplementation("org.testcontainers:testcontainers-postgresql")
    testImplementation("org.testcontainers:testcontainers-kafka")
    testImplementation("org.awaitility:awaitility")
}

// Local runs get a development-only token secret; production must set JWT_SECRET.
tasks.named<org.springframework.boot.gradle.tasks.run.BootRun>("bootRun") {
    environment("JWT_SECRET", System.getenv("JWT_SECRET") ?: "local-development-secret-change-me-0123456789")
    systemProperty("spring.profiles.active", System.getenv("SPRING_PROFILES_ACTIVE") ?: "dev")
}

// Only the runnable jar is useful for this module.
tasks.named<Jar>("jar") {
    enabled = false
}
