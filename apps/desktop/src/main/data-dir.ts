import { join } from 'node:path'

export interface DataDirInput {
  /** `app.getPath('appData')` (%APPDATA% on Windows, ~/Library/Application Support, ~/.config). */
  appData: string
  /** `app.getPath('userData')`, the Chromium profile of this edition. */
  userData: string
  /** True when Bear was started with --user-data-dir (end-to-end tests). */
  userDataSwitch: boolean
}

/**
 * Bear's own data folder: recent.json, data/, mail/ and recovery/. Every edition (Bear, Bear Office,
 * Bear Studio) uses the same one, the folder the full suite has always used (Electron names it after
 * package.json "name", @bear/desktop), so installing another edition finds the same notebooks, mail and
 * recent files.
 *
 * The Chromium profile (caches, local storage, the single-instance lock) is NOT shared: each edition
 * keeps Electron's default userData, so the editions can run at the same time.
 *
 * With --user-data-dir the data goes inside that folder, so test runs never touch real data.
 *
 * Two editions running at once write the same JSON files without locking; the last write wins.
 */
export function bearDataDir({ appData, userData, userDataSwitch }: DataDirInput): string {
  return userDataSwitch ? userData : join(appData, '@bear', 'desktop')
}
