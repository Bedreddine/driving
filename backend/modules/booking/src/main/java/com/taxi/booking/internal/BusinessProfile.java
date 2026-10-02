package com.taxi.booking.internal;

import com.taxi.booking.Business;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/** Business name, tagline, contact and links: one row, edited in the back office. */
@Component
@RestController
class BusinessProfile implements Business {

    private static final String URL = "^$|^https?://\\S+$";

    record Body(@NotBlank @Size(max = 80) String name, @NotBlank @Size(max = 160) String taglineFr,
                @NotBlank @Size(max = 160) String taglineEn, @Size(max = 40) String phone,
                @Size(max = 200) String email, @Size(max = 300) @Pattern(regexp = URL) String siteUrl,
                @Size(max = 300) @Pattern(regexp = URL) String appStoreUrl,
                @Size(max = 300) @Pattern(regexp = URL) String playStoreUrl) {}

    private final JdbcClient jdbc;

    BusinessProfile(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public Info info() {
        return jdbc.sql("""
                select name, tagline_fr, tagline_en, phone, email, site_url, app_store_url, play_store_url
                from business_profile""").query(Info.class).single();
    }

    /** Public: the booking website shows the name, tagline and contact. */
    @GetMapping("/api/public/business")
    Info get() {
        return info();
    }

    @PutMapping("/api/admin/business")
    Info update(@RequestBody @Valid Body b) {
        jdbc.sql("""
                update business_profile set name = :name, tagline_fr = :tfr, tagline_en = :ten, phone = :phone,
                  email = :email, site_url = :site, app_store_url = :ios, play_store_url = :android, updated_at = now()""")
                .param("name", b.name().trim()).param("tfr", b.taglineFr().trim()).param("ten", b.taglineEn().trim())
                .param("phone", blankToNull(b.phone())).param("email", blankToNull(b.email()))
                .param("site", blankToNull(b.siteUrl())).param("ios", blankToNull(b.appStoreUrl()))
                .param("android", blankToNull(b.playStoreUrl()))
                .update();
        return info();
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}
