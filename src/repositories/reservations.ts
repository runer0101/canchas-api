import { createHash } from 'node:crypto'
import type { Court, NewReservation, Reservation, ReservationStore } from '../domain/reservations'
import { db } from '../lib/db'

const EXCLUSION_VIOLATION = '23P01'

export type Business = {
  id: string
  name: string
  utcOffsetMinutes: number
}

type BusinessRow = { id: string; name: string; utc_offset_minutes: number }
type CourtRow = {
  id: string
  business_id: string
  opens_at: number
  closes_at: number
  slot_minutes: number
  utc_offset_minutes: number
}
type ReservationRow = {
  id: string
  business_id: string
  court_id: string
  starts_at: Date
  ends_at: Date
  customer_name: string
  customer_phone: string
  status: 'CONFIRMED' | 'CANCELLED'
}

/** Only the hash is stored, so a database dump never yields a usable API key. */
export function hashApiKey(apiKey: string): string {
  return createHash('sha256').update(apiKey).digest('hex')
}

export async function findBusinessByApiKey(apiKey: string): Promise<Business | null> {
  const { rows } = await db().query<BusinessRow>(
    'select id, name, utc_offset_minutes from businesses where api_key_hash = $1',
    [hashApiKey(apiKey)],
  )

  const row = rows[0]
  if (!row) return null
  return { id: row.id, name: row.name, utcOffsetMinutes: row.utc_offset_minutes }
}

export async function findCourt(businessId: string, courtId: string): Promise<Court | null> {
  const { rows } = await db().query<CourtRow>(
    `select c.id, c.business_id, c.opens_at, c.closes_at, c.slot_minutes, b.utc_offset_minutes
       from courts c
       join businesses b on b.id = c.business_id
      where c.id = $1 and c.business_id = $2`,
    [courtId, businessId],
  )

  const row = rows[0]
  if (!row) return null

  return {
    id: row.id,
    businessId: row.business_id,
    opensAt: row.opens_at,
    closesAt: row.closes_at,
    slotMinutes: row.slot_minutes,
    utcOffsetMinutes: row.utc_offset_minutes,
  }
}

export async function takenIntervals(
  courtId: string,
  from: Date,
  to: Date,
): Promise<{ startsAt: Date; endsAt: Date }[]> {
  const { rows } = await db().query<{ starts_at: Date; ends_at: Date }>(
    `select starts_at, ends_at
       from reservations
      where court_id = $1
        and status = 'CONFIRMED'
        and starts_at < $3
        and ends_at > $2
      order by starts_at`,
    [courtId, from, to],
  )

  return rows.map((row) => ({ startsAt: row.starts_at, endsAt: row.ends_at }))
}

const toReservation = (row: ReservationRow): Reservation => ({
  id: row.id,
  businessId: row.business_id,
  courtId: row.court_id,
  startsAt: row.starts_at,
  endsAt: row.ends_at,
  customerName: row.customer_name,
  customerPhone: row.customer_phone,
  status: row.status,
})

function isExclusionViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: string }).code === EXCLUSION_VIOLATION
  )
}

/**
 * The database owns the overlap rule. A conflicting insert fails with SQLSTATE
 * 23P01 and is reported as a conflict; anything else is a real error and must
 * not be disguised as one.
 */
export function reservationStore(): ReservationStore {
  return {
    async insert(input: NewReservation): Promise<Reservation | 'conflict'> {
      try {
        const { rows } = await db().query<ReservationRow>(
          `insert into reservations
             (business_id, court_id, starts_at, ends_at, customer_name, customer_phone)
           values ($1, $2, $3, $4, $5, $6)
           returning id, business_id, court_id, starts_at, ends_at,
                     customer_name, customer_phone, status`,
          [
            input.businessId,
            input.courtId,
            input.startsAt,
            input.endsAt,
            input.customerName,
            input.customerPhone,
          ],
        )

        return toReservation(rows[0]!)
      } catch (error) {
        if (isExclusionViolation(error)) return 'conflict'
        throw error
      }
    },
  }
}

export async function listReservations(
  businessId: string,
  courtId: string,
  limit: number,
): Promise<Reservation[]> {
  const { rows } = await db().query<ReservationRow>(
    `select id, business_id, court_id, starts_at, ends_at,
            customer_name, customer_phone, status
       from reservations
      where business_id = $1 and court_id = $2
      order by starts_at
      limit $3`,
    [businessId, courtId, limit],
  )

  return rows.map(toReservation)
}
