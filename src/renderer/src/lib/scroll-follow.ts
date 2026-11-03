export const DEFAULT_SCROLL_FOLLOW_THRESHOLD_PX = 48
/** Explicit history navigation pauses pending streaming follow frames. */
export const CONVERSATION_JUMP_EVENT = 'moxun:conversation-jump'

export interface ScrollFollowDecisionInput {
  force: boolean
  /** Sticky pin: user was at the bottom before this update (or we just followed). */
  following: boolean
}

/** Whether the scroll viewport is within `thresholdPx` of the bottom edge. */
export function isNearScrollBottom(
  el: HTMLElement,
  thresholdPx = DEFAULT_SCROLL_FOLLOW_THRESHOLD_PX
): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight < thresholdPx
}

/** Whether auto-follow should scroll to the latest content. */
export function shouldFollowScroll(input: ScrollFollowDecisionInput): boolean {
  return input.force || input.following
}

/** Keep the recommended step visible instead of scrolling a tall suggestion group to its footer. */
export function scrollFollowTargetTop(el: HTMLElement): number {
  const bottom = Math.max(0, el.scrollHeight - el.clientHeight)
  const anchor = el.querySelector<HTMLElement>('[data-scroll-follow-anchor]')
  if (!anchor) return bottom
  const top =
    anchor.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop - 12
  return Math.max(0, Math.min(bottom, top))
}

/**
 * Scroll to the latest content after layout settles. Uses two animation frames so
 * markdown/mermaid/async DOM updates can affect scrollHeight first.
 */
export function scrollToBottom(el: HTMLElement, onSettled?: () => void): () => void {
  let frame = window.requestAnimationFrame(() => {
    frame = window.requestAnimationFrame(() => {
      el.scrollTo({ top: scrollFollowTargetTop(el), behavior: 'instant' })
      onSettled?.()
    })
  })
  return () => window.cancelAnimationFrame(frame)
}
