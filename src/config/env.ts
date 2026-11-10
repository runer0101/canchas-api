/**
 * Configuration read at call time, not at import time, so tests can set the
 * environment after importing the app.
 */
function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Falta la variable de entorno ${name}`)
  return value
}

export const env = {
  get databaseUrl(): string {
    return required('DATABASE_URL')
  },
  get port(): number {
    return Number(process.env.PORT ?? 3000)
  },
  get host(): string {
    return process.env.HOST ?? '127.0.0.1'
  },
}
