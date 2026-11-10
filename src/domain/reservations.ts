import { fitsOpeningHours } from '../lib/availability'
import { badRequest, conflict } from '../lib/errors'
import { formatMinutes } from '../lib/time'

export type Court = {
  id: string
  businessId: string
  opensAt: number
  closesAt: number
  slotMinutes: number
  utcOffsetMinutes: number
}

export type NewReservation = {
  businessId: string
  courtId: string
  startsAt: Date
  endsAt: Date
  customerName: string
  customerPhone: string
}

export type Reservation = NewReservation & {
  id: string
  status: 'CONFIRMED' | 'CANCELLED'
}

export interface ReservationStore {
  /**
   * Inserts unless an active reservation on the same court overlaps.
   * Must be atomic in the database — the guarantee cannot live in application code.
   */
  insert(input: NewReservation): Promise<Reservation | 'conflict'>
}

export type ReservationRequest = {
  startsAt: Date
  endsAt: Date
  customerName: string
  customerPhone: string
}

export async function createReservation(
  store: ReservationStore,
  court: Court,
  request: ReservationRequest,
): Promise<Reservation> {
  if (request.endsAt.getTime() <= request.startsAt.getTime()) {
    throw badRequest('La hora de fin debe ser posterior a la de inicio')
  }

  if (
    !fitsOpeningHours(
      { startsAt: request.startsAt, endsAt: request.endsAt },
      court.opensAt,
      court.closesAt,
      court.utcOffsetMinutes,
    )
  ) {
    throw badRequest(
      `La cancha abre de ${formatMinutes(court.opensAt)} a ${formatMinutes(court.closesAt)}`,
      {
        opensAt: formatMinutes(court.opensAt),
        closesAt: formatMinutes(court.closesAt),
      },
    )
  }

  const result = await store.insert({
    businessId: court.businessId,
    courtId: court.id,
    startsAt: request.startsAt,
    endsAt: request.endsAt,
    customerName: request.customerName,
    customerPhone: request.customerPhone,
  })

  if (result === 'conflict') {
    throw conflict('Ese horario ya está reservado', {
      startsAt: request.startsAt.toISOString(),
      endsAt: request.endsAt.toISOString(),
    })
  }

  return result
}
