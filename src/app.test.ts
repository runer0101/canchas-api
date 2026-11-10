import { describe, expect, it } from 'vitest'
import { buildApp } from './app'

/**
 * HTTP-level tests that need no database: the health check and the auth
 * boundary. Anything past authentication reaches PostgreSQL, so those paths are
 * covered by the domain tests and by the SQL constraint itself.
 */
describe('http layer', () => {
  it('answers the health check without credentials', async () => {
    const app = buildApp()
    const response = await app.inject({ method: 'GET', url: '/health' })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ status: 'ok' })
    await app.close()
  })

  it('refuses a reservation with no API key', async () => {
    const app = buildApp()
    const response = await app.inject({
      method: 'POST',
      url: '/reservations',
      payload: {},
    })

    expect(response.statusCode).toBe(401)
    expect(response.json()).toEqual({
      error: { code: 'UNAUTHORIZED', message: 'Falta la clave de API o no es válida' },
    })
    await app.close()
  })

  it('refuses an empty API key header', async () => {
    const app = buildApp()
    const response = await app.inject({
      method: 'GET',
      url: '/reservations?courtId=00000000-0000-0000-0000-000000000000',
      headers: { 'x-api-key': '' },
    })

    expect(response.statusCode).toBe(401)
    expect(response.json().error.code).toBe('UNAUTHORIZED')
    await app.close()
  })
})
