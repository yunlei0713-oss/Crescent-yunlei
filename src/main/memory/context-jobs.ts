/** Conversation maintenance leases are synchronous and keyed by canonical conversation ID. */
const jobs = new Map<string, 'learning' | 'compaction' | 'run'>()

export function contextJob(id: string): 'learning' | 'compaction' | 'run' | undefined {
  return jobs.get(id)
}
export function reserveContextJob(
  id: string,
  kind: 'learning' | 'compaction' | 'run'
): (() => void) | undefined {
  if (jobs.has(id)) return
  jobs.set(id, kind)
  return () => {
    jobs.delete(id)
  }
}
