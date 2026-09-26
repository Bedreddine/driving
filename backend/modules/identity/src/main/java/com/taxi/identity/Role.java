package com.taxi.identity;

import java.util.Locale;

public enum Role {
    CUSTOMER,
    DRIVER,
    ADMIN;

    /** Name as stored in the database and sent to the app ("customer", "driver", "admin"). */
    public String value() {
        return name().toLowerCase(Locale.ROOT);
    }

    public static Role of(String value) {
        return valueOf(value.toUpperCase(Locale.ROOT));
    }
}
