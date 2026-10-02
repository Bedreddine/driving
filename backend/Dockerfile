# Backend: Spring Boot 4.1 on Java 21. Built inside Docker, no Java needed on the server.
# The jar is the same on every processor: build it on the build machine's own platform (fast), even for Arm servers.
FROM --platform=$BUILDPLATFORM eclipse-temurin:21-jdk AS build
WORKDIR /src
# Gradle wrapper and build files first: dependencies are cached until they change.
COPY gradlew settings.gradle.kts build.gradle.kts ./
COPY gradle gradle
COPY app/build.gradle.kts app/
COPY modules/shared/build.gradle.kts modules/shared/
COPY modules/identity/build.gradle.kts modules/identity/
COPY modules/pricing/build.gradle.kts modules/pricing/
COPY modules/booking/build.gradle.kts modules/booking/
COPY modules/notification/build.gradle.kts modules/notification/
COPY modules/review/build.gradle.kts modules/review/
RUN ./gradlew --no-daemon -q :app:dependencies > /dev/null
COPY . .
RUN ./gradlew --no-daemon -q :app:bootJar -x test

FROM eclipse-temurin:21-jre
# wget is only used by the health check
RUN apt-get update && apt-get install -y --no-install-recommends wget && rm -rf /var/lib/apt/lists/* \
 && useradd --system --uid 1001 taxi
WORKDIR /app
COPY --from=build /src/app/build/libs/app-0.1.0.jar app.jar
USER taxi
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=5s --start-period=60s --retries=5 \
  CMD wget -qO- http://localhost:8080/actuator/health 2>/dev/null | grep -q UP || exit 1
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75", "-jar", "app.jar"]
