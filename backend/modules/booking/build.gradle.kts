// Rides, customers (contacts), drivers, availability and the ride state machine.
dependencies {
    api(project(":modules:shared"))
    implementation(project(":modules:identity"))
    implementation(project(":modules:pricing"))
    implementation("org.springframework.boot:spring-boot-starter-restclient") // OSRM
}
