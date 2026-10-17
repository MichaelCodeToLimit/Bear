import { APPS as ALL_APPS, type AppInfo } from '@bear/core'

/** The site's pages and tour cover the Office apps; Bear Studio gets its own pages later. */
export const OFFICE_APPS: AppInfo[] = ALL_APPS.filter((a) => a.suite === 'office')
