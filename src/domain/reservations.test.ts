import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '../lib/errors'
import {
  createReservation,
  type Court,
  type NewReservation,
  type Reservation,
  type ReservationStore,
} from './reservations'

const court: Court = {
  id: 'court-1',
  businessId: 'business-1',
  opensAt: 480, // 08:00
  closesAt: 1380, // 23:00
  slotMinutes: 60,
  utcOffsetMinutes: -240,
}

const stored: Reservation = {
  id: 'reservation-1',
  businessId: 'business-1',
  courtId: 'court-1',
  startsAt: new Date('2026-11-11T00:00:00Z'), // 20:00 local
  endsAt: new Date('2026-11-11T01:00:00Z'),
  customerName: 'Ana',
  customerPhone: '70000000',
  status: 'CONFIRMED',
}

function storeReturning(result: Reservation | 'conflict') {
  return { insert: vi.fn(async (_input: NewReservation) => result) }
}

const validRequest = {
  startsAt: new Date('2026-11-11T00:00:00Z'),
  endsAt: new Date('2026-11-11T01:00:00Z'),
  customerName: 'Ana',
  customerPhone: '70000000',
}

async function expectApiError(promise: Promise<unknown>, status: number, code: string) {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  )

  expect(error).toBeInstanceOf(ApiError)
  expect((error as ApiError).status).toBe(status)
  expect((error as ApiError).code).toBe(code)
}

describe('createReservation', () => {
  it('stores a booking that fits the opening hours', async () => {
    const store = storeReturning(stored)

    const reservation = await createReservation(store, court, validRequest)

    expect(reservation.id).toBe('reservation-1')
    expect(store.insert).toHaveBeenCalledWith({
      businessId: 'business-1',
      courtId: 'court-1',
      ...validRequest,
    })
  })

  it('refuses a range that ends before it starts', async () => {
    const store = storeReturning(stored)

    await expectApiError(
      createReservation(store, court, {
        ...validRequest,
        endsAt: validRequest.startsAt,
      }),
      400,
      'INVALID_INPUT',
    )
    expect(store.insert).not.toHaveBeenCalled()
  })

  it('refuses a booking outside the opening hours', async () => {
    const store = storeReturning(stored)

    await expectApiError(
      createReservation(store, court, {
        ...validRequest,
        startsAt: new Date('2026-11-10T11:00:00Z'), // 07:00 local
        endsAt: new Date('2026-11-10T12:00:00Z'),
      }),
      400,
      'INVALID_INPUT',
    )
    expect(store.insert).not.toHaveBeenCalled()
  })

  it('reports a taken slot as a conflict, not as a server error', async () => {
    const store: ReservationStore = storeReturning('conflict')

    await expectApiError(createReservation(store, court, validRequest), 409, 'SLOT_TAKEN')
  })
})
