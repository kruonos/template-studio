import { afterEach, beforeAll } from 'vitest'
import { clearCache, setLocale } from '@chenglou/pretext'

const emojiPresentationRe = /\p{Emoji_Presentation}/u
const punctuationRe = /[.,!?;:%)\]}'"”’»›…—-]/u
const decimalDigitRe = /\p{Nd}/u

function parseFontSize(font: string): number {
  const match = font.match(/(\d+(?:\.\d+)?)\s*px/)
  return match ? Number.parseFloat(match[1]!) : 16
}

function isWideCharacter(ch: string): boolean {
  const code = ch.codePointAt(0)
  if (code === undefined) return false
  return (
    (code >= 0x4E00 && code <= 0x9FFF) ||
    (code >= 0x3400 && code <= 0x4DBF) ||
    (code >= 0xF900 && code <= 0xFAFF) ||
    (code >= 0x2F800 && code <= 0x2FA1F) ||
    (code >= 0x20000 && code <= 0x2A6DF) ||
    (code >= 0x2A700 && code <= 0x2B73F) ||
    (code >= 0x2B740 && code <= 0x2B81F) ||
    (code >= 0x2B820 && code <= 0x2CEAF) ||
    (code >= 0x2CEB0 && code <= 0x2EBEF) ||
    (code >= 0x2EBF0 && code <= 0x2EE5D) ||
    (code >= 0x30000 && code <= 0x3134F) ||
    (code >= 0x31350 && code <= 0x323AF) ||
    (code >= 0x323B0 && code <= 0x33479) ||
    (code >= 0x3000 && code <= 0x303F) ||
    (code >= 0x3040 && code <= 0x309F) ||
    (code >= 0x30A0 && code <= 0x30FF) ||
    (code >= 0xAC00 && code <= 0xD7AF) ||
    (code >= 0xFF00 && code <= 0xFFEF)
  )
}

function measureWidth(text: string, font: string): number {
  const fontSize = parseFontSize(font)
  let width = 0
  let previousWasDecimalDigit = false

  for (const ch of text) {
    if (ch === ' ') {
      width += fontSize * 0.33
      previousWasDecimalDigit = false
    } else if (ch === '\t') {
      width += fontSize * 1.32
      previousWasDecimalDigit = false
    } else if (emojiPresentationRe.test(ch) || ch === '\uFE0F') {
      width += fontSize
      previousWasDecimalDigit = false
    } else if (decimalDigitRe.test(ch)) {
      width += fontSize * (previousWasDecimalDigit ? 0.48 : 0.52)
      previousWasDecimalDigit = true
    } else if (isWideCharacter(ch)) {
      width += fontSize
      previousWasDecimalDigit = false
    } else if (punctuationRe.test(ch)) {
      width += fontSize * 0.4
      previousWasDecimalDigit = false
    } else {
      width += fontSize * 0.6
      previousWasDecimalDigit = false
    }
  }

  return width
}

class TestCanvasRenderingContext2D {
  font = ''

  measureText(text: string): { width: number } {
    return { width: measureWidth(text, this.font) }
  }
}

class TestOffscreenCanvas {
  constructor(_width: number, _height: number) {}

  getContext(_kind: string): TestCanvasRenderingContext2D {
    return new TestCanvasRenderingContext2D()
  }
}

const storageState = new Map<string, string>()
const testLocalStorage: Storage = {
  get length() {
    return storageState.size
  },
  clear() {
    storageState.clear()
  },
  getItem(key: string) {
    return storageState.get(key) ?? null
  },
  key(index: number) {
    return Array.from(storageState.keys())[index] ?? null
  },
  removeItem(key: string) {
    storageState.delete(key)
  },
  setItem(key: string, value: string) {
    storageState.set(key, value)
  },
}

Reflect.set(globalThis, 'OffscreenCanvas', TestOffscreenCanvas)
if (typeof window === 'undefined') {
  Reflect.set(globalThis, 'window', globalThis)
}
if (typeof localStorage === 'undefined') {
  Reflect.set(globalThis, 'localStorage', testLocalStorage)
}

beforeAll(() => {
  localStorage.clear()
})

afterEach(() => {
  setLocale(undefined)
  clearCache()
  localStorage.clear()
})
