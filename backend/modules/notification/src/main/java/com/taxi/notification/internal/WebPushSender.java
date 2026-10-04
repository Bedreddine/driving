package com.taxi.notification.internal;

/** Delivers one encrypted message to one browser's push service. */
interface WebPushSender {

    /**
     * @return the push service's HTTP status (201 = accepted, 404 / 410 = the browser unsubscribed)
     * @throws Exception when the push service cannot be reached
     */
    int send(String endpoint, String p256dh, String auth, byte[] payload) throws Exception;
}
