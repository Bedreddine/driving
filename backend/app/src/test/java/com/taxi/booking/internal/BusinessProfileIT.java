package com.taxi.booking.internal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

import com.taxi.support.IntegrationTest;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.request.MockMultipartHttpServletRequestBuilder;
import tools.jackson.databind.JsonNode;

/** The driver's presentation on the booking website: name, car, what is on board, photo. */
class BusinessProfileIT extends IntegrationTest {

    private static final byte[] PNG = {(byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0x0D, 'I', 'H', 'D', 'R'};

    private static Map<String, Object> profile(Object... extra) {
        var m = new HashMap<String, Object>(); // allows nulls
        m.put("name", "Élysée Chauffeur");
        m.put("tagline_fr", "Votre chauffeur privé à Paris");
        m.put("tagline_en", "Your private driver in Paris");
        for (int i = 0; i < extra.length; i += 2) {
            m.put((String) extra[i], extra[i + 1]);
        }
        return m;
    }

    private static Map<String, Object> amenity(String labelFr, String labelEn, String detailFr, String detailEn) {
        var m = new HashMap<String, Object>();
        m.put("label_fr", labelFr);
        m.put("label_en", labelEn);
        m.put("detail_fr", detailFr);
        m.put("detail_en", detailEn);
        return m;
    }

    private MockMultipartHttpServletRequestBuilder upload(String filename, String contentType, byte[] bytes) {
        return multipart("/api/admin/business/photo").file(new MockMultipartFile("file", filename, contentType, bytes));
    }

    /** Uploads go through MockMvc directly (multipart builders are not plain request builders). */
    private JsonNode send(MockMultipartHttpServletRequestBuilder request, String token, int expectedStatus)
            throws Exception {
        if (token != null) {
            request.header("Authorization", "Bearer " + token);
        }
        var response = mvc.perform(request).andReturn().getResponse();
        var text = response.getContentAsString();
        assertThat(response.getStatus()).as(text).isEqualTo(expectedStatus);
        return text.isBlank() ? null : json.readTree(text);
    }

    private String sendError(MockMultipartHttpServletRequestBuilder request, String token, int status) throws Exception {
        return send(request, token, status).get("error").asString();
    }

    private JsonNode publicProfile() throws Exception {
        return call(get("/api/public/business"), null, null, 200);
    }

    @Test
    void startsWithDefaultsOnBoardAndNoDriverDetails() throws Exception {
        var p = publicProfile();
        assertThat(p.get("driver_name").isNull()).isTrue();
        assertThat(p.get("car").isNull()).isTrue();
        assertThat(p.get("photo_url").isNull()).isTrue();
        var amenities = p.get("amenities");
        assertThat(amenities.size()).isEqualTo(3);
        assertThat(amenities.get(0).get("label_fr").asString()).isEqualTo("Eau plate");
        assertThat(amenities.get(0).get("detail_en").asString()).isEqualTo("chilled, included");
        assertThat(amenities.get(1).get("label_en").asString()).isEqualTo("Non-smoking");
        assertThat(amenities.get(2).get("detail_fr").asString()).isEqualTo("USB-C · Lightning");
    }

    @Test
    void theOwnerSetsTheDriverCarAndWhatIsOnBoard() throws Exception {
        var saved = call(put("/api/admin/business"), ownerToken, profile("driver_name", "  Karim  ",
                "car", "Mercedes Classe E, noire", "amenities", List.of(
                        amenity("Wi-Fi", "Wi-Fi", "  ", null),
                        amenity(" Eau plate ", "Still water", "fraîche", "chilled"))), 200);
        assertThat(saved.get("driver_name").asString()).isEqualTo("Karim");

        var p = publicProfile();
        assertThat(p.get("driver_name").asString()).isEqualTo("Karim");
        assertThat(p.get("car").asString()).isEqualTo("Mercedes Classe E, noire");
        assertThat(p.get("name").asString()).isEqualTo("Élysée Chauffeur"); // existing fields still there
        var amenities = p.get("amenities");
        assertThat(amenities.size()).isEqualTo(2);
        assertThat(amenities.get(0).get("label_fr").asString()).isEqualTo("Wi-Fi"); // order kept
        assertThat(amenities.get(0).get("detail_fr").isNull()).as("empty detail stored as null").isTrue();
        assertThat(amenities.get(0).get("detail_en").isNull()).isTrue();
        assertThat(amenities.get(1).get("label_fr").asString()).isEqualTo("Eau plate"); // trimmed
        assertThat(amenities.get(1).get("detail_en").asString()).isEqualTo("chilled");

        // Without amenities the list stays as it is; blank driver details are cleared.
        call(put("/api/admin/business"), ownerToken, profile("driver_name", "", "car", null), 200);
        p = publicProfile();
        assertThat(p.get("driver_name").isNull()).isTrue();
        assertThat(p.get("car").isNull()).isTrue();
        assertThat(p.get("amenities").size()).isEqualTo(2);

        // An empty list empties it.
        call(put("/api/admin/business"), ownerToken, profile("amenities", List.of()), 200);
        assertThat(publicProfile().get("amenities").size()).isZero();
    }

    @Test
    void driverDetailsAndAmenitiesAreChecked() throws Exception {
        var twenty = new ArrayList<Object>();
        for (int i = 0; i < 20; i++) {
            twenty.add(amenity("Item " + i, "Item " + i, null, null));
        }
        call(put("/api/admin/business"), ownerToken, profile("amenities", twenty), 200);
        assertThat(publicProfile().get("amenities").size()).isEqualTo(20);

        var tooMany = new ArrayList<Object>(twenty);
        tooMany.add(amenity("One more", "One more", null, null));
        var listWithNull = new ArrayList<Object>();
        listWithNull.add(null);
        for (var bad : List.of(
                profile("amenities", tooMany),
                profile("driver_name", "x".repeat(61)),
                profile("car", "x".repeat(81)),
                profile("amenities", List.of(amenity("", "Water", null, null))),
                profile("amenities", List.of(amenity("Eau", null, null, null))),
                profile("amenities", List.of(amenity("x".repeat(41), "Water", null, null))),
                profile("amenities", List.of(amenity("Eau", "Water", "x".repeat(61), null))),
                profile("amenities", listWithNull),
                profile("amenities", "not a list"))) {
            assertThat(errorOf(put("/api/admin/business"), ownerToken, bad, 400)).as(bad.toString()).isEqualTo("BAD_INPUT");
        }
        assertThat(publicProfile().get("amenities").size()).as("nothing saved").isEqualTo(20);

        // Only the owner edits.
        call(put("/api/admin/business"), clientToken, profile("driver_name", "Hacker"), 403);
    }

    @Test
    void theOwnerUploadsReplacesAndRemovesTheDriverPhoto() throws Exception {
        call(get("/api/public/business/photo"), null, null, 404);

        send(upload("me.png", "image/png", PNG), ownerToken, 204);
        var url = publicProfile().get("photo_url").asString();
        assertThat(url).matches("/api/public/business/photo\\?v=[0-9a-f]{12}");

        var response = mvc.perform(get(url)).andReturn().getResponse();
        assertThat(response.getStatus()).isEqualTo(200);
        assertThat(response.getContentType()).isEqualTo("image/png");
        assertThat(response.getHeader("Cache-Control")).isEqualTo("public, max-age=31536000");
        assertThat(response.getContentAsByteArray()).isEqualTo(PNG);

        // A new photo gets a new address, so caches show it at once. The type comes from the content.
        var jpeg = new byte[] {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, (byte) 0xE0, 0, 0x10, 'J', 'F', 'I', 'F'};
        send(upload("me.png", "image/png", jpeg), ownerToken, 204);
        var newUrl = publicProfile().get("photo_url").asString();
        assertThat(newUrl).isNotEqualTo(url);
        assertThat(mvc.perform(get(newUrl)).andReturn().getResponse().getContentType()).isEqualTo("image/jpeg");

        var webp = "RIFF\0\0\0\0WEBPVP8 ".getBytes(java.nio.charset.StandardCharsets.ISO_8859_1);
        send(upload("me.webp", "image/webp", webp), ownerToken, 204);
        assertThat(mvc.perform(get("/api/public/business/photo")).andReturn().getResponse().getContentType())
                .isEqualTo("image/webp");

        call(delete("/api/admin/business/photo"), ownerToken, null, 204);
        assertThat(publicProfile().get("photo_url").isNull()).isTrue();
        assertThat(errorOf(get("/api/public/business/photo"), null, null, 404)).isEqualTo("NOT_FOUND");
    }

    @Test
    void onlyRealSmallImagesAreAccepted() throws Exception {
        // Claims to be a PNG, is text: refused on its content.
        assertThat(sendError(upload("me.png", "image/png", "hello, not an image".getBytes()), ownerToken, 400))
                .isEqualTo("BAD_IMAGE");
        // An SVG (could carry scripts) is refused too.
        assertThat(sendError(upload("me.svg", "image/svg+xml", "<svg xmlns='http://www.w3.org/2000/svg'/>".getBytes()),
                ownerToken, 400)).isEqualTo("BAD_IMAGE");
        assertThat(sendError(upload("empty.png", "image/png", new byte[0]), ownerToken, 400)).isEqualTo("BAD_IMAGE");
        assertThat(sendError(multipart("/api/admin/business/photo"), ownerToken, 400)).isEqualTo("BAD_IMAGE");

        var big = Arrays.copyOf(PNG, BusinessProfile.MAX_PHOTO_BYTES + 1);
        assertThat(sendError(upload("big.png", "image/png", big), ownerToken, 400)).isEqualTo("IMAGE_TOO_LARGE");
        var justRight = Arrays.copyOf(PNG, BusinessProfile.MAX_PHOTO_BYTES);
        send(upload("ok.png", "image/png", justRight), ownerToken, 204);

        // Only the owner.
        send(upload("me.png", "image/png", PNG), clientToken, 403);
        call(delete("/api/admin/business/photo"), clientToken, null, 403);
        send(upload("me.png", "image/png", PNG), null, 401);
        assertThat(mvc.perform(get("/api/public/business/photo")).andReturn().getResponse().getContentAsByteArray())
                .hasSize(BusinessProfile.MAX_PHOTO_BYTES); // still the owner's photo
    }

    // ------------------------------------------------------------------ legal details (mentions légales, CGV)

    private static final List<String> LEGAL_KEYS = List.of("company_name", "legal_form", "siret", "vat_number", "address",
            "evtc_number", "publication_director", "insurance", "payment_methods", "mediator_name", "mediator_url",
            "host_name", "host_address");

    private static Map<String, Object> legal(Object... kv) {
        var m = new HashMap<String, Object>();
        for (int i = 0; i < kv.length; i += 2) {
            m.put((String) kv[i], kv[i + 1]);
        }
        return m;
    }

    @Test
    void legalDetailsAreAlwaysPresentAndEmptyAtFirst() throws Exception {
        var l = publicProfile().get("legal");
        assertThat(l).isNotNull();
        assertThat(l.size()).isEqualTo(LEGAL_KEYS.size());
        for (var key : LEGAL_KEYS) {
            assertThat(l.has(key)).as(key).isTrue();
            assertThat(l.get(key).isNull()).as(key).isTrue();
        }
    }

    @Test
    void theOwnerFillsInTheLegalDetailsAndTheWebsiteShowsThem() throws Exception {
        var saved = call(put("/api/admin/business"), ownerToken, profile("legal", legal(
                "company_name", "  Élysée Chauffeur SASU ", "legal_form", "SASU au capital de 1 000 €",
                "siret", "123 456 789 00012", "vat_number", "FR12345678901", "address", "1 rue de Rivoli, 75001 Paris",
                "evtc_number", "EVTC075230001", "publication_director", "Karim B.", "insurance", "AXA, contrat 123",
                "payment_methods", "Carte bancaire, espèces", "mediator_name", "CM2C",
                "mediator_url", "https://www.cm2c.net", "host_name", "Hetzner Online GmbH",
                "host_address", "Industriestr. 25, 91710 Gunzenhausen, Allemagne")), 200);
        assertThat(saved.get("legal").get("company_name").asString()).isEqualTo("Élysée Chauffeur SASU");

        var l = publicProfile().get("legal");
        assertThat(l.get("company_name").asString()).isEqualTo("Élysée Chauffeur SASU"); // trimmed
        assertThat(l.get("siret").asString()).isEqualTo("12345678900012"); // stored without spaces
        assertThat(l.get("legal_form").asString()).isEqualTo("SASU au capital de 1 000 €");
        assertThat(l.get("vat_number").asString()).isEqualTo("FR12345678901");
        assertThat(l.get("address").asString()).isEqualTo("1 rue de Rivoli, 75001 Paris");
        assertThat(l.get("evtc_number").asString()).isEqualTo("EVTC075230001");
        assertThat(l.get("publication_director").asString()).isEqualTo("Karim B.");
        assertThat(l.get("insurance").asString()).isEqualTo("AXA, contrat 123");
        assertThat(l.get("payment_methods").asString()).isEqualTo("Carte bancaire, espèces");
        assertThat(l.get("mediator_name").asString()).isEqualTo("CM2C");
        assertThat(l.get("mediator_url").asString()).isEqualTo("https://www.cm2c.net");
        assertThat(l.get("host_name").asString()).isEqualTo("Hetzner Online GmbH");
        assertThat(l.get("host_address").asString()).startsWith("Industriestr. 25");

        // A save without the legal object (older back office) keeps them.
        call(put("/api/admin/business"), ownerToken, profile("driver_name", "Karim"), 200);
        assertThat(publicProfile().get("legal").get("siret").asString()).isEqualTo("12345678900012");

        // Blank values clear them; keys left out are cleared too (the object replaces the details).
        call(put("/api/admin/business"), ownerToken, profile("legal", legal("company_name", "   ", "siret", "",
                "insurance", "MAIF")), 200);
        l = publicProfile().get("legal");
        assertThat(l.get("company_name").isNull()).isTrue();
        assertThat(l.get("siret").isNull()).isTrue();
        assertThat(l.get("vat_number").isNull()).isTrue();
        assertThat(l.get("insurance").asString()).isEqualTo("MAIF");
    }

    @Test
    void legalDetailsAreChecked() throws Exception {
        call(put("/api/admin/business"), ownerToken, profile("legal", legal("siret", "12345678900012",
                "address", " " + "a".repeat(300) + " ", "mediator_url", "http://mediateur.example/x",
                "company_name", "c".repeat(200))), 200);

        for (var bad : List.of(
                legal("siret", "1234567890001"), // 13 digits
                legal("siret", "123456789000123"), // 15 digits
                legal("siret", "1234567890001A"),
                legal("address", "a".repeat(301)),
                legal("host_address", "a".repeat(301)),
                legal("mediator_url", "https://" + "a".repeat(293)),
                legal("mediator_url", "www.cm2c.net"),
                legal("mediator_url", "javascript:alert(1)"),
                legal("mediator_url", "https://bad url"),
                legal("company_name", "c".repeat(201)),
                legal("legal_form", "c".repeat(201)),
                legal("vat_number", "c".repeat(201)),
                legal("evtc_number", "c".repeat(201)),
                legal("publication_director", "c".repeat(201)),
                legal("insurance", "c".repeat(201)),
                legal("payment_methods", "c".repeat(201)),
                legal("mediator_name", "c".repeat(201)),
                legal("host_name", "c".repeat(201)))) {
            assertThat(errorOf(put("/api/admin/business"), ownerToken, profile("legal", bad), 400)).as(bad.toString())
                    .isEqualTo("BAD_INPUT");
        }
        assertThat(errorOf(put("/api/admin/business"), ownerToken, profile("legal", "not an object"), 400))
                .isEqualTo("BAD_INPUT");
        var l = publicProfile().get("legal");
        assertThat(l.get("siret").asString()).as("nothing saved").isEqualTo("12345678900012");
        assertThat(l.get("address").asString()).hasSize(300);

        // Only the owner edits.
        call(put("/api/admin/business"), clientToken, profile("legal", legal("company_name", "Hacker")), 403);
    }
}
