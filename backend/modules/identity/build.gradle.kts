// Accounts, roles, login (JWT), the signed-in user.
dependencies {
    api(project(":modules:shared"))
    api("org.springframework.boot:spring-boot-starter-security")
    implementation("org.springframework.boot:spring-boot-starter-security-oauth2-resource-server")
}
