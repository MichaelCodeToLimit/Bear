import type { AppInfo } from '@bear/core'

/** The square letter tile used for each app: an original mark, not a copy of any vendor's icon. */
export function AppMark({ app, size = 28 }: { app: AppInfo; size?: number }) {
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-[28%] font-semibold text-white shadow-sm"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.5,
        background: `linear-gradient(140deg, ${app.color}, color-mix(in oklab, ${app.color} 70%, black))`
      }}
    >
      {app.name[0]}
    </span>
  )
}
