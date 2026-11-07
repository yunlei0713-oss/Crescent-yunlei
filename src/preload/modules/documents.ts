import { ipcRenderer } from 'electron'
import type {
  LocalDocumentNode,
  LocalDocumentRequest,
  LocalDocumentPage,
  PdfPreviewSource,
  PdfPreviewRange
} from '../../shared/local-documents'
export const documentsApi = {
  openPdfPreview: (path: string): Promise<PdfPreviewSource> =>
    ipcRenderer.invoke('documents:pdf-preview', path),
  readPdfPreviewRange: (input: PdfPreviewRange): Promise<Uint8Array> =>
    ipcRenderer.invoke('documents:pdf-range', input),
  chooseRoot: (): Promise<string | undefined> => ipcRenderer.invoke('documents:choose-root'),
  list: (path: string, projectId?: string): Promise<LocalDocumentNode[]> =>
    ipcRenderer.invoke('documents:list', { path, projectId }),
  read: (
    input: LocalDocumentRequest & { requestId: string; projectId?: string }
  ): Promise<LocalDocumentPage> => ipcRenderer.invoke('documents:read', input),
  cancel: (requestId: string): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('documents:cancel', requestId)
}
