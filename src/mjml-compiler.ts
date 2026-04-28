import mjml2html from 'mjml-browser'

type RawMjmlError = {
  line?: number
  message: string
  tagName?: string
  formattedMessage?: string
}

export type MjmlCompileIssue = {
  line?: number
  message: string
  tagName?: string
  formattedMessage?: string
}

export type MjmlCompileResult = {
  html: string
  warnings: MjmlCompileIssue[]
}

export function compileMjml(source: string): MjmlCompileResult {
  const result = mjml2html(source, {
    validationLevel: 'soft',
    minify: false,
    beautify: false,
  })

  return {
    html: result.html,
    warnings: Array.isArray(result.errors)
      ? result.errors.map((error: RawMjmlError) => {
        const issue: MjmlCompileIssue = { message: error.message }
        if (typeof error.line === 'number') issue.line = error.line
        if (typeof error.tagName === 'string') issue.tagName = error.tagName
        if (typeof error.formattedMessage === 'string') issue.formattedMessage = error.formattedMessage
        return issue
      })
      : [],
  }
}
