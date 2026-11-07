import { constants } from 'node:fs'
import { lstat, open } from 'node:fs/promises'
import { extname } from 'node:path'
import { nativeImage, BrowserWindow, dialog, webContents } from 'electron'
import { localDocumentReaderForOwner } from '../local-document-ipc'
import { documentIdentity } from '../document-cursor'
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
  signal?: AbortSignal,
  projectRootIdentity?: string
): Promise<{ text: string; images: ModelImage[] }> {
  signal?.throwIfAborted()
  if (attachments === undefined) return { text: '', images: [] }
  if (!Array.isArray(attachments) || attachments.length > ATTACHMENT_LIMITS.files)
    throw new Error('Maximum 8 attachments per turn')
  if (!attachments.length) return { text: '', images: [] }
  const reader = await localDocumentReaderForOwner(
    ownerId,
    cwd,
    attachments.flatMap((item) => (item && typeof item.path === 'string' ? [item.path] : [])),
    projectRootIdentity
  )
  const images: ModelImage[] = []
  const texts: string[] = []
  let totalBytes = 0
  for (const attachment of attachments) {
    signal?.throwIfAborted()
    if (!attachment || typeof attachment.path !== 'string')
      throw new Error('Invalid attachment path')
    const path = await reader.authorize(attachment.path)
    const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
    let imageData: Buffer | undefined
    let size: number
    let identity: string
    try {
      const stat = await file.stat({ bigint: true })
      size = Number(stat.size)
      identity = documentIdentity(path, stat)
      if (
        !stat.isFile() ||
        documentIdentity(path, await lstat(path, { bigint: true })) !== identity ||
        (await reader.authorize(path)) !== path
      )
        throw new Error('Attachment changed during authorization')
      const header = Buffer.alloc(12)
      await file.read(header, 0, header.length, 0)
      const image =
        /\.(?:png|jpe?g|webp)$/i.test(path) ||
        (header[0] === 0xff && header[1] === 0xd8) ||
        header.subarray(0, 4).toString('hex') === '89504e47' ||
        header.toString('ascii', 8, 12) === 'WEBP'
      if (image) {
        if (size > MAX_BYTES) throw new Error('Image attachment limit is 5 MiB')
        totalBytes += size
        if (totalBytes > ATTACHMENT_LIMITS.totalBytes)
          throw new Error('Combined image attachment limit is 20 MiB')
        imageData = Buffer.alloc(size)
        let offset = 0
        while (offset < size) {
          signal?.throwIfAborted()
          const { bytesRead } = await file.read(imageData, offset, size - offset, offset)
          if (!bytesRead) throw new Error('Image attachment changed during reading')
          offset += bytesRead
        }
        if (documentIdentity(path, await file.stat({ bigint: true })) !== identity)
          throw new Error('Image attachment changed during reading')
      }
    } finally {
      await file.close()
    }
    signal?.throwIfAborted()
    if (imageData) {
      const data = imageData
      const { mimeType } = validateAttachment(data, path)
      if (!mimeType.startsWith('image/')) throw new Error('Unsupported image attachment')
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
    const small = size <= 32768
    const document = await reader.read(
      small ? { path, limit: /\.pdf$/i.test(path) ? 1 : 12 } : { path, operation: 'inspect' },
      signal
    )
    if (document.identity !== identity)
      throw new Error('Document attachment changed during reading')
    const reference = `Document Reference: ${redactSensitiveText(path)} (${size} bytes, ${document.encoding}${document.totalPages ? `, ${document.totalPages} pages` : ''}). Use read with a range or query for more.`
    const excerpt =
      document.textLayer === 'absent'
        ? 'No text layer in the selected pages. Inspect page images if needed.'
        : document.lines
            .map((line) => line.text)
            .join('\n')
            .slice(0, 2400)
    texts.push([reference, excerpt].filter(Boolean).join('\n'))
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
  return { text: texts.join('\n\n').slice(0, 32000), images }
}
