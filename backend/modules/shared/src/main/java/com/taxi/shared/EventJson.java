package com.taxi.shared;

import org.springframework.stereotype.Component;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.json.JsonMapper;

/**
 * The JSON of domain events, wherever they are written: the outbox table (event_publication), Kafka messages and
 * their consumers. It is the application's JSON (snake_case, ISO dates) except that decimals are read back as exact
 * decimals: a price 45.00 in a notice stays "45.00" in the email, never "45.0".
 * Not a JsonMapper bean on purpose: that would replace the application's own mapper.
 */
@Component
public class EventJson {

    private final JsonMapper mapper;

    public EventJson(JsonMapper json) {
        this.mapper = json.rebuild().enable(DeserializationFeature.USE_BIG_DECIMAL_FOR_FLOATS).build();
    }

    public JsonMapper mapper() {
        return mapper;
    }
}
