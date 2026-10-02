package com.taxi.booking.internal;

import com.taxi.shared.ApiException;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.io.IOException;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

/**
 * Photos of the driver's car (outside and inside), shown on the booking website in the owner's order.
 * Stored in the database like the driver photo, same checks (JPEG, PNG or WebP by content, 3 MB at most).
 */
@RestController
class VehiclePhotos {

    static final int MAX_PHOTOS = 12;

    private static final String KIND = "exterior|interior";

    /**
     * One photo as the website shows it. url is relative and changes with the image, so caches can keep it.
     *
     * @param url e.g. /api/public/business/vehicle-photos/{id}?v=3fa9c1d2e4b5
     */
    record VehiclePhoto(UUID id, String kind, String caption, String url) {}

    /** Fields left out (null) are kept. A blank caption removes it. position is 0 for the first photo, clamped. */
    record Change(@Pattern(regexp = KIND) String kind, @Size(max = 60) String caption, Integer position) {}

    private record Image(byte[] bytes, String type) {}

    private final JdbcClient jdbc;

    VehiclePhotos(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /** All photos, in the owner's order. */
    List<VehiclePhoto> list() {
        return jdbc.sql("select id, kind, caption, version from vehicle_photos order by position, created_at")
                .query((rs, n) -> photo(rs.getObject("id", UUID.class), rs.getString("kind"),
                        rs.getString("caption"), rs.getString("version")))
                .list();
    }

    private static VehiclePhoto photo(UUID id, String kind, String caption, String version) {
        return new VehiclePhoto(id, kind, caption, "/api/public/business/vehicle-photos/" + id + "?v=" + version);
    }

    /** Public, cached for a year: the URL changes with the image (?v=...). */
    @GetMapping("/api/public/business/vehicle-photos/{id}")
    ResponseEntity<byte[]> download(@PathVariable String id) {
        var image = jdbc.sql("select photo, photo_type from vehicle_photos where id = :id")
                .param("id", parseId(id))
                .query((rs, n) -> new Image(rs.getBytes("photo"), rs.getString("photo_type")))
                .optional().orElseThrow(ApiException::notFound);
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(image.type()))
                .header(HttpHeaders.CACHE_CONTROL, "public, max-age=31536000")
                .body(image.bytes());
    }

    /** Adds a photo at the end. kind defaults to exterior. */
    @PostMapping("/api/admin/business/vehicle-photos")
    @ResponseStatus(HttpStatus.CREATED)
    @Transactional
    VehiclePhoto upload(@RequestParam(name = "file", required = false) MultipartFile file,
                        @RequestParam(name = "kind", required = false) String kind,
                        @RequestParam(name = "caption", required = false) String caption) throws IOException {
        kind = kind == null || kind.isBlank() ? "exterior" : kind.trim();
        if (!kind.matches(KIND)) {
            throw ApiException.badRequest("BAD_INPUT");
        }
        caption = blankToNull(caption);
        if (caption != null && caption.length() > 60) {
            throw ApiException.badRequest("BAD_INPUT");
        }
        if (file == null || file.isEmpty()) {
            throw ApiException.badRequest("BAD_IMAGE");
        }
        if (file.getSize() > BusinessProfile.MAX_PHOTO_BYTES) {
            throw ApiException.badRequest("IMAGE_TOO_LARGE");
        }
        var bytes = file.getBytes();
        var type = BusinessProfile.imageType(bytes);
        if (type == null) {
            throw ApiException.badRequest("BAD_IMAGE");
        }
        lock();
        var count = count();
        if (count >= MAX_PHOTOS) {
            throw ApiException.conflict("TOO_MANY_PHOTOS");
        }
        var version = BusinessProfile.sha256(bytes).substring(0, 12);
        var id = jdbc.sql("""
                insert into vehicle_photos (kind, caption, position, photo, photo_type, version)
                values (:kind, :caption, :position, :photo, :type, :version) returning id""")
                .param("kind", kind).param("caption", caption).param("position", count)
                .param("photo", bytes).param("type", type).param("version", version)
                .query(UUID.class).single();
        return photo(id, kind, caption, version);
    }

    /** Changes the kind or caption, or moves the photo (the others shift to make room). */
    @PatchMapping("/api/admin/business/vehicle-photos/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Transactional
    void change(@PathVariable String id, @RequestBody @Valid Change c) {
        var photoId = parseId(id);
        lock();
        var from = position(photoId).orElseThrow(ApiException::notFound);
        if (c.kind() != null) {
            jdbc.sql("update vehicle_photos set kind = :kind where id = :id")
                    .param("kind", c.kind()).param("id", photoId).update();
        }
        if (c.caption() != null) {
            jdbc.sql("update vehicle_photos set caption = :caption where id = :id")
                    .param("caption", blankToNull(c.caption())).param("id", photoId).update();
        }
        if (c.position() != null) {
            var to = Math.clamp(c.position(), 0, count() - 1);
            if (to < from) {
                jdbc.sql("update vehicle_photos set position = position + 1 where position >= :to and position < :from")
                        .param("to", to).param("from", from).update();
            } else if (to > from) {
                jdbc.sql("update vehicle_photos set position = position - 1 where position > :from and position <= :to")
                        .param("to", to).param("from", from).update();
            }
            jdbc.sql("update vehicle_photos set position = :to where id = :id").param("to", to).param("id", photoId).update();
        }
    }

    /** Removes a photo; the ones after it move up. */
    @DeleteMapping("/api/admin/business/vehicle-photos/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Transactional
    void delete(@PathVariable String id) {
        var photoId = parseId(id);
        lock();
        var from = position(photoId).orElseThrow(ApiException::notFound);
        jdbc.sql("delete from vehicle_photos where id = :id").param("id", photoId).update();
        jdbc.sql("update vehicle_photos set position = position - 1 where position > :from").param("from", from).update();
    }

    /** Photo changes one at a time (count and positions stay right with two back-office tabs open). */
    private void lock() {
        jdbc.sql("select id from business_profile for update").query(Boolean.class).list();
    }

    private int count() {
        return jdbc.sql("select count(*) from vehicle_photos").query(Integer.class).single();
    }

    private Optional<Integer> position(UUID id) {
        return jdbc.sql("select position from vehicle_photos where id = :id").param("id", id)
                .query(Integer.class).optional();
    }

    /** Not a UUID: no such photo. */
    private static UUID parseId(String id) {
        try {
            return UUID.fromString(id);
        } catch (IllegalArgumentException e) {
            throw ApiException.notFound();
        }
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}
