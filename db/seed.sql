-- Datos de ejemplo. Sólo para desarrollo y para probar la demo.
-- Aplicar después de db/schema.sql:  psql "$DATABASE_URL" -f db/seed.sql

insert into businesses (name, api_key_hash, utc_offset_minutes)
values (
  'Complejo El Cambio',
  -- sha256 de 'demo-api-key-cambiar-antes-de-produccion'
  '0b3663d5d7253cf5e91628ab208299550dd122d633676796cf1f1227269be5e1',
  -240
)
on conflict (api_key_hash) do nothing;

insert into courts (business_id, name, opens_at, closes_at, slot_minutes)
select b.id, v.name, v.opens_at, v.closes_at, v.slot_minutes
from businesses b,
     (values
        ('Cancha 1', 480, 1380, 60),
        ('Cancha 2', 480, 1380, 60),
        ('Cancha 3 (techada)', 600, 1440, 90)
     ) as v(name, opens_at, closes_at, slot_minutes)
where b.api_key_hash = '0b3663d5d7253cf5e91628ab208299550dd122d633676796cf1f1227269be5e1'
on conflict (business_id, name) do nothing;
