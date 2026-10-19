import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { bearDataDir } from './data-dir'

describe('bearDataDir', () => {
  const appData = join('C:', 'Users', 'me', 'AppData', 'Roaming')

  it("is the full suite's existing folder for every edition", () => {
    // The full suite's Chromium profile lives there too; Office and Studio have their own profiles.
    for (const userData of [join(appData, '@bear', 'desktop'), join(appData, 'Bear Office'), join(appData, 'Bear Studio')]) {
      expect(bearDataDir({ appData, userData, userDataSwitch: false })).toBe(join(appData, '@bear', 'desktop'))
    }
  })

  it('stays inside --user-data-dir, so tests are isolated', () => {
    const userData = join('T:', 'tmp', 'bear-e2e-1', 'userdata')
    expect(bearDataDir({ appData, userData, userDataSwitch: true })).toBe(userData)
  })
})
