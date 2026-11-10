/**
 * Every failure leaves the API through this shape, so a client never has to
 * guess between `{ error }`, `{ message }` and `{ error: { code } }`.
 */
export type ApiErrorBody = {
  error: {
    code: string
    message: string
    details?: unknown
  }
}

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly details?: unknown

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }

  toBody(): ApiErrorBody {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.details === undefined ? {} : { details: this.details }),
      },
    }
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new ApiError(400, 'INVALID_INPUT', message, details)

export const unauthorized = (message = 'Falta la clave de API o no es válida') =>
  new ApiError(401, 'UNAUTHORIZED', message)

export const notFound = (message: string) => new ApiError(404, 'NOT_FOUND', message)

export const conflict = (message: string, details?: unknown) =>
  new ApiError(409, 'SLOT_TAKEN', message, details)
