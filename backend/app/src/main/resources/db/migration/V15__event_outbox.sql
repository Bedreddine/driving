-- Domain events go to Kafka through a transactional outbox (Spring Modulith event publication registry, JDBC).
-- Same structure as Spring Modulith 2.1's own schema (schemas/v2/schema-postgresql.sql); created here so that
-- Flyway owns every table (spring.modulith.events.jdbc.schema-initialization.enabled stays false).
-- An event is saved here in the transaction that publishes it, and deleted once Kafka has it
-- (completion-mode delete); rows left over are sent again.
create table event_publication (
  id                     uuid                     not null primary key,
  listener_id            text                     not null,
  event_type             text                     not null,
  serialized_event       text                     not null,
  publication_date       timestamp with time zone not null,
  completion_date        timestamp with time zone,
  status                 text,
  completion_attempts    int,
  last_resubmission_date timestamp with time zone
);
create index event_publication_serialized_event_hash_idx on event_publication using hash (serialized_event);
create index event_publication_by_completion_date_idx on event_publication (completion_date);

-- Idempotent consumer (notification module): ids of the events already handled, written in the same transaction
-- as the notices / queued emails of the event. A second delivery of the same event is skipped.
create table processed_events (
  event_id     uuid        not null primary key,
  processed_at timestamptz not null default now()
);
create index processed_events_processed_at_idx on processed_events (processed_at);
