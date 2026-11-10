import Fastify, {
  type FastifyError,
  type FastifyInstance,
  type FastifyRequest,
} from 'fastify'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import { z } from 'zod'
import { createReservation, type Court } from './domain/reservations'
import { freeSlots } from './lib/availability'
import { ApiError, badRequest, notFound, unauthorized } from './lib/errors'
import {
  findBusinessByApiKey,
  findCourt,
  listReservations,
  reservationStore,
  takenIntervals,
  type Business,
} from './repositories/reservations'

declare module 'fastify' {
  interface FastifyRequest {
    business: Business | null
  }
}

const instant = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), 'Fecha inválida')
  .transform((value) => new Date(value))

const createReservationBody = z.object({
  courtId: z.string().uuid(),
  startsAt: instant,
  endsAt: instant,
  customerName: z.string().trim().min(2).max(80),
  customerPhone: z.string().trim().min(6).max(25),
})

const listQuery = z.object({
  courtId: z.string().uuid(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
})

const availabilityQuery = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato esperado: AAAA-MM-DD'),
})

/** Local midnight for a `AAAA-MM-DD` day, as a UTC instant. */
function dayMidnight(date: string, utcOffsetMinutes: number): Date {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number]
  return new Date(Date.UTC(year, month - 1, day) - utcOffsetMinutes * 60_000)
}

function businessOf(request: FastifyRequest): Business {
  if (!request.business) throw unauthorized()
  return request.business
}

async function requireCourt(business: Business, courtId: string): Promise<Court> {
  const court = await findCourt(business.id, courtId)
  if (!court) throw notFound('Cancha no encontrada')
  return court
}

export function buildApp(): FastifyInstance {
  const app = Fastify({ logger: false })

  app.decorateRequest('business', null)

  app.register(swagger, {
    openapi: {
      info: {
        title: 'canchas-api',
        description:
          'Reservas de canchas con garantía de no solapamiento en la base de datos.',
        version: '0.1.0',
      },
      components: {
        securitySchemes: {
          apiKey: { type: 'apiKey', in: 'header', name: 'x-api-key' },
        },
      },
    },
  })
  app.register(swaggerUi, { routePrefix: '/docs' })

  app.setErrorHandler((error: FastifyError, _request, reply) => {
    if (error instanceof ApiError) {
      return reply.status(error.status).send(error.toBody())
    }
    if (error.validation || error.statusCode === 400) {
      return reply.status(400).send(badRequest('Cuerpo de la petición inválido').toBody())
    }
    reply.log.error(error)
    return reply.status(500).send({
      error: { code: 'INTERNAL_ERROR', message: 'Error interno' },
    })
  })

  app.get('/health', { schema: { tags: ['sistema'] } }, async () => ({
    status: 'ok',
  }))

  app.register(async (secured) => {
    secured.addHook('preHandler', async (request) => {
      const header = request.headers['x-api-key']
      const presented = Array.isArray(header) ? header[0] : header
      if (!presented) throw unauthorized()

      const business = await findBusinessByApiKey(presented)
      if (!business) throw unauthorized()
      request.business = business
    })

    secured.post(
      '/reservations',
      { schema: { tags: ['reservas'], summary: 'Crear una reserva' } },
      async (request, reply) => {
        const business = businessOf(request)
        const parsed = createReservationBody.safeParse(request.body)
        if (!parsed.success) {
          throw badRequest('Datos inválidos', parsed.error.flatten().fieldErrors)
        }

        const court = await requireCourt(business, parsed.data.courtId)
        const reservation = await createReservation(
          reservationStore(),
          court,
          parsed.data,
        )

        return reply.status(201).send(reservation)
      },
    )

    secured.get(
      '/reservations',
      { schema: { tags: ['reservas'], summary: 'Listar reservas de una cancha' } },
      async (request) => {
        const business = businessOf(request)
        const parsed = listQuery.safeParse(request.query)
        if (!parsed.success) {
          throw badRequest('Parámetros inválidos', parsed.error.flatten().fieldErrors)
        }

        const court = await requireCourt(business, parsed.data.courtId)
        const items = await listReservations(business.id, court.id, parsed.data.limit)
        return { items }
      },
    )

    secured.get(
      '/courts/:courtId/availability',
      { schema: { tags: ['reservas'], summary: 'Huecos libres de un día' } },
      async (request) => {
        const business = businessOf(request)
        const params = z
          .object({ courtId: z.string().uuid() })
          .safeParse(request.params)
        const query = availabilityQuery.safeParse(request.query)
        if (!params.success || !query.success) {
          throw badRequest('Parámetros inválidos')
        }

        const court = await requireCourt(business, params.data.courtId)
        const midnight = dayMidnight(query.data.date, court.utcOffsetMinutes)
        const dayEnd = new Date(midnight.getTime() + 24 * 60 * 60_000)

        const taken = await takenIntervals(court.id, midnight, dayEnd)
        const slots = freeSlots({
          dayMidnight: midnight,
          opensAt: court.opensAt,
          closesAt: court.closesAt,
          slotMinutes: court.slotMinutes,
          taken,
        })

        return {
          courtId: court.id,
          date: query.data.date,
          slots: slots.map((slot) => ({
            startsAt: slot.startsAt.toISOString(),
            endsAt: slot.endsAt.toISOString(),
          })),
        }
      },
    )
  })

  return app
}
