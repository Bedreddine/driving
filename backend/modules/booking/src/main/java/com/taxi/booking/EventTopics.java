package com.taxi.booking;

/**
 * Kafka topics of the domain events (see README, "Events and Kafka"). Events are JSON; the header
 * {@value #EVENT_TYPE_HEADER} names the event (e.g. "RideChanged"), so consumers know what to read without
 * depending on Java class names.
 */
public final class EventTopics {

    /** {@link RideChanged}, {@link RideMomentReached}, {@link RideMessagePosted} and ReviewSubmitted, keyed by ride id. */
    public static final String RIDE_EVENTS = "taxi.ride-events";

    /** {@link CustomerForgotten}, keyed by contact id. */
    public static final String CUSTOMER_EVENTS = "taxi.customer-events";

    /** Messages a consumer could not handle (after retries) go to the same topic name plus this suffix. */
    public static final String DEAD_LETTER_SUFFIX = ".DLT";

    /** Header with the event's simple name ("RideChanged"...). */
    public static final String EVENT_TYPE_HEADER = "taxi-event";

    private EventTopics() {}
}
