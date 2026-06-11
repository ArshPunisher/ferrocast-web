/** An error the demo engine answers with, in the API's `{ error: { code, message, hint } }` shape. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly hint?: string,
    readonly retryAfter?: number,
  ) {
    super(message)
  }
}
