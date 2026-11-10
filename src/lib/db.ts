import pg from 'pg'
import { env } from '../config/env'

let pool: pg.Pool | undefined

export function db(): pg.Pool {
  pool ??= new pg.Pool({ connectionString: env.databaseUrl })
  return pool
}

/** Runs `fn` inside a transaction, rolling back on any throw. */
export async function withTransaction<T>(
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await db().connect()
  try {
    await client.query('begin')
    const result = await fn(client)
    await client.query('commit')
    return result
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
}

export async function closePool(): Promise<void> {
  await pool?.end()
  pool = undefined
}
