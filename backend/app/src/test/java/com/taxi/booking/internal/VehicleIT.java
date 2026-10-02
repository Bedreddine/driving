package com.taxi.booking.internal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
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

/** The driver's car on the booking website: details and photos of the outside and inside. */
class VehicleIT extends IntegrationTest {

    private static final byte[] PNG = {(byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0x0D, 'I', 'H', 'D', 'R'};
    private static final byte[] JPEG = {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, (byte) 0xE0, 0, 0x10, 'J', 'F', 'I', 'F'};
    private static final String PHOTOS = "/api/admin/business/vehicle-photos";

    private static Map<String, Object> profile(Object vehicle) {
        var m = new HashMap<String, Object>(); // allows nulls
        m.put("name", "Élysée Chauffeur");
        m.put("tagline_fr", "Votre chauffeur privé à Paris");
        m.put("tagline_en", "Your private driver in Paris");
        m.put("car", "Mercedes Classe E, noire");
        if (vehicle != null) {
            m.put("vehicle", vehicle);
        }
        return m;
    }

    private static Map<String, Object> vehicle(Object... fields) {
        var m = new HashMap<String, Object>();
        for (int i = 0; i < fields.length; i += 2) {
            m.put((String) fields[i], fields[i + 1]);
        }
        return m;
    }

    private static MockMultipartHttpServletRequestBuilder upload(byte[] bytes, String kind, String caption) {
        var request = multipart(PHOTOS).file(new MockMultipartFile("file", "car.png", "image/png", bytes));
        if (kind != null) {
            request.param("kind", kind);
        }
        if (caption != null) {
            request.param("caption", caption);
        }
        return request;
    }

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

    private String sendError(MockMultipartHttpServletRequestBuilder request, int status) throws Exception {
        return send(request, ownerToken, status).get("error").asString();
    }

    private JsonNode publicVehicle() throws Exception {
        return call(get("/api/public/business"), null, null, 200).get("vehicle");
    }

    private List<String> photoIds() throws Exception {
        var ids = new ArrayList<String>();
        publicVehicle().get("photos").forEach(p -> ids.add(p.get("id").asString()));
        return ids;
    }

    private String add(String caption) throws Exception {
        return send(upload(PNG, "exterior", caption), ownerToken, 201).get("id").asString();
    }

    @Test
    void startsEmpty() throws Exception {
        var v = publicVehicle();
        assertThat(v.get("model").isNull()).isTrue();
        assertThat(v.get("color").isNull()).isTrue();
        assertThat(v.get("category").isNull()).isTrue();
        assertThat(v.get("year").isNull()).isTrue();
        assertThat(v.get("features").isArray()).isTrue();
        assertThat(v.get("features").size()).isZero();
        assertThat(v.get("photos").size()).isZero();
    }

    @Test
    void theOwnerDescribesTheCar() throws Exception {
        var saved = call(put("/api/admin/business"), ownerToken, profile(vehicle(
                "model", "  Mercedes Classe E 300e ", "color", "Noir obsidienne", "category", "electric",
                "year", 2023, "features", List.of(" Sièges cuir ", "Vitres teintées"))), 200);
        assertThat(saved.get("vehicle").get("model").asString()).isEqualTo("Mercedes Classe E 300e");

        var v = publicVehicle();
        assertThat(v.get("model").asString()).isEqualTo("Mercedes Classe E 300e");
        assertThat(v.get("color").asString()).isEqualTo("Noir obsidienne");
        assertThat(v.get("category").asString()).isEqualTo("electric");
        assertThat(v.get("year").asInt()).isEqualTo(2023);
        assertThat(v.get("features").get(0).asString()).isEqualTo("Sièges cuir");
        assertThat(v.get("features").get(1).asString()).isEqualTo("Vitres teintées");
        assertThat(call(get("/api/public/business"), null, null, 200).get("car").asString())
                .as("old free text kept").isEqualTo("Mercedes Classe E, noire");

        // Without "vehicle" nothing changes.
        call(put("/api/admin/business"), ownerToken, profile(null), 200);
        assertThat(publicVehicle().get("model").asString()).isEqualTo("Mercedes Classe E 300e");
        assertThat(publicVehicle().get("features").size()).isEqualTo(2);

        // Blank texts are cleared, missing fields too.
        call(put("/api/admin/business"), ownerToken, profile(vehicle("model", " ", "color", "", "category", "")), 200);
        v = publicVehicle();
        assertThat(v.get("model").isNull()).isTrue();
        assertThat(v.get("color").isNull()).isTrue();
        assertThat(v.get("category").isNull()).isTrue();
        assertThat(v.get("year").isNull()).isTrue();
        assertThat(v.get("features").size()).isZero();
    }

    @Test
    void carDetailsAreChecked() throws Exception {
        var ten = new ArrayList<String>();
        for (int i = 0; i < 10; i++) {
            ten.add("Feature " + i);
        }
        call(put("/api/admin/business"), ownerToken, profile(vehicle("model", "x".repeat(80), "color", "x".repeat(40),
                "category", "van", "year", 1990, "features", ten)), 200);

        var eleven = new ArrayList<>(ten);
        eleven.add("One more");
        var withNull = new ArrayList<String>();
        withNull.add(null);
        for (var bad : List.of(
                vehicle("model", "x".repeat(81)),
                vehicle("color", "x".repeat(41)),
                vehicle("category", "limousine"),
                vehicle("year", 1989),
                vehicle("year", 2101),
                vehicle("year", "soon"),
                vehicle("features", eleven),
                vehicle("features", List.of("")),
                vehicle("features", List.of("  ")),
                vehicle("features", List.of("x".repeat(41))),
                vehicle("features", withNull),
                vehicle("features", "Sièges cuir"))) {
            assertThat(errorOf(put("/api/admin/business"), ownerToken, profile(bad), 400)).as(bad.toString())
                    .isEqualTo("BAD_INPUT");
        }
        var v = publicVehicle();
        assertThat(v.get("category").asString()).as("nothing saved").isEqualTo("van");
        assertThat(v.get("features").size()).isEqualTo(10);

        call(put("/api/admin/business"), clientToken, profile(vehicle("model", "Hacked")), 403);
    }

    @Test
    void theOwnerUploadsPhotosShownInOrder() throws Exception {
        var first = send(upload(PNG, null, null), ownerToken, 201);
        assertThat(first.get("kind").asString()).as("default kind").isEqualTo("exterior");
        assertThat(first.get("caption").isNull()).isTrue();
        var id = first.get("id").asString();
        assertThat(first.get("url").asString()).matches("/api/public/business/vehicle-photos/" + id + "\\?v=[0-9a-f]{12}");

        var second = send(upload(JPEG, "interior", "  Banquette arrière "), ownerToken, 201);
        assertThat(second.get("kind").asString()).isEqualTo("interior");
        assertThat(second.get("caption").asString()).isEqualTo("Banquette arrière");

        var photos = publicVehicle().get("photos");
        assertThat(photos.size()).isEqualTo(2);
        assertThat(photos.get(0).get("id").asString()).isEqualTo(id);
        assertThat(photos.get(0).get("url").asString()).isEqualTo(first.get("url").asString());
        assertThat(photos.get(1).get("id").asString()).isEqualTo(second.get("id").asString());
        assertThat(photos.get(1).get("kind").asString()).isEqualTo("interior");
        assertThat(photos.get(1).get("caption").asString()).isEqualTo("Banquette arrière");

        // Served with its own type (from the content), cached for long.
        var png = mvc.perform(get(first.get("url").asString())).andReturn().getResponse();
        assertThat(png.getStatus()).isEqualTo(200);
        assertThat(png.getContentType()).isEqualTo("image/png");
        assertThat(png.getHeader("Cache-Control")).isEqualTo("public, max-age=31536000");
        assertThat(png.getContentAsByteArray()).isEqualTo(PNG);
        var jpeg = mvc.perform(get(second.get("url").asString())).andReturn().getResponse();
        assertThat(jpeg.getContentType()).isEqualTo("image/jpeg");
        assertThat(jpeg.getContentAsByteArray()).isEqualTo(JPEG);

        assertThat(errorOf(get("/api/public/business/vehicle-photos/00000000-0000-0000-0000-000000000000"), null, null,
                404)).isEqualTo("NOT_FOUND");
        assertThat(errorOf(get("/api/public/business/vehicle-photos/nope"), null, null, 404)).isEqualTo("NOT_FOUND");
    }

    @Test
    void onlyRealSmallImagesAndTwelveAtMost() throws Exception {
        assertThat(sendError(upload("hello, not an image".getBytes(), null, null), 400)).isEqualTo("BAD_IMAGE");
        assertThat(sendError(upload(new byte[0], null, null), 400)).isEqualTo("BAD_IMAGE");
        assertThat(sendError(multipart(PHOTOS), 400)).isEqualTo("BAD_IMAGE");
        assertThat(sendError(upload(Arrays.copyOf(PNG, BusinessProfile.MAX_PHOTO_BYTES + 1), null, null), 400))
                .isEqualTo("IMAGE_TOO_LARGE");
        assertThat(sendError(upload(PNG, "roof", null), 400)).isEqualTo("BAD_INPUT");
        assertThat(sendError(upload(PNG, null, "x".repeat(61)), 400)).isEqualTo("BAD_INPUT");
        assertThat(publicVehicle().get("photos").size()).isZero();

        send(upload(Arrays.copyOf(PNG, BusinessProfile.MAX_PHOTO_BYTES), null, null), ownerToken, 201);
        for (int i = 1; i < 12; i++) {
            add("Photo " + i);
        }
        assertThat(sendError(upload(PNG, null, null), 409)).isEqualTo("TOO_MANY_PHOTOS");
        assertThat(publicVehicle().get("photos").size()).isEqualTo(12);
    }

    @Test
    void theOwnerReordersRelabelsAndDeletes() throws Exception {
        var a = add("A");
        var b = add("B");
        var c = add("C");
        var d = add("D");

        // Move D to the front: the others shift down.
        call(patch(PHOTOS + "/" + d), ownerToken, Map.of("position", 0), 204);
        assertThat(photoIds()).containsExactly(d, a, b, c);
        // Move D to the end, past the last place (clamped).
        call(patch(PHOTOS + "/" + d), ownerToken, Map.of("position", 99), 204);
        assertThat(photoIds()).containsExactly(a, b, c, d);
        // Move A to the middle; negative is clamped to the start.
        call(patch(PHOTOS + "/" + a), ownerToken, Map.of("position", 2), 204);
        assertThat(photoIds()).containsExactly(b, c, a, d);
        call(patch(PHOTOS + "/" + d), ownerToken, Map.of("position", -5), 204);
        assertThat(photoIds()).containsExactly(d, b, c, a);

        // Kind and caption; fields left out are kept, a blank caption clears it.
        call(patch(PHOTOS + "/" + b), ownerToken, Map.of("kind", "interior", "caption", "Tableau de bord"), 204);
        var photo = publicVehicle().get("photos").get(1);
        assertThat(photo.get("kind").asString()).isEqualTo("interior");
        assertThat(photo.get("caption").asString()).isEqualTo("Tableau de bord");
        call(patch(PHOTOS + "/" + b), ownerToken, Map.of("caption", " "), 204);
        photo = publicVehicle().get("photos").get(1);
        assertThat(photo.get("kind").asString()).isEqualTo("interior");
        assertThat(photo.get("caption").isNull()).isTrue();

        assertThat(errorOf(patch(PHOTOS + "/" + b), ownerToken, Map.of("kind", "roof"), 400)).isEqualTo("BAD_INPUT");
        assertThat(errorOf(patch(PHOTOS + "/" + b), ownerToken, Map.of("caption", "x".repeat(61)), 400))
                .isEqualTo("BAD_INPUT");
        var unknown = PHOTOS + "/00000000-0000-0000-0000-000000000000";
        assertThat(errorOf(patch(unknown), ownerToken, Map.of("position", 0), 404)).isEqualTo("NOT_FOUND");

        // Delete: the ones after move up, and a new photo goes at the end.
        call(delete(PHOTOS + "/" + b), ownerToken, null, 204);
        assertThat(photoIds()).containsExactly(d, c, a);
        call(delete(PHOTOS + "/" + b), ownerToken, null, 404);
        var e = add("E");
        assertThat(photoIds()).containsExactly(d, c, a, e);
        call(patch(PHOTOS + "/" + e), ownerToken, Map.of("position", 0), 204);
        assertThat(photoIds()).containsExactly(e, d, c, a);
        var positions = jdbc.sql("select position from vehicle_photos order by position").query(Integer.class).list();
        assertThat(positions).containsExactly(0, 1, 2, 3);
    }

    @Test
    void onlyTheOwnerManagesPhotos() throws Exception {
        var id = add("Mine");
        send(upload(PNG, null, null), clientToken, 403);
        send(upload(PNG, null, null), null, 401);
        call(patch(PHOTOS + "/" + id), clientToken, Map.of("position", 0), 403);
        call(patch(PHOTOS + "/" + id), null, Map.of("position", 0), 401);
        call(delete(PHOTOS + "/" + id), clientToken, null, 403);
        call(delete(PHOTOS + "/" + id), null, null, 401);
        assertThat(photoIds()).containsExactly(id);
    }
}
