package com.taxi.shared;

import static org.assertj.core.api.Assertions.assertThat;

import java.sql.SQLException;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;

class ApiErrorHandlerTest {

    @Test
    void constraintErrorsAreLoggedWithoutTheRow() {
        var cause = new SQLException("""
                ERROR: new row for relation "contacts" violates check constraint "contacts_language_check"
                  Detail: Failing row contains (Jane Doe, jane@example.com, +33612345678).""", "23514");
        var logged = ApiErrorHandler.constraintOf(new DataIntegrityViolationException("refused", cause));
        assertThat(logged).isEqualTo("SQLSTATE 23514, constraint contacts_language_check");
        assertThat(logged).doesNotContain("jane", "+336");
    }
}
