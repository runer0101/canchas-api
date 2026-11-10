import { buildApp } from './app'
import { env } from './config/env'

const app = buildApp()

try {
  await app.listen({ port: env.port, host: env.host })
  console.log(`canchas-api escuchando en http://${env.host}:${env.port}`)
  console.log(`documentación en http://${env.host}:${env.port}/docs`)
} catch (error) {
  app.log.error(error)
  process.exit(1)
}
