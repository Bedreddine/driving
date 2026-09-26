package com.taxi.identity;

import java.util.UUID;

/** Makes an existing account the business owner (driver + admin). Never exposed over HTTP. */
public interface Owners {

    UUID makeOwner(String email);
}
