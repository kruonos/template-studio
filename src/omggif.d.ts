declare module 'omggif' {
export type GifWriterOptions = {
  loop?: number
  palette?: Uint32Array | number[]
}

export type GifFrameOptions = {
  palette?: Uint32Array | number[]
  delay?: number
  disposal?: number
}

  export class GifWriter {
    constructor(buffer: Uint8Array, width: number, height: number, options?: GifWriterOptions)
    addFrame(x: number, y: number, width: number, height: number, indexedPixels: Uint8Array, options: GifFrameOptions): number
    end(): number
  }
}
