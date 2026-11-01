export interface ModelCapabilities {
  textInput: boolean
  imageInput: boolean
  documentInput: boolean
  supportedMimeTypes: string[]
  maxImageSize: number
  maxImages: number
}
export function modelCapabilities(imageInput = false): ModelCapabilities {
  return {
    textInput: true,
    imageInput,
    documentInput: false,
    supportedMimeTypes: imageInput
      ? ['text/plain', 'image/png', 'image/jpeg', 'image/webp']
      : ['text/plain'],
    maxImageSize: ATTACHMENT_LIMITS.fileBytes,
    maxImages: ATTACHMENT_LIMITS.files
  }
}
export const ATTACHMENT_LIMITS = {
  fileBytes: 5 * 1024 * 1024,
  totalBytes: 20 * 1024 * 1024,
  files: 8,
  pdfBytes: 2 * 1024 * 1024,
  pdfPages: 30
} as const

export function hasImageAttachments(refs: readonly { mimeType?: string; path: string }[]): boolean {
  return refs.some((ref) =>
    ref.mimeType ? ref.mimeType.startsWith('image/') : /\.(png|jpe?g|webp)$/i.test(ref.path)
  )
}
