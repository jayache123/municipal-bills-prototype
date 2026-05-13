-- =========================================================================
-- Municipal Bills Prototype — Database Schema
-- =========================================================================
-- Safe to run multiple times. Run the whole file in the Supabase SQL Editor.
-- =========================================================================

create extension if not exists "pgcrypto";


-- =========================================================================
-- ENUMS
-- =========================================================================

do $$ begin
  create type property_status as enum ('active', 'inactive', 'sold');
exception when duplicate_object then null; end $$;

do $$ begin
  create type billing_frequency as enum ('monthly');
exception when duplicate_object then null; end $$;

do $$ begin
  create type utility_category as enum (
    'rates',
    'electricity',
    'water',
    'refuse',
    'sewerage',
    'improvement_district',
    'sundry',
    'other'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type line_type as enum (
    'charge',
    'rebate',
    'fixed_charge',
    'consumption_charge',
    'service_charge',
    'reversal',
    'subtotal',
    'informational'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type reading_type as enum ('actual', 'estimated', 'not_applicable');
exception when duplicate_object then null; end $$;

do $$ begin
  create type bill_status as enum (
    'expected',
    'received',
    'pending_review',
    'reviewed',
    'approved',
    'queried',
    'paid',
    'overdue',
    'not_applicable',
    'hard_rejected'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type severity as enum ('critical', 'warning', 'info');
exception when duplicate_object then null; end $$;


-- =========================================================================
-- HELPERS
-- =========================================================================

create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;


-- =========================================================================
-- TABLES
-- =========================================================================

-- Municipalities (e.g. "City of Cape Town").
create table if not exists municipalities (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);


-- Billing accounts: one row per municipal account number.
-- A single account can have multiple properties (e.g. one Erf with 3 units).
create table if not exists billing_accounts (
  id uuid primary key default gen_random_uuid(),
  municipality_id uuid not null references municipalities(id) on delete restrict,
  account_number text not null,
  business_partner_number text,
  customer_name text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (municipality_id, account_number)
);

drop trigger if exists trg_billing_accounts_updated_at on billing_accounts;
create trigger trg_billing_accounts_updated_at
before update on billing_accounts
for each row execute function set_updated_at();

create index if not exists idx_billing_accounts_municipality on billing_accounts(municipality_id);


-- Properties (units). Each unit belongs to a billing account.
-- Multi-unit complexes have a parent record (unit_number IS NULL) and child unit
-- records with parent_property_id pointing at the parent. Single-property accounts
-- (e.g. a standalone house) have no parent.
create table if not exists properties (
  id uuid primary key default gen_random_uuid(),
  billing_account_id uuid not null references billing_accounts(id) on delete restrict,
  -- Self-referential parent: child units point to the complex's parent record.
  parent_property_id uuid references properties(id) on delete set null,
  address text not null,
  complex_name text,
  unit_number text,
  erf_number text,
  suburb text,
  postal_code text,
  -- Latest known rateable valuation from rates line items.
  municipal_valuation numeric(14,2),
  status property_status not null default 'active',
  billing_frequency billing_frequency not null default 'monthly',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_properties_updated_at on properties;
create trigger trg_properties_updated_at
before update on properties
for each row execute function set_updated_at();

create index if not exists idx_properties_billing_account on properties(billing_account_id);
create index if not exists idx_properties_status on properties(status);
create index if not exists idx_properties_parent on properties(parent_property_id);


-- Bills. One row per PDF document.
create table if not exists bills (
  id uuid primary key default gen_random_uuid(),
  billing_account_id uuid not null references billing_accounts(id) on delete restrict,
  primary_property_id uuid references properties(id) on delete set null,
  tax_invoice_number text,
  billing_period_start date,
  billing_period_end date,
  issue_date date,
  due_date date,
  previous_balance numeric(12,2) not null default 0,
  payments_received numeric(12,2) not null default 0,
  current_amount_due numeric(12,2),
  total_amount_due numeric(12,2),
  amount_payable_after_credits numeric(12,2),
  total_vat numeric(12,2) not null default 0,
  raw_pdf_url text,
  raw_pdf_filename text,
  customer_name_extracted text,
  confidence_score numeric(5,2),
  extraction_pass_count int not null default 1,
  extraction_model text,
  status bill_status not null default 'received',
  -- Canonical billing period month (1st of month). Primary filter for dashboard/lists.
  summary_month date,
  -- AI-generated analytical bullet points for the reviewer (array of strings).
  ai_summary jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_bills_updated_at on bills;
create trigger trg_bills_updated_at
before update on bills
for each row execute function set_updated_at();

create index if not exists idx_bills_billing_account on bills(billing_account_id);
create index if not exists idx_bills_status on bills(status);
create index if not exists idx_bills_period on bills(billing_period_start, billing_period_end);
create index if not exists idx_bills_due_date on bills(due_date);
create index if not exists idx_bills_summary_month on bills(summary_month);


-- Bill line items. Section-level — one row per utility category per bill
-- (rates, electricity, water, refuse, sewerage, etc.). The 'notes' field carries
-- the rich breakdown: fixed/variable split, tier rates, reversal context.
create table if not exists bill_line_items (
  id uuid primary key default gen_random_uuid(),
  bill_id uuid not null references bills(id) on delete cascade,
  property_id uuid references properties(id) on delete set null,
  parent_line_item_id uuid references bill_line_items(id) on delete set null,
  line_order int not null,
  section_label text,
  utility_category utility_category not null,
  line_type line_type not null,
  description text,
  amount numeric(12,2),
  vat_rate numeric(5,2),
  period_start date,
  period_end date,
  period_days int,
  usage_value numeric(14,4),
  usage_unit text,
  rate numeric(14,6),
  rate_unit text,
  tariff_tier int,
  base_value numeric(14,2),
  meter_number text,
  opening_meter_reading numeric(14,3),
  closing_meter_reading numeric(14,3),
  reading_type reading_type,
  prior_estimate_value numeric(14,3),
  reconciliation_delta numeric(12,2),
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists idx_line_items_bill on bill_line_items(bill_id);
create index if not exists idx_line_items_property on bill_line_items(property_id);
create index if not exists idx_line_items_utility on bill_line_items(utility_category);
create index if not exists idx_line_items_parent on bill_line_items(parent_line_item_id);


-- Errors raised by validation rules during extraction.
create table if not exists bill_field_errors (
  id uuid primary key default gen_random_uuid(),
  bill_id uuid not null references bills(id) on delete cascade,
  line_item_id uuid references bill_line_items(id) on delete cascade,
  field_name text not null,
  rule_name text not null,
  severity severity not null,
  extracted_value text,
  message text,
  resolved boolean not null default false,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_errors_bill on bill_field_errors(bill_id);
create index if not exists idx_errors_severity on bill_field_errors(severity);
create index if not exists idx_errors_resolved on bill_field_errors(resolved);


-- Audit log: every status change, field edit, and config change writes here.
create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid not null,
  action text not null,
  field_name text,
  original_value text,
  new_value text,
  user_identifier text not null default 'admin',
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_entity on audit_log(entity_type, entity_id);
create index if not exists idx_audit_created on audit_log(created_at desc);


-- Settings: editable thresholds and configuration.
create table if not exists settings (
  key text primary key,
  value text not null,
  description text,
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_settings_updated_at on settings;
create trigger trg_settings_updated_at
before update on settings
for each row execute function set_updated_at();


-- =========================================================================
-- ROW-LEVEL SECURITY
-- =========================================================================
-- RLS is enabled with no policies. This blocks all direct client access.
-- Backend code uses SUPABASE_SERVICE_ROLE_KEY which bypasses RLS.
-- When user auth is added later, policies go here.

alter table municipalities      enable row level security;
alter table billing_accounts    enable row level security;
alter table properties          enable row level security;
alter table bills               enable row level security;
alter table bill_line_items     enable row level security;
alter table bill_field_errors   enable row level security;
alter table audit_log           enable row level security;
alter table settings            enable row level security;


-- =========================================================================
-- SEED: default settings
-- =========================================================================

insert into settings (key, value, description) values
  ('confidence_threshold_auto_approve',  '90',                  'Minimum overall extraction confidence (0-100) required to auto-approve a bill.'),
  ('confidence_threshold_review',        '60',                  'Below this confidence (0-100), trigger a two-pass extraction.'),
  ('variance_threshold_percent',         '30',                  'Percent above/below rolling baseline before flagging a variance warning.'),
  ('variance_baseline_months',           '3',                   'Number of prior months used to compute the rolling baseline.'),
  ('google_drive_folder_url',            '',                    'Google Drive folder URL synced by the Drive sync action.'),
  ('billing_cycle_day',                  '1',                   'Day of month on which expected-bill records are generated.'),
  ('expected_bill_grace_days',           '7',                   'Days after expected date before missing-invoice flag fires.'),
  ('anthropic_model',                    'claude-sonnet-4-6',   'Anthropic model used for PDF extraction.'),
  ('two_pass_number_absolute_tolerance', '0.01',                'Absolute tolerance for numeric two-pass disagreement.'),
  ('two_pass_number_percent_tolerance',  '0.1',                 'Percent tolerance for numeric two-pass disagreement.'),
  ('warnings_block_auto_approve',        'true',                'If true, any unresolved warning prevents auto-approve (strict mode).')
on conflict (key) do nothing;


-- =========================================================================
-- SEED: example data (City of Cape Town, 4 billing accounts, 8 properties)
-- =========================================================================
do $$
declare
  cape_town_id     uuid;
  acc_twin_towers  uuid;
  acc_rockaways    uuid;
  acc_atholl       uuid;
  acc_vredefort    uuid;
begin
  insert into municipalities (name) values ('City of Cape Town')
    on conflict (name) do nothing;
  select id into cape_town_id from municipalities where name = 'City of Cape Town';

  -- Twin Towers (Erf 1099, 3 units)
  if not exists (select 1 from billing_accounts where account_number = '228414930' and municipality_id = cape_town_id) then
    insert into billing_accounts (municipality_id, account_number, business_partner_number, customer_name)
      values (cape_town_id, '228414930', '1002269520', 'J AYACHE & RE KRUGER')
      returning id into acc_twin_towers;
    insert into properties (billing_account_id, address, complex_name, unit_number, erf_number, suburb, postal_code) values
      (acc_twin_towers, '22 Fort Road', 'Twin Towers', '65',  '1099', 'Three Anchor Bay', '8005'),
      (acc_twin_towers, '22 Fort Road', 'Twin Towers', '117', '1099', 'Three Anchor Bay', '8005'),
      (acc_twin_towers, '22 Fort Road', 'Twin Towers', '191', '1099', 'Three Anchor Bay', '8005');
  end if;

  -- Rockaways (Erf 1705, 3 units)
  if not exists (select 1 from billing_accounts where account_number = '219850405' and municipality_id = cape_town_id) then
    insert into billing_accounts (municipality_id, account_number, business_partner_number, customer_name)
      values (cape_town_id, '219850405', '1000724716', 'JANET GAY JG AYACHE')
      returning id into acc_rockaways;
    insert into properties (billing_account_id, address, complex_name, unit_number, erf_number, suburb, postal_code) values
      (acc_rockaways, '225 Main Road', 'Rockaways', '68', '1705', 'Three Anchor Bay', '8005'),
      (acc_rockaways, '225 Main Road', 'Rockaways', '34', '1705', 'Three Anchor Bay', '8005'),
      (acc_rockaways, '225 Main Road', 'Rockaways', '2',  '1705', 'Three Anchor Bay', '8005');
  end if;

  -- 19 Atholl Road (Erf 691, single property)
  if not exists (select 1 from billing_accounts where account_number = '239130147' and municipality_id = cape_town_id) then
    insert into billing_accounts (municipality_id, account_number, business_partner_number, customer_name)
      values (cape_town_id, '239130147', '1002269520', 'J AYACHE AND RE KRUGER')
      returning id into acc_atholl;
    insert into properties (billing_account_id, address, complex_name, unit_number, erf_number, suburb, postal_code) values
      (acc_atholl, '19 Atholl Road', null, null, '691', 'Camps Bay / Bakoven', '8000');
  end if;

  -- 3B Vredefort (Erf 1010, unit 24)
  if not exists (select 1 from billing_accounts where account_number = '235055327' and municipality_id = cape_town_id) then
    insert into billing_accounts (municipality_id, account_number, business_partner_number, customer_name)
      values (cape_town_id, '235055327', '1001862386', 'ESTATE OF THE LATE MRS GJ KRUGER')
      returning id into acc_vredefort;
    insert into properties (billing_account_id, address, complex_name, unit_number, erf_number, suburb, postal_code) values
      (acc_vredefort, '269 Beach Road', '3B Vredefort', '24', '1010', 'Sea Point', '8005');
  end if;
end $$;
