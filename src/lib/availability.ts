import { addMinutes, localMinutes } from './time'

export type Interval = { startsAt: Date; endsAt: Date }

/** Half-open intervals: a booking that ends at 10:00 does not clash with one starting at 10:00. */
export function overlaps(a: Interval, b: Interval): boolean {
  return (
    a.startsAt.getTime() < b.endsAt.getTime() &&
    b.startsAt.getTime() < a.endsAt.getTime()
  )
}

/**
 * A booking must sit inside the court's opening hours, expressed as local
 * wall-clock minutes. Ranges that cross midnight are rejected: a court that
 * closes at 23:00 has no slot at 23:30, and pretending otherwise makes the
 * availability maths lie.
 */
export function fitsOpeningHours(
  interval: Interval,
  opensAt: number,
  closesAt: number,
  utcOffsetMinutes: number,
): boolean {
  const start = localMinutes(interval.startsAt, utcOffsetMinutes)
  const end = localMinutes(interval.endsAt, utcOffsetMinutes)

  if (end <= start) return false
  return start >= opensAt && end <= closesAt
}

/** Every slot of the day that no active reservation occupies. */
export function freeSlots(params: {
  dayMidnight: Date
  opensAt: number
  closesAt: number
  slotMinutes: number
  taken: readonly Interval[]
}): Interval[] {
  const { dayMidnight, opensAt, closesAt, slotMinutes, taken } = params
  const slots: Interval[] = []

  for (let minute = opensAt; minute + slotMinutes <= closesAt; minute += slotMinutes) {
    const startsAt = addMinutes(dayMidnight, minute)
    const endsAt = addMinutes(startsAt, slotMinutes)
    const slot = { startsAt, endsAt }

    if (taken.some((busy) => overlaps(slot, busy))) continue
    slots.push(slot)
  }

  return slots
}
