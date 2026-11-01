import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'

import {
  DEFAULT_SCROLL_FOLLOW_THRESHOLD_PX,
  scrollFollowTargetTop,
  scrollToBottom
} from '@renderer/lib/scroll-follow'

export interface UseScrollFollowOptions {
  thresholdPx?: number
  enabled?: boolean
  /** A newly displayed conversation starts at its latest message. */
  resetKey?: unknown
  /** A new user submission explicitly resumes following. */
  followRequest?: unknown
}

/**
 * Auto-follow the latest content (or its recommendation anchor). Scrolling away
 * stays parked until the reader returns to the target or explicitly resumes.
 */
export function useScrollFollow(
  containerRef: RefObject<HTMLElement | null>,
  followSignals: readonly unknown[],
  options: UseScrollFollowOptions = {}
): {
  followNow: (force?: boolean) => void
  following: boolean
} {
  const thresholdPx = options.thresholdPx ?? DEFAULT_SCROLL_FOLLOW_THRESHOLD_PX
  const enabled = options.enabled ?? true
  const { resetKey, followRequest } = options
  const [following, setFollowing] = useState(true)
  const followingRef = useRef(true)
  const cancelScrollRef = useRef<(() => void) | null>(null)

  const updateFollowing = useCallback((next: boolean): void => {
    followingRef.current = next
    setFollowing(next)
    if (!next) {
      cancelScrollRef.current?.()
      cancelScrollRef.current = null
    }
  }, [])

  const followNow = useCallback(
    (force = false): void => {
      const el = containerRef.current
      if (!enabled || !el || (!force && !followingRef.current)) return
      if (force) followingRef.current = true
      // Coalesce streaming/layout updates and allow user input to cancel both frames.
      if (cancelScrollRef.current) return
      cancelScrollRef.current = scrollToBottom(el, () => {
        cancelScrollRef.current = null
        setFollowing(followingRef.current)
      })
    },
    [containerRef, enabled]
  )

  useEffect(() => {
    const el = containerRef.current
    if (!enabled || !el) return
    let lastScrollTop = el.scrollTop
    let touchY: number | undefined

    const handleScroll = (): void => {
      // Collapsing a card or growing the viewport can clamp scrollTop without user input.
      const maxScrollTop = Math.max(0, el.scrollHeight - el.clientHeight)
      const movedUp = el.scrollTop < Math.min(lastScrollTop, maxScrollTop) - 1
      const targetTop = scrollFollowTargetTop(el)
      const movedPastAnchor = el.scrollTop > lastScrollTop + 1 && el.scrollTop > targetTop + 1
      lastScrollTop = el.scrollTop
      // Our own jump may move upward from the footer to the recommendation.
      if (Math.abs(el.scrollTop - targetTop) < 2) updateFollowing(true)
      else if (movedUp || movedPastAnchor) updateFollowing(false)
      else if (Math.abs(el.scrollTop - targetTop) < thresholdPx) updateFollowing(true)
      // Content growth can generate a scroll event too. Distance alone must not unpin it.
    }
    const handleWheel = (event: WheelEvent): void => {
      if (event.deltaY < 0 || (event.deltaY > 0 && el.querySelector('[data-scroll-follow-anchor]')))
        updateFollowing(false)
    }
    const handleTouchStart = (event: TouchEvent): void => {
      touchY = event.touches[0]?.clientY
    }
    const handleTouchMove = (event: TouchEvent): void => {
      const nextY = event.touches[0]?.clientY
      if (
        touchY !== undefined &&
        nextY !== undefined &&
        (nextY > touchY || (nextY !== touchY && el.querySelector('[data-scroll-follow-anchor]')))
      )
        updateFollowing(false)
      touchY = nextY
    }
    const handleKeyDown = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement
      if (target.closest('input, textarea, [contenteditable="true"]')) return
      if (
        ['ArrowUp', 'PageUp', 'Home'].includes(event.key) ||
        (event.key === ' ' && event.shiftKey) ||
        (el.querySelector('[data-scroll-follow-anchor]') &&
          ['ArrowDown', 'PageDown', 'End', ' '].includes(event.key))
      ) {
        updateFollowing(false)
      }
    }

    // Observe the viewport and its content wrapper, rather than every markdown node.
    const resizeObserver = new ResizeObserver(() => followNow())
    resizeObserver.observe(el)
    if (el.firstElementChild) resizeObserver.observe(el.firstElementChild)
    const mutationObserver = new MutationObserver(() => followNow())
    mutationObserver.observe(el, { childList: true, characterData: true, subtree: true })
    el.addEventListener('scroll', handleScroll, { passive: true })
    el.addEventListener('wheel', handleWheel, { passive: true })
    el.addEventListener('touchstart', handleTouchStart, { passive: true })
    el.addEventListener('touchmove', handleTouchMove, { passive: true })
    el.addEventListener('keydown', handleKeyDown)
    followNow(true)

    return () => {
      el.removeEventListener('scroll', handleScroll)
      el.removeEventListener('wheel', handleWheel)
      el.removeEventListener('touchstart', handleTouchStart)
      el.removeEventListener('touchmove', handleTouchMove)
      el.removeEventListener('keydown', handleKeyDown)
      mutationObserver.disconnect()
      resizeObserver.disconnect()
      cancelScrollRef.current?.()
      cancelScrollRef.current = null
    }
  }, [containerRef, enabled, followNow, resetKey, thresholdPx, updateFollowing])

  useEffect(() => {
    followNow()
    // Signals are supplied by the caller; observers remain attached during streaming.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [followNow, ...followSignals])

  useEffect(() => {
    if (followRequest !== undefined) followNow(true)
  }, [followNow, followRequest])

  return { followNow, following }
}
