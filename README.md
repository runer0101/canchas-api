# canchas-api

API de reservas de canchas deportivas. Backend puro, sin interfaz: el objetivo es demostrar
disciplina de servidor — validación en los límites, autenticación, un contrato de error único y una
garantía que la base de datos hace cumplir.

## La garantía

**Dos reservas activas de la misma cancha no pueden solaparse, y lo impide PostgreSQL.**

```sql
constraint reservations_no_overlap exclude using gist (
  court_id with =,
  tstzrange(starts_at, ends_at, '[)') with &&
) where (status = 'CONFIRMED')
```

No es una comprobación de la aplicación entre la lectura y la escritura: es una restricción de
exclusión en la tabla. Dos peticiones simultáneas que pidan el mismo horario producen **una** reserva
y **un** `409`; la segunda no puede colarse en el hueco entre `select` e `insert` porque no hay hueco.

El rango es semiabierto `[)`: una reserva que termina a las 10:00 no choca con otra que empieza a las
10:00.

## Endpoints

Todas las rutas salvo `/health` exigen la cabecera `x-api-key`. La base de datos guarda **sólo el
SHA-256** de la clave, así que un volcado no entrega credenciales utilizables.

| Método | Ruta | Qué hace |
| --- | --- | --- |
| `GET` | `/health` | Estado del servicio. Sin autenticación |
| `GET` | `/docs` | Documentación OpenAPI navegable |
| `POST` | `/reservations` | Crea una reserva. `201`, o `409 SLOT_TAKEN` |
| `GET` | `/reservations?courtId=&limit=` | Lista las reservas de una cancha |
| `GET` | `/courts/:courtId/availability?date=AAAA-MM-DD` | Huecos libres del día |

### Ejemplo

```bash
curl -X POST http://127.0.0.1:3000/reservations \
  -H 'x-api-key: demo-api-key-cambiar-antes-de-produccion' \
  -H 'content-type: application/json' \
  -d '{
    "courtId": "<uuid de la cancha>",
    "startsAt": "2026-11-11T00:00:00.000Z",
    "endsAt": "2026-11-11T01:00:00.000Z",
    "customerName": "Ana Quispe",
    "customerPhone": "70000000"
  }'
```

`2026-11-11T00:00:00Z` son las 20:00 en Santa Cruz de la Sierra.

## Contrato de error

Una sola forma, siempre:

```json
{ "error": { "code": "SLOT_TAKEN", "message": "Ese horario ya está reservado", "details": {} } }
```

| Código | HTTP | Cuándo |
| --- | --- | --- |
| `INVALID_INPUT` | 400 | Validación o regla de negocio: rango invertido, fuera de horario |
| `UNAUTHORIZED` | 401 | Falta la clave o no corresponde a ningún negocio |
| `NOT_FOUND` | 404 | La cancha no existe o es de otro negocio |
| `SLOT_TAKEN` | 409 | La restricción de exclusión rechazó el solapamiento |
| `INTERNAL_ERROR` | 500 | Cualquier otra cosa. Nunca se filtra el detalle |

## Ponerlo en marcha

```bash
pnpm install
export DATABASE_URL='postgresql://usuario:clave@127.0.0.1:5432/canchas'
pnpm db:apply                       # db/schema.sql
psql "$DATABASE_URL" -f db/seed.sql # datos de ejemplo
pnpm dev                            # http://127.0.0.1:3000/docs
```

## Pruebas

```bash
pnpm test        # 20 pruebas, sin base de datos
pnpm typecheck
pnpm build
```

Lo que las pruebas cubren, y por qué:

- **Horario local contra UTC.** Bolivia es UTC-4 todo el año. La conversión vive en un solo módulo y
  se prueba en los bordes: medianoche local, un cierre a las 23:00 y un rango que cruza medianoche,
  que se rechaza en lugar de mentir.
- **Solapamiento semiabierto.** Que dos reservas contiguas no choquen es una decisión, no un accidente.
- **Huecos libres.** Un día vacío, un hueco ocupado y una reserva larga que se come varios huecos.
- **Reglas de negocio.** Rango invertido y fuera de horario devuelven `400`; el conflicto de la base
  de datos se traduce a `409` y no a un error de servidor.
- **Capa HTTP.** `/health` sin credenciales y el `401` con el cuerpo exacto del contrato.

## Decisiones

- **SQL directo, sin ORM.** La garantía central es una restricción de exclusión con `tstzrange`, que
  un ORM escondería. Escribir el SQL deja la regla a la vista.
- **Zod en el borde.** Todo lo que entra se valida antes de tocar el dominio; el dominio recibe tipos,
  no `unknown`.
- **Errores como valores de dominio.** `ApiError` lleva estado y código; el manejador global es el
  único sitio que decide cómo se ve un fallo.
- **Zona horaria por negocio.** `businesses.utc_offset_minutes` evita cablear UTC-4 en el código: si
  mañana entra un cliente de otro país, no hay que tocar la lógica.

## Lo que falta, dicho en voz alta

- **Sin cancelación.** `status = 'CANCELLED'` existe en el esquema y la restricción ya lo excluye, pero
  no hay endpoint que lo cambie.
- **Sin límite de peticiones.** Una `x-api-key` filtrada se puede usar sin freno.
- **Sin paginación por cursor.** `limit` y nada más; con muchas reservas hay que añadirla.
- **Sin pruebas contra PostgreSQL real.** La restricción de exclusión se prueba con SQL, no con
  Vitest: las pruebas actuales no necesitan base de datos y ésa es una limitación consciente.
- **Sin gestión de negocios.** Crear un negocio y su clave es un `insert` a mano.
