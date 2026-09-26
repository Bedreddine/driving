package com.taxi;

import com.taxi.identity.Owners;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Local test data, only with the "dev" profile (`./gradlew :app:bootRun`) and only on an empty database.
 * Logins: owner@taxi.test / password123 (driver + back office), client@taxi.test / password123 (customer).
 * Replace the example prices in the back office.
 */
@Configuration(proxyBeanMethods = false)
@Profile("dev")
class DevData {

    private static final Logger log = LoggerFactory.getLogger(DevData.class);

    @Bean
    ApplicationRunner seed(JdbcClient jdbc, PasswordEncoder passwords, Owners owners, TransactionTemplate tx) {
        return args -> tx.executeWithoutResult(status -> {
            if (jdbc.sql("select count(*) from users").query(Integer.class).single() > 0) {
                return;
            }
            var driver = jdbc.sql("""
                    insert into drivers (display_name, phone) values ('My Taxi', '+33600000000') returning id""")
                    .query(UUID.class).single();
            jdbc.sql("""
                    insert into pricing_settings (driver_id, licence, base_fare, per_km, per_minute, minimum_fare)
                    values (:d, 'vtc', 5.00, 1.60, 0.40, 20.00)""").param("d", driver).update();
            jdbc.sql("""
                    insert into working_hours (driver_id, weekday, start_time, end_time)
                    select :d, w, '06:00', '22:00' from generate_series(1, 6) w""").param("d", driver).update();
            jdbc.sql("""
                    insert into zones (name, kind, center_lat, center_lng, radius_m) values
                      ('Paris intra-muros', 'other', 48.8566, 2.3522, 6000),
                      ('CDG Airport', 'airport', 49.0097, 2.5479, 3000),
                      ('Orly Airport', 'airport', 48.7262, 2.3652, 2500),
                      ('Gare de Lyon', 'station', 48.8443, 2.3744, 400),
                      ('Gare du Nord', 'station', 48.8809, 2.3553, 400)""").update();
            jdbc.sql("""
                    insert into fixed_prices (driver_id, from_zone, to_zone, price)
                    select :d, p.id, a.id, case a.name when 'CDG Airport' then 65 else 45 end
                    from zones p, zones a where p.name = 'Paris intra-muros' and a.kind = 'airport'""")
                    .param("d", driver).update();
            jdbc.sql("""
                    insert into surcharges (driver_id, name, days, start_time, end_time, percent) values
                      (:d, 'Night', '{0,1,2,3,4,5,6}', '20:00', '07:00', 15),
                      (:d, 'Sunday', '{0}', '00:00', '23:59', 10)""").param("d", driver).update();

            user(jdbc, passwords, "owner@taxi.test", "Owner Driver", null, "fr");
            user(jdbc, passwords, "client@taxi.test", "Test Client", "+33611111111", "en");
            owners.makeOwner("owner@taxi.test");
            log.info("Dev data created: owner@taxi.test / client@taxi.test, password password123");
        });
    }

    private static void user(JdbcClient jdbc, PasswordEncoder passwords, String email, String name, String phone,
                             String language) {
        var id = jdbc.sql("""
                insert into users (email, password_hash, email_verified, full_name, phone, language)
                values (:e, :h, true, :n, :p, :l) returning id""")
                .param("e", email).param("h", passwords.encode("password123")).param("n", name).param("p", phone)
                .param("l", language).query(UUID.class).single();
        jdbc.sql("insert into user_roles (user_id, role) values (:u, 'customer')").param("u", id).update();
        jdbc.sql("insert into contacts (user_id, full_name, phone, email, notice_given, created_by) values (:u, :n, :p, :e, true, :u)")
                .param("u", id).param("n", name).param("p", phone).param("e", email).update();
    }
}
