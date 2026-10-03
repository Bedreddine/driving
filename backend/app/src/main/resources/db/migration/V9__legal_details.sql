-- The company's legal details, filled in the back office and shown on the website's legal pages
-- (mentions légales, CGV, politique de confidentialité). All optional (null until the owner fills them in).
-- Lengths are checked by the app too; siret is stored as 14 digits without spaces.
alter table business_profile
  add column legal_company_name         text check (char_length(legal_company_name) <= 200),
  add column legal_form                 text check (char_length(legal_form) <= 200),
  add column legal_siret                text check (legal_siret ~ '^[0-9]{14}$'),
  add column legal_vat_number           text check (char_length(legal_vat_number) <= 200),
  add column legal_address              text check (char_length(legal_address) <= 300),
  add column legal_evtc_number          text check (char_length(legal_evtc_number) <= 200),
  add column legal_publication_director text check (char_length(legal_publication_director) <= 200),
  add column legal_insurance            text check (char_length(legal_insurance) <= 200),
  add column legal_payment_methods      text check (char_length(legal_payment_methods) <= 200),
  add column legal_mediator_name        text check (char_length(legal_mediator_name) <= 200),
  add column legal_mediator_url         text check (char_length(legal_mediator_url) <= 300),
  add column legal_host_name            text check (char_length(legal_host_name) <= 200),
  add column legal_host_address         text check (char_length(legal_host_address) <= 300);
