import { APPS, type AppInfo, type Suite } from './apps'

/** Which apps a build of Bear ships: everything, only Office, or only Studio. */
export type Edition = 'all' | 'office' | 'studio'

/**
 * Name, app id (Windows AppUserModelID / bundle id) and suites of each edition. The installers take their
 * identity from apps/desktop/build-config/editions.cjs, which is the source of truth; a unit test keeps
 * these in step with it.
 */
export const EDITIONS: Record<Edition, { productName: string; appId: string; suites: Suite[] }> = {
  all: { productName: 'Bear', appId: 'org.bearsuite.desktop', suites: ['office', 'studio'] },
  office: { productName: 'Bear Office', appId: 'org.bearsuite.office', suites: ['office'] },
  studio: { productName: 'Bear Studio', appId: 'org.bearsuite.studio', suites: ['studio'] }
}

let current: Edition = 'all'

export function setEdition(e: Edition): void {
  current = e
}

export function getEdition(): Edition {
  return current
}

/** Unknown or empty values fall back to the full suite. */
export function parseEdition(value: string | undefined): Edition {
  return value === 'office' || value === 'studio' || value === 'all' ? value : 'all'
}

/** Apps belonging to the current edition, in registry order. */
export function enabledApps(): AppInfo[] {
  const suites = EDITIONS[current].suites
  return APPS.filter((a) => suites.includes(a.suite))
}
