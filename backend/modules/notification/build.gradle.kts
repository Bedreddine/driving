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
}
