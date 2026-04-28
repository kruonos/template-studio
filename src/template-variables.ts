import type { TemplateVar } from './schema.ts'

export function resolveVariables(text: string, variables: TemplateVar[]): string {
  return text.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, rawName: string) => {
    const variable = variables.find(item => item.name === rawName)
    if (variable === undefined) return match
    const nextValue = variable.value.length > 0 ? variable.value : variable.fallback ?? ''
    return nextValue.length > 0 ? nextValue : match
  })
}
