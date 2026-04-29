/**
 * SparkPost email proxy server for Template Studio debug test emails.
 *
 * Run: bun run email:proxy
 * Listens on 127.0.0.1:3001 by default, accepts POST /send with JSON body:
 *   { from: string, to: string, subject: string, html?: string, text?: string }
 *
 * Forwards to SparkPost transmissions API with the key from .env.local.
 */

const SPARKPOST_API_KEY = process.env['SPARKPOST_API'] ?? ''
const SPARKPOST_ENDPOINT = 'https://api.sparkpost.com/api/v1/transmissions'
const HOSTNAME = '127.0.0.1'
const PORT = parsePort(process.env['EMAIL_PROXY_PORT'])
const MAX_BODY_BYTES = 2 * 1024 * 1024

if (!SPARKPOST_API_KEY) {
  console.error('SPARKPOST_API not set. Create .env.local with SPARKPOST_API=<key>')
  process.exit(1)
}

type SendRequest = {
  from: string
  to: string
  subject: string
  html?: string
  text?: string
}

function parsePort(value: string | undefined): number {
  if (value === undefined || value.trim() === '') return 3001
  const parsed = Number.parseInt(value, 10)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    console.error(`EMAIL_PROXY_PORT must be a TCP port between 1 and 65535. Received: ${value}`)
    process.exit(1)
  }
  return parsed
}

function isLocalOrigin(origin: string | null): boolean {
  if (origin === null) return true
  try {
    const url = new URL(origin)
    return url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]'
  } catch {
    return false
  }
}

function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('Origin')
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  }
  if (origin !== null && isLocalOrigin(origin)) headers['Access-Control-Allow-Origin'] = origin
  return headers
}

function parseSendRequest(value: unknown): { body: SendRequest | null; error: string | null } {
  if (!isRecord(value)) return { body: null, error: 'Request body must be a JSON object' }
  const from = value['from']
  const to = value['to']
  const subject = value['subject']
  const html = value['html']
  const text = value['text']

  if (typeof from !== 'string' || typeof to !== 'string') return { body: null, error: 'Missing "from" or "to" field' }
  if (!isEmailLike(from) || !isEmailLike(to)) return { body: null, error: 'Invalid "from" or "to" email address' }
  if (subject !== undefined && typeof subject !== 'string') return { body: null, error: 'Subject must be a string' }
  if (subject !== undefined && subject.length > 200) return { body: null, error: 'Subject is too long' }
  if (html !== undefined && typeof html !== 'string') return { body: null, error: 'HTML content must be a string' }
  if (text !== undefined && typeof text !== 'string') return { body: null, error: 'Text content must be a string' }
  if (!html && !text) return { body: null, error: 'Must provide "html" or "text" content' }

  return {
    body: {
      from,
      to,
      subject: subject ?? 'Template Studio Test Email',
      ...(html === undefined ? {} : { html }),
      ...(text === undefined ? {} : { text }),
    },
    error: null,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isEmailLike(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

const server = Bun.serve({
  hostname: HOSTNAME,
  port: PORT,
  async fetch(request: Request): Promise<Response> {
    const headers = corsHeaders(request)
    if (!isLocalOrigin(request.headers.get('Origin'))) {
      return Response.json({ ok: false, error: 'Only local browser origins may use this development proxy' }, { status: 403 })
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers })
    }

    const url = new URL(request.url)

    if (url.pathname === '/send' && request.method === 'POST') {
      try {
        const contentLength = Number.parseInt(request.headers.get('Content-Length') ?? '0', 10)
        if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
          return Response.json(
            { ok: false, error: 'Email payload is too large for the local test proxy' },
            { status: 413, headers },
          )
        }

        const parsed = parseSendRequest(await request.json())

        if (parsed.error !== null || parsed.body === null) {
          return Response.json(
            { ok: false, error: parsed.error ?? 'Invalid request body' },
            { status: 400, headers },
          )
        }

        const { from, to, subject, html, text } = parsed.body
        const content: Record<string, string> = { from, subject: subject || 'Template Studio Test Email' }
        if (html) content['html'] = html
        if (text) content['text'] = text

        const transmission = {
          recipients: [{ address: { email: to } }],
          content,
        }

        const sparkResponse = await fetch(SPARKPOST_ENDPOINT, {
          method: 'POST',
          headers: {
            Authorization: SPARKPOST_API_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(transmission),
        })

        const sparkResult = await sparkResponse.json()

        if (!sparkResponse.ok) {
          const errors = (sparkResult as { errors?: { message: string }[] }).errors
          const message = errors?.[0]?.message ?? `SparkPost returned ${sparkResponse.status}`
          return Response.json(
            { ok: false, error: message, details: sparkResult },
            { status: sparkResponse.status, headers },
          )
        }

        return Response.json(
          { ok: true, result: sparkResult },
          { headers },
        )
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return Response.json(
          { ok: false, error: message },
          { status: 500, headers },
        )
      }
    }

    if (url.pathname === '/health') {
      return Response.json({ ok: true, service: 'email-proxy', host: HOSTNAME, port: PORT }, { headers })
    }

    return Response.json(
      { ok: false, error: 'Not found' },
      { status: 404, headers },
    )
  },
})

console.log(`Email proxy listening on http://${HOSTNAME}:${server.port}`)
