# Optional Email Proxy

Pretext Template Studio is local-first. The editor, persistence, and export flows run in the browser without a backend.

The only backend included in this repository is `src/email-proxy.ts`, a local development helper for sending generated email output through SparkPost. It is not required for normal use, public demos, screenshots, or export testing.

## Run It

Create `.env.local` from `.env.example`:

```bash
SPARKPOST_API=your_sparkpost_key
EMAIL_PROXY_PORT=3001
```

Start the proxy:

```bash
bun run email:proxy
```

The proxy listens on `127.0.0.1` and defaults to port `3001`.

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Local health check. |
| `POST` | `/send` | Sends one test message through SparkPost. |

`POST /send` accepts:

```json
{
  "from": "sender@example.com",
  "to": "recipient@example.com",
  "subject": "Template Studio Test",
  "html": "<p>Optional HTML body</p>",
  "text": "Optional text body"
}
```

At least one of `html` or `text` is required.

## Security Boundary

- The proxy binds to loopback only.
- Browser CORS is restricted to local origins such as `localhost` and `127.0.0.1`.
- Payloads are capped for local testing.
- SparkPost credentials must stay in `.env.local` and must never be committed.
- Do not deploy this file as a production email service. A production sender would need authentication, authorization, rate limiting, logging policy, domain controls, and abuse prevention.

## Export Testing

`bun run export:audit` does not require the proxy. It downloads generated email HTML directly from the editor and validates the output files locally.
