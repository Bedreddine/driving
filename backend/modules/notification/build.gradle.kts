// Notification outbox, phone push (Expo), live updates over WebSocket.
dependencies {
    api(project(":modules:shared"))
    implementation(project(":modules:identity"))
    implementation(project(":modules:booking"))
    implementation(project(":modules:review"))
    implementation("org.springframework.boot:spring-boot-starter-websocket")
    implementation("org.springframework.boot:spring-boot-starter-restclient") // Expo push
    implementation("org.springframework.boot:spring-boot-starter-mail") // customer emails (any SMTP server)
    implementation("org.springframework.boot:spring-boot-starter-security-oauth2-resource-server")
    // Web Push for guests (standard VAPID, free, no account at any push provider). MIT licence.
    // Only its blocking PushService is used: the async client (old Netty), the CLI parser are left out, and its
    // JWT library is moved to a current release (0.7.0 has known vulnerabilities; same API).
    implementation("nl.martijndwars:web-push:5.1.1") {
        exclude(group = "org.asynchttpclient")
        exclude(group = "com.beust")
    }
    implementation("org.bitbucket.b_c:jose4j:0.9.6")
    implementation("org.bouncycastle:bcprov-jdk18on:1.81") // web-push's elliptic-curve maths (MIT-style licence)
}
