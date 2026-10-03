package com.taxi.booking.internal;

import com.taxi.booking.Business;
import com.taxi.shared.ApiException;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.io.IOException;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.List;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import tools.jackson.databind.json.JsonMapper;

/**
 * Business name, tagline, contact and links, plus the driver's presentation (name, car, photo, what is on board):
 * one row, edited in the back office.
 */
@Component
@RestController
class BusinessProfile implements Business {

    private static final String URL = "^$|^https?://\\S+$";

    /** Largest driver photo accepted (the server takes multipart uploads a bit larger, so this check answers). */
    static final int MAX_PHOTO_BYTES = 3 * 1024 * 1024;

    /** Something on board ("À bord"), e.g. Still water / chilled, included. Details are optional. */
    record Amenity(@NotBlank @Size(max = 40) String labelFr, @NotBlank @Size(max = 40) String labelEn,
                   @Size(max = 60) String detailFr, @Size(max = 60) String detailEn) {

        Amenity cleaned() {
            return new Amenity(labelFr.trim(), labelEn.trim(), blankToNull(detailFr), blankToNull(detailEn));
        }
    }

    /** The car: blank texts are stored as null, features are trimmed. features missing (null) means none. */
    record VehicleDetails(@Size(max = 80) String model, @Size(max = 40) String color,
                          @Pattern(regexp = "^\\s*$|^(sedan|van|suv|electric)$") String category,
                          @Min(1990) @Max(2100) Integer year,
                          @Size(max = 10) List<@NotBlank @Size(max = 40) String> features) {

        VehicleDetails cleaned() {
            return new VehicleDetails(blankToNull(model), blankToNull(color), blankToNull(category), year,
                    features == null ? List.of() : features.stream().map(String::trim).toList());
        }
    }

    /**
     * The car as the booking website shows it; always present (nulls and empty lists when nothing is set).
     *
     * @param photos in the owner's order
     */
    record Vehicle(String model, String color, String category, Integer year, List<String> features,
                   List<VehiclePhotos.VehiclePhoto> photos) {}

    /**
     * The company's legal details for the website's legal pages (mentions légales, CGV, privacy policy).
     * Every value is a string or null; always present in the profile (all null until the owner fills them in).
     *
     * @param siret 14 digits, stored without spaces
     */
    record Legal(String companyName, String legalForm, String siret, String vatNumber, String address,
                 String evtcNumber, String publicationDirector, String insurance, String paymentMethods,
                 String mediatorName, String mediatorUrl, String hostName, String hostAddress) {

        static final int MAX = 200;
        static final int MAX_LONG = 300;
        private static final java.util.regex.Pattern HTTP_URL = java.util.regex.Pattern.compile("^https?://\\S+$");
        private static final java.util.regex.Pattern SIRET = java.util.regex.Pattern.compile("^[0-9]{14}$");

        /** Trimmed, blanks as null, siret without spaces; BAD_INPUT when a value breaks a rule. */
        Legal cleaned() {
            var siretDigits = blankToNull(siret) == null ? null : siret.replaceAll("[\\s\\u00A0\\u202F]", "");
            if (siretDigits != null && !SIRET.matcher(siretDigits).matches()) {
                throw ApiException.badRequest("BAD_INPUT");
            }
            var url = limit(mediatorUrl, MAX_LONG);
            if (url != null && !HTTP_URL.matcher(url).matches()) {
                throw ApiException.badRequest("BAD_INPUT");
            }
            return new Legal(limit(companyName, MAX), limit(legalForm, MAX), siretDigits, limit(vatNumber, MAX),
                    limit(address, MAX_LONG), limit(evtcNumber, MAX), limit(publicationDirector, MAX),
                    limit(insurance, MAX), limit(paymentMethods, MAX), limit(mediatorName, MAX), url,
                    limit(hostName, MAX), limit(hostAddress, MAX_LONG));
        }

        private static String limit(String value, int max) {
            var v = blankToNull(value);
            if (v != null && v.length() > max) {
                throw ApiException.badRequest("BAD_INPUT");
            }
            return v;
        }
    }

    /**
     * amenities missing (null) leaves the list as it is, so an older back office does not wipe it; same for vehicle
     * and legal.
     */
    record Body(@NotBlank @Size(max = 80) String name, @NotBlank @Size(max = 160) String taglineFr,
                @NotBlank @Size(max = 160) String taglineEn, @Size(max = 40) String phone,
                @jakarta.validation.constraints.Email @Size(max = 200) String email, @Size(max = 300) @Pattern(regexp = URL) String siteUrl,
                @Size(max = 300) @Pattern(regexp = URL) String appStoreUrl,
                @Size(max = 300) @Pattern(regexp = URL) String playStoreUrl,
                @Size(max = 60) String driverName, @Size(max = 80) String car,
                @Size(max = 20) List<@NotNull @Valid Amenity> amenities, @Valid VehicleDetails vehicle, Legal legal) {}

    /**
     * What the booking website shows. photoUrl is relative and changes with the photo, so caches can keep it.
     *
     * @param photoUrl e.g. /api/public/business/photo?v=3fa9c1d2e4b5, or null without a photo
     */
    record Profile(String name, String taglineFr, String taglineEn, String phone, String email, String siteUrl,
                   String appStoreUrl, String playStoreUrl, String driverName, String car, String photoUrl,
                   List<Amenity> amenities, Vehicle vehicle, Legal legal) {}

    private record Presentation(String driverName, String car, String photoVersion, String amenities,
                                String vehicleModel, String vehicleColor, String vehicleCategory, Integer vehicleYear,
                                String vehicleFeatures) {}

    private record Photo(byte[] bytes, String type) {}

    private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(BusinessProfile.class);

    private final JdbcClient jdbc;
    private final JsonMapper json;
    private final VehiclePhotos vehiclePhotos;
    private final String defaultSiteUrl;

    /**
     * @param defaultSiteUrl address of the booking website from the server settings (SITE_URL), used while the
     *                       back office has none, so emailed links always work
     */
    BusinessProfile(JdbcClient jdbc, JsonMapper json, VehiclePhotos vehiclePhotos,
                    @org.springframework.beans.factory.annotation.Value("${taxi.public.site-url:}") String defaultSiteUrl) {
        this.jdbc = jdbc;
        this.json = json;
        this.vehiclePhotos = vehiclePhotos;
        this.defaultSiteUrl = blankToNull(defaultSiteUrl);
    }

    @org.springframework.context.event.EventListener(org.springframework.boot.context.event.ApplicationReadyEvent.class)
    void warnWithoutSiteUrl() {
        if (info().siteUrl() == null) {
            log.warn("No booking website address (back office or SITE_URL): emails to guests will have no link to their ride.");
        }
    }

    @Override
    public Info info() {
        var i = jdbc.sql("""
                select name, tagline_fr, tagline_en, phone, email, site_url, app_store_url, play_store_url
                from business_profile""").query(Info.class).single();
        return i.siteUrl() != null || defaultSiteUrl == null ? i
                : new Info(i.name(), i.taglineFr(), i.taglineEn(), i.phone(), i.email(), defaultSiteUrl,
                        i.appStoreUrl(), i.playStoreUrl());
    }

    private Profile profile() {
        var i = info();
        var p = jdbc.sql("""
                select driver_name, car, photo_version, amenities::text as amenities, vehicle_model, vehicle_color,
                  vehicle_category, vehicle_year, vehicle_features::text as vehicle_features
                from business_profile""").query(Presentation.class).single();
        var photoUrl = p.photoVersion() == null ? null : "/api/public/business/photo?v=" + p.photoVersion();
        return new Profile(i.name(), i.taglineFr(), i.taglineEn(), i.phone(), i.email(), i.siteUrl(), i.appStoreUrl(),
                i.playStoreUrl(), p.driverName(), p.car(), photoUrl,
                List.of(json.readValue(p.amenities(), Amenity[].class)),
                new Vehicle(p.vehicleModel(), p.vehicleColor(), p.vehicleCategory(), p.vehicleYear(),
                        List.of(json.readValue(p.vehicleFeatures(), String[].class)), vehiclePhotos.list()),
                legal());
    }

    private Legal legal() {
        return jdbc.sql("""
                select legal_company_name as company_name, legal_form, legal_siret as siret,
                  legal_vat_number as vat_number, legal_address as address, legal_evtc_number as evtc_number,
                  legal_publication_director as publication_director, legal_insurance as insurance,
                  legal_payment_methods as payment_methods, legal_mediator_name as mediator_name,
                  legal_mediator_url as mediator_url, legal_host_name as host_name, legal_host_address as host_address
                from business_profile""").query(Legal.class).single();
    }

    /** Public: the booking website shows the name, tagline, contact and the driver's presentation. */
    @GetMapping("/api/public/business")
    Profile get() {
        return profile();
    }

    @PutMapping("/api/admin/business")
    Profile update(@RequestBody @Valid Body b) {
        var amenities = b.amenities() == null ? null
                : json.writeValueAsString(b.amenities().stream().map(Amenity::cleaned).toList());
        var vehicle = b.vehicle() == null ? null : b.vehicle().cleaned();
        var legal = b.legal() == null ? null : b.legal().cleaned();
        var update = jdbc.sql("""
                update business_profile set name = :name, tagline_fr = :tfr, tagline_en = :ten, phone = :phone,
                  email = :email, site_url = :site, app_store_url = :ios, play_store_url = :android,
                  driver_name = :driver, car = :car, updated_at = now()"""
                        + (amenities == null ? "" : ", amenities = cast(:amenities as jsonb)")
                        + (vehicle == null ? "" : """
                        , vehicle_model = :vmodel, vehicle_color = :vcolor, vehicle_category = :vcategory,
                          vehicle_year = :vyear, vehicle_features = cast(:vfeatures as jsonb)""")
                        + (legal == null ? "" : """
                        , legal_company_name = :lcompany, legal_form = :lform, legal_siret = :lsiret,
                          legal_vat_number = :lvat, legal_address = :laddress, legal_evtc_number = :levtc,
                          legal_publication_director = :ldirector, legal_insurance = :linsurance,
                          legal_payment_methods = :lpayment, legal_mediator_name = :lmediator,
                          legal_mediator_url = :lmediatorurl, legal_host_name = :lhost, legal_host_address = :lhostaddress"""))
                .param("name", b.name().trim()).param("tfr", b.taglineFr().trim()).param("ten", b.taglineEn().trim())
                .param("phone", blankToNull(b.phone())).param("email", blankToNull(b.email()))
                .param("site", blankToNull(b.siteUrl())).param("ios", blankToNull(b.appStoreUrl()))
                .param("android", blankToNull(b.playStoreUrl()))
                .param("driver", blankToNull(b.driverName())).param("car", blankToNull(b.car()));
        if (amenities != null) {
            update = update.param("amenities", amenities);
        }
        if (vehicle != null) {
            update = update.param("vmodel", vehicle.model()).param("vcolor", vehicle.color())
                    .param("vcategory", vehicle.category()).param("vyear", vehicle.year())
                    .param("vfeatures", json.writeValueAsString(vehicle.features()));
        }
        if (legal != null) {
            update = update.param("lcompany", legal.companyName()).param("lform", legal.legalForm())
                    .param("lsiret", legal.siret()).param("lvat", legal.vatNumber()).param("laddress", legal.address())
                    .param("levtc", legal.evtcNumber()).param("ldirector", legal.publicationDirector())
                    .param("linsurance", legal.insurance()).param("lpayment", legal.paymentMethods())
                    .param("lmediator", legal.mediatorName()).param("lmediatorurl", legal.mediatorUrl())
                    .param("lhost", legal.hostName()).param("lhostaddress", legal.hostAddress());
        }
        update.update();
        return profile();
    }

    // ------------------------------------------------------------------ driver photo

    /** Public, cached for a year: the URL changes with the photo (?v=...). */
    @GetMapping("/api/public/business/photo")
    ResponseEntity<byte[]> photo() {
        var p = jdbc.sql("select photo, photo_type from business_profile where photo is not null")
                .query((rs, n) -> new Photo(rs.getBytes("photo"), rs.getString("photo_type")))
                .optional().orElseThrow(ApiException::notFound);
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(p.type()))
                .header(HttpHeaders.CACHE_CONTROL, "public, max-age=31536000")
                .body(p.bytes());
    }

    /** JPEG, PNG or WebP (recognised by its content, not by what the browser claims), 3 MB at most. */
    @PostMapping("/api/admin/business/photo")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void uploadPhoto(@RequestParam(name = "file", required = false) MultipartFile file) throws IOException {
        if (file == null || file.isEmpty()) {
            throw ApiException.badRequest("BAD_IMAGE");
        }
        if (file.getSize() > MAX_PHOTO_BYTES) {
            throw ApiException.badRequest("IMAGE_TOO_LARGE");
        }
        var bytes = file.getBytes();
        var type = imageType(bytes);
        if (type == null) {
            throw ApiException.badRequest("BAD_IMAGE");
        }
        jdbc.sql("update business_profile set photo = :photo, photo_type = :type, photo_version = :v, updated_at = now()")
                .param("photo", bytes).param("type", type).param("v", sha256(bytes).substring(0, 12)).update();
    }

    @DeleteMapping("/api/admin/business/photo")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void deletePhoto() {
        jdbc.sql("update business_profile set photo = null, photo_type = null, photo_version = null, updated_at = now()")
                .update();
    }

    /** The image type from the file's first bytes (its "magic number"), or null if not JPEG, PNG or WebP. */
    static String imageType(byte[] b) {
        if (startsWith(b, 0, 0xFF, 0xD8, 0xFF)) {
            return "image/jpeg";
        }
        if (startsWith(b, 0, 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A)) {
            return "image/png";
        }
        if (startsWith(b, 0, 'R', 'I', 'F', 'F') && startsWith(b, 8, 'W', 'E', 'B', 'P')) {
            return "image/webp";
        }
        return null;
    }

    private static boolean startsWith(byte[] b, int offset, int... magic) {
        if (b.length < offset + magic.length) {
            return false;
        }
        for (int i = 0; i < magic.length; i++) {
            if ((b[offset + i] & 0xFF) != magic[i]) {
                return false;
            }
        }
        return true;
    }

    static String sha256(byte[] bytes) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e); // every Java has SHA-256
        }
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}
