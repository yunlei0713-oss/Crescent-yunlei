import { useEffect, useState } from 'react'

const PET_VISIBLE_KEY = 'crescent.petVisible'

/** UI preference only. Showing the pet never changes quota monitoring. */
export function usePetVisibility(): [boolean, () => void] {
  const [visible, setVisible] = useState(() => {
    try {
      return localStorage.getItem(PET_VISIBLE_KEY) === 'true'
    } catch {
      return false
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem(PET_VISIBLE_KEY, String(visible))
    } catch {
      // The pet remains usable when browser preference storage is unavailable.
    }
  }, [visible])
  return [visible, () => setVisible((current) => !current)]
}
