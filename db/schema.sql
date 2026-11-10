-- canchas-api — esquema completo.
-- Aplicar con: pnpm db:apply
--
-- La pieza importante es la restricción de exclusión de `reservations`: impide
-- que dos reservas activas de la misma cancha se solapen. La comprobación la
-- hace PostgreSQL, no la aplicación, así que dos peticiones simultáneas no
-- pueden colarse entre la lectura y la escritura.

create extension if not exists btree_gist;

create table if not exists businesses (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  api_key_hash       text not null unique,
  utc_offset_minutes integer not null default -240,
  created_at         timestamptz not null default now()
);

create table if not exists courts (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references businesses (id) on delete cascade,
  name          text not null,
  opens_at      integer not null check (opens_at between 0 and 1439),
  closes_at     integer not null check (closes_at between 1 and 1440),
  slot_minutes  integer not null default 60 check (slot_minutes between 15 and 240),
  created_at    timestamptz not null default now(),
  constraint courts_hours check (closes_at > opens_at),
  unique (business_id, name)
);

create table if not exists reservations (
  id             uuid primary key default gen_random_uuid(),
  business_id    uuid not null references businesses (id) on delete cascade,
  court_id       uuid not null references courts (id) on delete cascade,
  starts_at      timestamptz not null,
  ends_at        timestamptz not null,
  customer_name  text not null,
  customer_phone text not null,
  status         text not null default 'CONFIRMED'
                   check (status in ('CONFIRMED', 'CANCELLED')),
  created_at     timestamptz not null default now(),
  constraint reservations_range check (ends_at > starts_at),
  constraint reservations_no_overlap exclude using gist (
    court_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  ) where (status = 'CONFIRMED')
);

create index if not exists reservations_court_day on reservations (court_id, starts_at);
create index if not exists reservations_business on reservations (business_id, starts_at);
