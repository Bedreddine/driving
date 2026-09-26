package com.taxi.shared;

import org.springframework.http.HttpStatus;

/**
 * A business error with a short, stable code (e.g. SLOT_TAKEN) that the app translates for the user.
 * Returned to clients as {@code {"error": "<code>"}}.
 */
public class ApiException extends RuntimeException {

    private final String code;
    private final HttpStatus status;

    public ApiException(HttpStatus status, String code) {
        super(code);
        this.code = code;
        this.status = status;
    }

    public static ApiException badRequest(String code) {
        return new ApiException(HttpStatus.BAD_REQUEST, code);
    }

    public static ApiException conflict(String code) {
        return new ApiException(HttpStatus.CONFLICT, code);
    }

    public static ApiException forbidden() {
        return new ApiException(HttpStatus.FORBIDDEN, "FORBIDDEN");
    }

    public static ApiException notFound() {
        return new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND");
    }

    public String code() {
        return code;
    }

    public HttpStatus status() {
        return status;
    }
}
