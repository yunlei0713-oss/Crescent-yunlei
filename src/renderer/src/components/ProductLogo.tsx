import type { JSX } from 'react'

import moxunLogo from '@renderer/assets/moxun-mark.png'

export function ProductLogo(): JSX.Element {
  return (
    <div
      className="relative flex size-7 items-center justify-center overflow-hidden rounded-md border border-border"
      aria-hidden="true"
    >
      <img src={moxunLogo} alt="" width={28} height={28} className="size-7" draggable={false} />
    </div>
  )
}
