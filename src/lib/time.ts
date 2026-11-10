/**
 * Time handling for a booking API that lives in one timezone but stores UTC.
 *
 * A court belongs to a business in Santa Cruz de la Sierra (UTC-4 all year: Bolivia
 * has no daylight saving). Opening hours are local wall-clock minutes — 480 is
 * 08:00 — while every timestamp in the database is UTC. These helpers are the only
 * place that conversion happens.
 */
export const MINUTES_PER_DAY = 24 * 60

/** Minutes since local midnight for a UTC instant in a fixed-offset zone. */
export function localMinutes(instant: Date, utcOffsetMinutes: number): number {
  const shifted = new Date(instant.getTime() + utcOffsetMinutes * 60_000)
  return shifted.getUTCHours() * 60 + shifted.getUTCMinutes()
}

/**
 * The UTC instant of local midnight for the day containing `instant`.
 * `localMinutes(midnightUtc(instant, offset), offset)` is always 0.
 */
export function localMidnight(instant: Date, utcOffsetMinutes: number): Date {
  const shifted = new Date(instant.getTime() + utcOffsetMinutes * 60_000)
  shifted.setUTCHours(0, 0, 0, 0)
  return new Date(shifted.getTime() - utcOffsetMinutes * 60_000)
}

/** Adds local wall-clock minutes to a UTC instant. */
export function addMinutes(instant: Date, minutes: number): Date {
  return new Date(instant.getTime() + minutes * 60_000)
}

/** Renders `HH:MM` in the local zone, for messages and API responses. */
export function formatLocalTime(instant: Date, utcOffsetMinutes: number): string {
  return formatMinutes(localMinutes(instant, utcOffsetMinutes))
}

/** Renders a wall-clock minute count (480) as `HH:MM` (08:00). */
export function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return `${String(hours).padStart(2, '0')}:${String(rest).padStart(2, '0')}`
}
