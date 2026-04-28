declare module 'mjml-browser' {
  type MjmlError = {
    line?: number
    message: string
    tagName?: string
    formattedMessage?: string
  }

  type MjmlOptions = {
    validationLevel?: 'skip' | 'soft' | 'strict'
    minify?: boolean
    beautify?: boolean
  }

  type MjmlResult = {
    html: string
    errors: MjmlError[]
  }

  export default function mjml2html(source: string, options?: MjmlOptions): MjmlResult
}
