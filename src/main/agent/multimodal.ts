import { constants } from 'node:fs'
import { open } from 'node:fs/promises'
import { dirname, extname, join, sep } from 'node:path'
import { nativeImage, BrowserWindow, dialog, webContents } from 'electron'
import { localDocumentReaderForOwner } from '../local-document-ipc'
import { redactSensitiveText } from '../../shared/secret-redaction'
import { ATTACHMENT_LIMITS } from '../../shared/model-capabilities'
import { AttachmentError } from '../../shared/agent-errors'

export interface ModelImage {
  type: 'image'
  data: string
  mimeType: string
}
const MAX_BYTES = ATTACHMENT_LIMITS.fileBytes
const TEXT_EXTENSIONS =
  /\.(?:txt|log|json|ya?ml|conf|config|ini|toml|xml|csv|md|[cm]?[jt]sx?|py|sh|go|rs|java|sql|css|html|properties)$/i

/** Header dimensions are checked before native decoding, limiting decompression memory. */
export function imageMetadata(
  data: Buffer
): { mimeType: string; width: number; height: number } | undefined {
  let width = 0
  let height = 0
  let mimeType = ''
  if (
    data.length >= 24 &&
    data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  ) {
    mimeType = 'image/png'
    width = data.readUInt32BE(16)
    height = data.readUInt32BE(20)
  } else if (data[0] === 0xff && data[1] === 0xd8) {
    mimeType = 'image/jpeg'
    for (let offset = 2; offset + 9 < data.length; ) {
      if (data[offset] !== 0xff) break
      const marker = data[offset + 1]
      const size = data.readUInt16BE(offset + 2)
      if ([0xc0, 0xc1, 0xc2].includes(marker)) {
        height = data.readUInt16BE(offset + 5)
        width = data.readUInt16BE(offset + 7)
        break
      }
      if (size < 2) break
      offset += size + 2
    }
  } else if (
    data.length >= 30 &&
    data.toString('ascii', 0, 4) === 'RIFF' &&
    data.toString('ascii', 8, 12) === 'WEBP'
  ) {
    mimeType = 'image/webp'
    const type = data.toString('ascii', 12, 16)
    if (type === 'VP8X') {
      width = 1 + data.readUIntLE(24, 3)
      height = 1 + data.readUIntLE(27, 3)
    } else if (type === 'VP8 ') {
      width = data.readUInt16LE(26) & 0x3fff
      height = data.readUInt16LE(28) & 0x3fff
    } else if (type === 'VP8L') {
      const bits = data.readUInt32LE(21)
      width = (bits & 0x3fff) + 1
      height = ((bits >>> 14) & 0x3fff) + 1
    }
  } else return undefined
  if (!width || !height || width > 8192 || height > 8192 || width * height > 16_000_000)
    throw new Error('Image dimensions exceed 8192px / 16 megapixels or are invalid')
  return { mimeType, width, height }
}

export function validateAttachment(
  data: Buffer,
  name: string,
  declaredMime?: string
): { mimeType: string; previewDataUrl?: string } {
  if (data.length > MAX_BYTES) throw new Error('Attachment limit is 5 MiB')
  const image = imageMetadata(data)
  if (image) {
    if (
      declaredMime &&
      declaredMime !== 'application/octet-stream' &&
      declaredMime !== image.mimeType
    )
      throw new Error('Image MIME does not match actual format')
    const decoded = nativeImage.createFromBuffer(data)
    if (decoded.isEmpty()) throw new Error('Invalid image')
    return {
      mimeType: image.mimeType,
      previewDataUrl: decoded.resize({ width: Math.min(180, image.width) }).toDataURL()
    }
  }
  if (declaredMime?.startsWith('image/')) throw new Error('Supported images: PNG, JPEG, WebP')
  if (data.subarray(0, 5).toString() === '%PDF-') {
    if (declaredMime && !['application/pdf', 'application/octet-stream'].includes(declaredMime))
      throw new Error('PDF MIME does not match actual format')
    return { mimeType: 'application/pdf' }
  }
  if (declaredMime === 'application/pdf') throw new Error('Invalid PDF format')
  if (extname(name) && !TEXT_EXTENSIONS.test(name))
    throw new Error(
      'Unsupported attachment format; use an image, PDF, log, config or text/code file'
    )
  const text = new TextDecoder('utf-8', { fatal: true }).decode(data)
  if (text.includes('\0')) throw new Error('Binary attachments are unsupported')
  return { mimeType: 'text/plain' }
}

export async function prepareModelAttachments(
  ownerId: number,
  cwd: string,
  attachments: Array<{ path: string }> | undefined,
  imageInput: boolean,
  signal?: AbortSignal
): Promise<{ text: string; images: ModelImage[] }> {
  signal?.throwIfAborted()
  if (attachments === undefined) return { text: '', images: [] }
  if (!Array.isArray(attachments) || attachments.length > ATTACHMENT_LIMITS.files)
    throw new Error('Maximum 8 attachments per turn')
  if (!attachments.length) return { text: '', images: [] }
  const reader = await localDocumentReaderForOwner(ownerId, cwd)
  const images: ModelImage[] = []
  const texts: string[] = []
  let totalBytes = 0
  for (const attachment of attachments) {
    signal?.throwIfAborted()
    if (!attachment || typeof attachment.path !== 'string')
      throw new Error('Invalid attachment path')
    const path = await reader.authorize(attachment.path)
    const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
    let data: Buffer
    try {
      const stat = await file.stat()
      if (!stat.isFile() || stat.size > MAX_BYTES)
        throw new Error('Attachment must be a regular file of at most 5 MiB')
      const buffer = Buffer.alloc(MAX_BYTES + 1)
      const { bytesRead } = await file.read(buffer, 0, buffer.length, 0)
      data = buffer.subarray(0, bytesRead)
      totalBytes += bytesRead
      if (totalBytes > ATTACHMENT_LIMITS.totalBytes)
        throw new Error('Combined attachment limit is 20 MiB')
    } finally {
      await file.close()
    }
    signal?.throwIfAborted()
    const { mimeType } = validateAttachment(data, path)
    if (mimeType.startsWith('image/')) {
      if (!imageInput)
        throw new AttachmentError(
          'Selected model is text-only. Choose a provider-declared vision model before sending images.',
          'vision'
        )
      const decoded = nativeImage.createFromBuffer(data)
      const size = decoded.getSize()
      const scaled =
        Math.max(size.width, size.height) > 2048
          ? decoded.resize(size.width >= size.height ? { width: 2048 } : { height: 2048 })
          : decoded
      images.push({ type: 'image', mimeType: 'image/png', data: scaled.toPNG().toString('base64') })
      continue
    }
    let text: string
    if (mimeType === 'application/pdf') {
      if (data.length > ATTACHMENT_LIMITS.pdfBytes)
        throw new Error('PDF text extraction limit is 2 MiB')
      const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
      const pdfRoot = dirname(require.resolve('pdfjs-dist/package.json'))
      // PDF.js 6 removed isEvalSupported; text extraction never runs document actions.
      const task = pdfjs.getDocument({
        data: new Uint8Array(data),
        standardFontDataUrl: join(pdfRoot, 'standard_fonts') + sep,
        cMapUrl: join(pdfRoot, 'cmaps') + sep,
        cMapPacked: true,
        useSystemFonts: false,
        stopAtErrors: true
      })
      const abort = (): void => {
        void task.destroy()
      }
      signal?.addEventListener('abort', abort, { once: true })
      try {
        signal?.throwIfAborted()
        const pdf = await task.promise
        if (pdf.numPages > ATTACHMENT_LIMITS.pdfPages)
          throw new Error('PDF limit is 30 pages; split the document')
        const pages: string[] = []
        for (let page = 1; page <= pdf.numPages; page++) {
          signal?.throwIfAborted()
          const content = await (await pdf.getPage(page)).getTextContent()
          pages.push(
            `[Page ${page}]\n` +
              content.items.map((item) => ('str' in item ? item.str : '')).join(' ')
          )
          if (pages.join('\n').length > 64000) break
        }
        text = pages.join('\n')
        if (text.replace(/\[Page \d+\]/g, '').trim().length < 5)
          throw new Error('PDF has no extractable text. Attach page images with a vision model.')
      } finally {
        signal?.removeEventListener('abort', abort)
        await task.destroy()
      }
    } else text = new TextDecoder('utf-8', { fatal: true }).decode(data)
    text = redactSensitiveText(text)
    texts.push(
      `Attachment: ${path}\n${text.slice(0, 64000)}${text.length > 64000 ? '\n[Truncated; request a narrower range]' : ''}`
    )
  }
  signal?.throwIfAborted()
  if (images.length) {
    const owner = webContents.fromId(ownerId)
    const window = owner && BrowserWindow.fromWebContents(owner)
    if (!window || window.isDestroyed()) throw new Error('Attachment review window is unavailable')
    const decision = await dialog.showMessageBox(window, {
      type: 'question',
      title: '墨巡 · 图片隐私检查 / Image privacy review',
      message: `发送 ${images.length} 张图片到所选模型？ / Send ${images.length} image(s) to the selected model?`,
      detail:
        '请检查输入区预览，遮盖密码、Token、私钥等信息。文本附件会自动脱敏；图片像素无法自动脱敏。\nCheck the composer previews and cover passwords, tokens and private keys. Text is redacted automatically; image pixels are not.',
      buttons: ['取消 / Cancel', '已检查，发送 / Reviewed, send'],
      defaultId: 0,
      cancelId: 0,
      signal
    })
    signal?.throwIfAborted()
    if (decision.response !== 1)
      throw new Error('Image disclosure canceled; remove or redact the images before sending')
  }
  return { text: texts.join('\n\n').slice(0, 128000), images }
}
