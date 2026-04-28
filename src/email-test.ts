const EMAIL_PROXY_URL = 'http://localhost:3001'

type EmailTestHooks = {
  templateName: () => string
  buildEmailHtml: () => string | Promise<string>
  buildEmailText: () => string | Promise<string>
  buildLegacyEmailHtml: () => string | Promise<string>
  buildAbsoluteHtmlDocument: (options: { paged: boolean; printable: boolean; autoPrint: boolean }) => string
  showToast: (message: string) => void
}

export async function sendTestEmail(
  from: string,
  to: string,
  format: string,
  statusEl: HTMLDivElement,
  sendBtn: HTMLButtonElement,
  hooks: EmailTestHooks,
): Promise<void> {
  if (!from || !to) {
    statusEl.textContent = 'Please fill in both email addresses.'
    statusEl.className = 'email-test-status error'
    return
  }

  if (format === 'html') {
    statusEl.textContent = 'Standard HTML uses absolute positioning and is not a valid inbox-safe email format. Use Email HTML.'
    statusEl.className = 'email-test-status error'
    return
  }

  sendBtn.disabled = true
  statusEl.textContent = 'Sending...'
  statusEl.className = 'email-test-status'

  try {
    let html: string | undefined
    let text: string | undefined

    switch (format) {
      case 'email-html':
        html = await hooks.buildEmailHtml()
        text = await hooks.buildEmailText()
        break
      case 'email-html-legacy':
        html = await hooks.buildLegacyEmailHtml()
        text = await hooks.buildEmailText()
        break
      case 'email-text':
        text = await hooks.buildEmailText()
        break
      case 'html':
        html = hooks.buildAbsoluteHtmlDocument({ paged: false, printable: false, autoPrint: false })
        break
      default:
        html = await hooks.buildEmailHtml()
        text = await hooks.buildEmailText()
    }

    const response = await fetch(`${EMAIL_PROXY_URL}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to,
        subject: `[Test] ${hooks.templateName()} — Template Studio`,
        html,
        text,
      }),
    })

    const result = (await response.json()) as { ok: boolean; error?: string }
    if (result.ok) {
      statusEl.textContent = `Sent to ${to}!`
      statusEl.className = 'email-test-status success'
      hooks.showToast(`Test email sent to ${to}`)
    } else {
      statusEl.textContent = result.error ?? 'Failed to send.'
      statusEl.className = 'email-test-status error'
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes('fetch') || message.includes('NetworkError') || message.includes('Failed')) {
      statusEl.textContent = 'Cannot reach email proxy. Run: bun run email:proxy'
    } else {
      statusEl.textContent = message
    }
    statusEl.className = 'email-test-status error'
  } finally {
    sendBtn.disabled = false
  }
}
