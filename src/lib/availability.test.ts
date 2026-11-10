import { describe, expect, it } from 'vitest'
import { fitsOpeningHours, freeSlots, overlaps } from './availability'
import { formatLocalTime, localMidnight, localMinutes } from './time'

// Bolivia is UTC-4 all year; no daylight saving to worry about.
const BOLIVIA = -240

const at = (iso: string) => new Date(iso)

describe('local time helpers', () => {
  it('finds local midnight for an instant later the same day', () => {
    expect(localMidnight(at('2026-11-10T18:00:00Z'), BOLIVIA).toISOString()).toBe(
      '2026-11-10T04:00:00.000Z',
    )
  })

  it('reads local midnight as minute zero', () => {
    expect(localMinutes(at('2026-11-10T04:00:00Z'), BOLIVIA)).toBe(0)
  })

  it('renders the local wall clock, not the UTC one', () => {
    expect(formatLocalTime(at('2026-11-11T00:00:00Z'), BOLIVIA)).toBe('20:00')
  })
})

describe('overlaps', () => {
  it('lets a booking start exactly when another ends', () => {
    expect(
      overlaps(
        { startsAt: at('2026-11-10T14:00:00Z'), endsAt: at('2026-11-10T15:00:00Z') },
        { startsAt: at('2026-11-10T15:00:00Z'), endsAt: at('2026-11-10T16:00:00Z') },
      ),
    ).toBe(false)
  })

  it('catches a booking swallowed by a longer one', () => {
    expect(
      overlaps(
        { startsAt: at('2026-11-10T14:00:00Z'), endsAt: at('2026-11-10T16:00:00Z') },
        { startsAt: at('2026-11-10T15:00:00Z'), endsAt: at('2026-11-10T15:30:00Z') },
      ),
    ).toBe(true)
  })

  it('catches the same slot twice', () => {
    const slot = { startsAt: at('2026-11-10T14:00:00Z'), endsAt: at('2026-11-10T15:00:00Z') }
    expect(overlaps(slot, slot)).toBe(true)
  })
})

describe('fitsOpeningHours', () => {
  const OPEN = 480 // 08:00
  const CLOSE = 1380 // 23:00

  it('accepts a slot inside the opening hours', () => {
    expect(
      fitsOpeningHours(
        { startsAt: at('2026-11-11T00:00:00Z'), endsAt: at('2026-11-11T01:00:00Z') },
        OPEN,
        CLOSE,
        BOLIVIA,
      ),
    ).toBe(true)
  })

  it('rejects a slot that starts before the court opens', () => {
    expect(
      fitsOpeningHours(
        { startsAt: at('2026-11-10T11:00:00Z'), endsAt: at('2026-11-10T12:00:00Z') },
        OPEN,
        CLOSE,
        BOLIVIA,
      ),
    ).toBe(false)
  })

  it('rejects a slot that ends after the court closes', () => {
    expect(
      fitsOpeningHours(
        { startsAt: at('2026-11-11T02:30:00Z'), endsAt: at('2026-11-11T03:30:00Z') },
        OPEN,
        CLOSE,
        BOLIVIA,
      ),
    ).toBe(false)
  })

  it('rejects a range that crosses midnight', () => {
    expect(
      fitsOpeningHours(
        { startsAt: at('2026-11-11T03:30:00Z'), endsAt: at('2026-11-11T04:30:00Z') },
        OPEN,
        CLOSE,
        BOLIVIA,
      ),
    ).toBe(false)
  })
})

describe('freeSlots', () => {
  const dayMidnight = at('2026-11-10T04:00:00Z') // 00:00 local

  it('lists every slot of an empty day', () => {
    const slots = freeSlots({
      dayMidnight,
      opensAt: 480,
      closesAt: 660,
      slotMinutes: 60,
      taken: [],
    })

    expect(slots).toHaveLength(3)
    expect(formatLocalTime(slots[0]!.startsAt, BOLIVIA)).toBe('08:00')
    expect(formatLocalTime(slots[2]!.endsAt, BOLIVIA)).toBe('11:00')
  })

  it('leaves out the slots a reservation occupies', () => {
    const slots = freeSlots({
      dayMidnight,
      opensAt: 480,
      closesAt: 660,
      slotMinutes: 60,
      taken: [
        { startsAt: at('2026-11-10T13:00:00Z'), endsAt: at('2026-11-10T14:00:00Z') },
      ],
    })

    expect(slots.map((slot) => formatLocalTime(slot.startsAt, BOLIVIA))).toEqual([
      '08:00',
      '10:00',
    ])
  })

  it('drops every slot a long reservation touches', () => {
    const slots = freeSlots({
      dayMidnight,
      opensAt: 480,
      closesAt: 720,
      slotMinutes: 30,
      taken: [
        { startsAt: at('2026-11-10T13:15:00Z'), endsAt: at('2026-11-10T14:45:00Z') },
      ],
    })

    expect(slots.map((slot) => formatLocalTime(slot.startsAt, BOLIVIA))).toEqual([
      '08:00',
      '08:30',
      '11:00',
      '11:30',
    ])
  })
})
