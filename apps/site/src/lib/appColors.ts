import type { AppInfo } from '@bear/core'

/** One `--app-<id>` custom property per app, in order, on `:root`. */
export function appColorCss(apps: AppInfo[]): string {
  return `:root{${apps.map((a) => `--app-${a.id}:${a.color};`).join('')}}`
}
