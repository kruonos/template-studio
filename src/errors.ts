export class UserError extends Error {
  readonly recoverable = true

  constructor(message: string) {
    super(message)
    this.name = 'UserError'
  }
}

export class SystemError extends Error {
  readonly recoverable = false
  override cause?: unknown

  constructor(message: string, cause?: unknown) {
    super(message)
    this.name = 'SystemError'
    this.cause = cause
  }
}

export function isUserError(error: unknown): error is UserError {
  return error instanceof UserError
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}
