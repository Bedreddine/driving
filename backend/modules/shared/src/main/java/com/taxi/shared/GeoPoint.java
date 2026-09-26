package com.taxi.shared;

/** A point on Earth, in degrees. */
public record GeoPoint(double lat, double lng) {

    private static final double EARTH_RADIUS_M = 6_371_000;

    public GeoPoint {
        if (lat < -90 || lat > 90 || lng < -180 || lng > 180 || Double.isNaN(lat) || Double.isNaN(lng)) {
            throw ApiException.badRequest("BAD_INPUT");
        }
    }

    /** Great-circle (straight line) distance in meters. */
    public double distanceTo(GeoPoint o) {
        double dLat = Math.toRadians(o.lat - lat);
        double dLng = Math.toRadians(o.lng - lng);
        double h = Math.pow(Math.sin(dLat / 2), 2)
                + Math.cos(Math.toRadians(lat)) * Math.cos(Math.toRadians(o.lat)) * Math.pow(Math.sin(dLng / 2), 2);
        return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
    }
}
