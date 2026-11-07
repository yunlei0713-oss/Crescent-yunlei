import { useEffect, useRef, useState } from 'react'
import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { Button } from './ui/button'
import { PDF_PREVIEW_MAX_BYTES, PDF_PREVIEW_RANGE_BYTES } from '../../../shared/local-documents'
import { redactSensitiveText } from '../../../shared/secret-redaction'
pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
export function LocalPdfPreview({
  path,
  pageNumber,
  onInsert
}: {
  path: string
  pageNumber: number
  onInsert: (text: string) => void
}): React.JSX.Element {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [preview, setPreview] = useState<{ path: string; pageNumber: number; text: string }>()
  const text = preview?.path === path && preview.pageNumber === pageNumber ? preview.text : ''
  const [message, setMessage] = useState('')
  useEffect(() => {
    let current = true
    let stopped = false
    let failed = false
    let pendingRanges = Promise.resolve()
    let requestedBytes = 0
    const fail = (error: unknown): void => {
      if (!current || failed) return
      failed = true
      stopped = true
      setMessage(error instanceof Error ? error.message : String(error))
      void loading?.destroy().catch(() => {})
    }
    let loading: ReturnType<typeof pdfjs.getDocument> | undefined
    let rendering: ReturnType<pdfjs.PDFPageProxy['render']> | undefined
    const timeout = setTimeout(() => fail(new Error('PDF 解析超过 10 秒')), 10000)
    void window.api.documents
      .openPdfPreview(path)
      .then(async ({ size, header, cursor }) => {
        if (stopped) return
        class LocalRange extends pdfjs.PDFDataRangeTransport {
          requestDataRange(begin: number, end: number): void {
            pendingRanges = pendingRanges
              .then(async () => {
                if (stopped) return
                const length = end - begin
                if (
                  begin < 0 ||
                  end > size ||
                  length <= 0 ||
                  (requestedBytes += length) > PDF_PREVIEW_MAX_BYTES
                )
                  throw new Error('PDF 预览超过读取限制')
                const bytes = new Uint8Array(length)
                for (let from = begin; from < end && !stopped; from += PDF_PREVIEW_RANGE_BYTES) {
                  const part = await window.api.documents.readPdfPreviewRange({
                    path,
                    cursor,
                    begin: from,
                    end: Math.min(end, from + PDF_PREVIEW_RANGE_BYTES)
                  })
                  if (!stopped) bytes.set(part, from - begin)
                }
                if (!stopped) this.onDataRange(begin, bytes)
              })
              .catch(fail)
          }

          abort(): void {
            stopped = true
          }
        }
        loading = pdfjs.getDocument({
          range: new LocalRange(size, header, true),
          rangeChunkSize: PDF_PREVIEW_RANGE_BYTES,
          disableAutoFetch: true,
          disableStream: true,
          disableFontFace: true,
          useSystemFonts: true,
          useWorkerFetch: false,
          stopAtErrors: true,
          maxImageSize: 4000000
        })
        const document = await loading.promise
        if (stopped) return
        if (document.numPages > 200 || pageNumber < 1 || pageNumber > document.numPages)
          throw new Error('PDF 最多 200 页；请指定有效页码')
        const page = await document.getPage(pageNumber)
        if (stopped) return
        const viewport = page.getViewport({
          scale: Math.min(1.2, 1000 / page.getViewport({ scale: 1 }).width)
        })
        if (viewport.width * viewport.height > 2000000) throw new Error('PDF 页尺寸超过预览限制')
        const target = canvas.current
        if (!target) return
        target.width = viewport.width
        target.height = viewport.height
        rendering = page.render({ canvas: target, viewport })
        const content = await page.getTextContent()
        if (stopped) return
        setPreview({
          path,
          pageNumber,
          text: redactSensitiveText(
            content.items
              .map((item) => ('str' in item ? item.str : ''))
              .join(' ')
              .slice(0, 50000)
          )
        })
        setMessage(`第 ${pageNumber} / ${document.numPages} 页 · 本地解析`)
        await rendering.promise
      })
      .catch(fail)
      .finally(() => clearTimeout(timeout))
    return () => {
      current = false
      stopped = true
      clearTimeout(timeout)
      rendering?.cancel()
      void loading?.destroy().catch(() => {})
    }
  }, [path, pageNumber])
  return (
    <div className="space-y-2">
      <p role="status">{message}</p>
      <canvas ref={canvas} className="max-w-full" aria-label={`PDF 第 ${pageNumber} 页`} />
      <Button
        size="xs"
        disabled={!text}
        onClick={() => onInsert(`[本地 PDF ${path} · 第 ${pageNumber} 页]\n${text}`)}
      >
        插入本页引用
      </Button>
      <pre className="max-h-48 overflow-auto whitespace-pre-wrap">{text}</pre>
    </div>
  )
}
