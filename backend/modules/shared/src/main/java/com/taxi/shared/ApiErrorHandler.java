package com.taxi.shared;

import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.HandlerMethodValidationException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.multipart.MultipartException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

/** Every error leaves the API as {"error": CODE} so the app can show a translated sentence. */
@RestControllerAdvice
class ApiErrorHandler {

    private static final Logger log = LoggerFactory.getLogger(ApiErrorHandler.class);

    @ExceptionHandler(ApiException.class)
    ResponseEntity<Map<String, String>> business(ApiException e) {
        return ResponseEntity.status(e.status()).body(Map.of("error", e.code()));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    ResponseEntity<Map<String, String>> invalid(MethodArgumentNotValidException e) {
        var field = e.getBindingResult().getFieldError();
        var message = field == null ? "invalid input" : field.getField() + " " + field.getDefaultMessage();
        return ResponseEntity.badRequest().body(Map.of("error", "BAD_INPUT", "message", message));
    }

    @ExceptionHandler({HttpMessageNotReadableException.class, MethodArgumentTypeMismatchException.class,
            HandlerMethodValidationException.class})
    ResponseEntity<Map<String, String>> unreadable(Exception e) {
        return ResponseEntity.badRequest().body(Map.of("error", "BAD_INPUT"));
    }

    /** An upload over the server's multipart limit (spring.servlet.multipart): same answer as the app's own check. */
    @ExceptionHandler(MaxUploadSizeExceededException.class)
    ResponseEntity<Map<String, String>> tooLarge(MaxUploadSizeExceededException e) {
        return ResponseEntity.badRequest().body(Map.of("error", "IMAGE_TOO_LARGE"));
    }

    /** A broken or unreadable upload. */
    @ExceptionHandler(MultipartException.class)
    ResponseEntity<Map<String, String>> badUpload(MultipartException e) {
        return ResponseEntity.badRequest().body(Map.of("error", "BAD_INPUT"));
    }

    /** A database rule refused the data (unknown reference, constraint): the input was wrong. */
    @ExceptionHandler(DataIntegrityViolationException.class)
    ResponseEntity<Map<String, String>> integrity(DataIntegrityViolationException e) {
        log.info("Refused by a database constraint: {}", e.getMostSpecificCause().getMessage());
        return ResponseEntity.badRequest().body(Map.of("error", "BAD_INPUT"));
    }

    @ExceptionHandler(NoResourceFoundException.class)
    ResponseEntity<Map<String, String>> notFound(Exception e) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "NOT_FOUND"));
    }

    @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
    ResponseEntity<Map<String, String>> method(Exception e) {
        return ResponseEntity.status(HttpStatus.METHOD_NOT_ALLOWED).body(Map.of("error", "METHOD_NOT_ALLOWED"));
    }

    @ExceptionHandler(org.springframework.security.access.AccessDeniedException.class)
    ResponseEntity<Map<String, String>> denied(Exception e) {
        return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "FORBIDDEN"));
    }

    /** Anything unexpected: logged with details, the client only gets a code. */
    @ExceptionHandler(Exception.class)
    ResponseEntity<Map<String, String>> unexpected(Exception e) {
        log.error("Unexpected error", e);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(Map.of("error", "INTERNAL"));
    }
}
