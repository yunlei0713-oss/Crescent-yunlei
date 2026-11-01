import { FileChangeApprovalService } from '../security/file-change-approval'
import { loadPiSdk } from './pi-sdk'

export const fileChangeApprovals = new FileChangeApprovalService(async (key, work) => {
  const pi = await loadPiSdk()
  return pi.withFileMutationQueue(key, work)
})
