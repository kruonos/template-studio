/**
 * SparkPost email proxy server for Template Studio debug test emails.
 *
 * Run: bun run email:proxy
 * Listens on port 3001, accepts POST /send with JSON body:
 *   { from: string, to: string, subject: string, html?: string, text?: string }
 *
 * Forwards to SparkPost transmissions API with the key from .env.local.
 */

const SPARKPOST_API_KEY = process.env['SPARKPOST_API'] ?? ''
const SPARKPOST_ENDPOINT = 'https://api.sparkpost.com/api/v1/transmissions'
const PORT = 3001

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

function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }
}

const server = Bun.serve({
  port: PORT,
  async fetch(request: Request): Promise<Response> {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() })
    }

    const url = new URL(request.url)

    if (url.pathname === '/send' && request.method === 'POST') {
      try {
        const body = (await request.json()) as SendRequest
        const { from, to, subject, html, text } = body

        if (!from || !to) {
          return Response.json(
            { ok: false, error: 'Missing "from" or "to" field' },
            { status: 400, headers: corsHeaders() },
          )
        }

        // Build SparkPost transmission payload
        const content: Record<string, string> = { from, subject: subject || 'Template Studio Test Email' }
        if (html) content['html'] = html
        if (text) content['text'] = text
        if (!html && !text) {
          return Response.json(
            { ok: false, error: 'Must provide "html" or "text" content' },
            { status: 400, headers: corsHeaders() },
          )
        }

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
            { status: sparkResponse.status, headers: corsHeaders() },
          )
        }

        return Response.json(
          { ok: true, result: sparkResult },
          { headers: corsHeaders() },
        )
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return Response.json(
          { ok: false, error: message },
          { status: 500, headers: corsHeaders() },
        )
      }
    }

    // Health check
    if (url.pathname === '/health') {
      return Response.json({ ok: true, service: 'email-proxy' }, { headers: corsHeaders() })
    }

    return Response.json(
      { ok: false, error: 'Not found' },
      { status: 404, headers: corsHeaders() },
    )
  },
})

console.log(`Email proxy listening on http://localhost:${server.port}`)
