import { useCallback, useLayoutEffect, useRef } from 'react'

/** Stable event identity for memoized message bodies, using the latest committed handler. */
export function useStableCallback<T extends (...args: never[]) => unknown>(callback: T): T
export function useStableCallback<T extends (...args: never[]) => unknown>(
  callback: T | undefined
): T | undefined
export function useStableCallback<T extends (...args: never[]) => unknown>(
  callback: T | undefined
): T | undefined {
  const current = useRef(callback)
  useLayoutEffect(() => {
    current.current = callback
  }, [callback])
  const stable = useCallback((...args: Parameters<T>) => current.current?.(...args), []) as T
  return callback ? stable : undefined
}
