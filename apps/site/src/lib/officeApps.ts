import { APPS as ALL_APPS, type AppInfo } from '@bear/core'

/** The Office apps. The Home page's window, diagram and tile games still cover only these. */
export const OFFICE_APPS: AppInfo[] = ALL_APPS.filter((a) => a.suite === 'office')

/**
 * What the Tour and the app colours cover: every Office app (ready or coming soon) plus the Bear Studio apps that are
 * ready, in registry order. Studio apps join once they ship: until then their colours are not checked for contrast.
 */
export const SITE_APPS: AppInfo[] = ALL_APPS.filter((a) => a.suite === 'office' || a.ready)
