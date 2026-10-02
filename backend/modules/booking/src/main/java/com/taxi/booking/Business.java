package com.taxi.booking;

/** The business shown on the booking website and in customer messages. */
public interface Business {

    Info info();

    /**
     * @param siteUrl public address of the booking website (null until deployed); links and the QR code use it
     */
    record Info(String name, String taglineFr, String taglineEn, String phone, String email, String siteUrl,
                String appStoreUrl, String playStoreUrl) {

        /** Link a customer opens to follow one ride, or null when the website address is not set yet. */
        public String rideLink(String accessToken) {
            if (siteUrl == null || siteUrl.isBlank() || accessToken == null) {
                return null;
            }
            return siteUrl.replaceAll("/+$", "") + "/b/" + accessToken;
        }
    }
}
