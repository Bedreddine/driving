-- The driver on the booking website: name, car, photo, and what is on board ("À bord").

alter table business_profile
  add column driver_name   text check (char_length(driver_name) <= 60),
  add column car           text check (char_length(car) <= 80),           -- e.g. 'Mercedes Classe E, noire'
  -- Ordered list of {label_fr, label_en, detail_fr, detail_en} (details may be null), at most 20, set by the owner.
  -- Starts with sensible defaults; the owner edits them in the back office.
  add column amenities     jsonb not null default '[
    {"label_fr": "Eau plate",  "label_en": "Still water", "detail_fr": "fraîche, offerte",  "detail_en": "chilled, included"},
    {"label_fr": "Non-fumeur", "label_en": "Non-smoking", "detail_fr": "toujours",          "detail_en": "always"},
    {"label_fr": "Chargeurs",  "label_en": "Chargers",    "detail_fr": "USB-C · Lightning", "detail_en": "USB-C · Lightning"}
  ]'::jsonb check (jsonb_typeof(amenities) = 'array' and jsonb_array_length(amenities) <= 20),
  -- Driver photo, served by the app itself (no file storage to run). JPEG, PNG or WebP, 3 MB at most.
  add column photo         bytea,
  add column photo_type    text check (photo_type in ('image/jpeg', 'image/png', 'image/webp')),
  add column photo_version text,                                         -- start of the photo hash, in its URL
  add constraint business_profile_photo_complete
    check ((photo is null) = (photo_type is null) and (photo is null) = (photo_version is null));
