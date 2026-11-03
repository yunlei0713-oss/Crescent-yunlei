import type { JSX } from 'react'

export function ProductLogo(): JSX.Element {
  return (
    <div className="app-brand-wordmark" role="img" aria-label="墨巡 MoXun">
      <span className="app-brand-wordmark-cn">墨巡</span>
      <span className="app-brand-wordmark-divider" aria-hidden="true" />
      <span className="app-brand-wordmark-en" aria-hidden="true">
        MoXun
      </span>
    </div>
  )
}
