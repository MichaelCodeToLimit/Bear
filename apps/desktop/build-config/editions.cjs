// Per-edition electron-builder configuration. Bear ships as three separately installable apps:
// the full suite ("all"), Bear Office and Bear Studio. `base` is the full-suite configuration;
// builderConfig() derives the other two from it. The "all" edition must keep producing exactly the
// file names and identifiers it always has.

const base = {
  appId: 'org.bearsuite.desktop',
  productName: 'Bear',
  copyright: 'Copyright © 2026 Bear contributors',
  directories: {
    buildResources: 'build',
    output: 'release'
  },
  files: ['out/**', 'package.json'],
  asar: true,
  // Everything Bear needs is bundled into out/ by electron-vite, so there are no node_modules to ship or rebuild.
  npmRebuild: false,

  fileAssociations: [
    { ext: 'docx', name: 'Document', description: 'Bear Write document', role: 'Editor' },
    { ext: 'xlsx', name: 'Workbook', description: 'Bear Sheets workbook', role: 'Editor' },
    { ext: 'pptx', name: 'Presentation', description: 'Bear Slides presentation', role: 'Editor' },
    // PNG/JPG are deliberately not associated, so Bear never takes over the system image viewer.
    { ext: 'bearphoto', name: 'Bear Photo image', description: 'Bear Photo image', role: 'Editor' },
    { ext: 'psd', name: 'Layered image', description: 'Layered image', role: 'Editor' }
  ],

  // ---------- Windows ----------
  win: {
    target: [
      { target: 'nsis', arch: ['x64'] },
      { target: 'msi', arch: ['x64'] }
    ],
    icon: 'build/icon.png'
  },

  // Bear-Setup-x.y.z.exe: a per-user installer that doesn't need admin rights.
  nsis: {
    oneClick: false,
    perMachine: false,
    // The install location page lives in build/installer.nsh, where it shares the second screen with
    // Repair / Update when Bear is already installed. Keep this false so it isn't shown twice.
    allowToChangeInstallationDirectory: false,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: 'Bear',
    uninstallDisplayName: 'Bear',
    artifactName: 'Bear-Setup-${version}.${ext}'
  },

  // Bear-x.y.z.msi: a machine-wide installer for IT departments (Group Policy, Intune, SCCM).
  msi: {
    oneClick: false,
    perMachine: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: 'Bear',
    // Never change this: Windows uses it to recognise newer Bear MSIs as upgrades of older ones.
    upgradeCode: '7DE83F53-2188-4823-80F3-8C5D58ABE5B8',
    artifactName: 'Bear-${version}.${ext}'
  },

  // ---------- macOS ----------
  mac: {
    target: [
      { target: 'dmg', arch: ['x64', 'arm64'] },
      { target: 'zip', arch: ['x64', 'arm64'] }
    ],
    icon: 'build/icon.png',
    category: 'public.app-category.productivity',
    hardenedRuntime: true,
    // Signs automatically when a Developer ID certificate is available (CSC_LINK / keychain); otherwise unsigned.
    entitlements: 'build/entitlements.mac.plist',
    entitlementsInherit: 'build/entitlements.mac.plist',
    // Applies to the zip targets, which have no config section of their own: Bear-x.y.z-x64-mac.zip and
    // Bear-x.y.z-arm64-mac.zip. The dmg overrides it below. The website's Download page tells Apple silicon
    // from Intel by "arm64" / "x64" in these names.
    artifactName: 'Bear-${version}-${arch}-mac.${ext}'
  },
  dmg: {
    artifactName: 'Bear-${version}-${arch}.${ext}'
  },

  // ---------- Linux ----------
  // File names are fixed (version plus x64/amd64) because the website's Download page classifies files by
  // extension and name.
  linux: {
    target: [
      { target: 'AppImage', arch: ['x64'] },
      { target: 'deb', arch: ['x64'] },
      { target: 'rpm', arch: ['x64'] },
      { target: 'tar.gz', arch: ['x64'] },
      // Built by a separate, non-blocking CI job (see .github/workflows/release.yml); the main Linux build
      // passes its targets explicitly and leaves this one out.
      { target: 'flatpak', arch: ['x64'] }
    ],
    icon: 'build/icon.png',
    category: 'Office',
    executableName: 'bear',
    maintainer: 'Bear contributors',
    synopsis: 'Free, open-source productivity suite',
    // Used by tar.gz, which has no config section of its own: Bear-x.y.z-x64.tar.gz
    artifactName: 'Bear-${version}-x64.${ext}'
  },
  appImage: {
    artifactName: 'Bear-${version}-x64.${ext}'
  },
  deb: {
    artifactName: 'bear_${version}_amd64.${ext}'
  },
  rpm: {
    artifactName: 'Bear-${version}-x64.${ext}'
  },
  flatpak: {
    artifactName: 'Bear-${version}-x64.${ext}',
    runtime: 'org.freedesktop.Platform',
    runtimeVersion: '24.08',
    sdk: 'org.freedesktop.Sdk',
    base: 'org.electronjs.Electron2.BaseApp',
    baseVersion: '24.08',
    finishArgs: [
      '--share=ipc',
      '--socket=x11',
      '--socket=wayland',
      '--socket=pulseaudio',
      '--share=network',
      '--device=dri',
      '--filesystem=home',
      '--talk-name=org.freedesktop.Notifications'
    ]
  }
}

// What differs between the two single-suite editions. Never change an upgradeCode once released.
const SUITES = {
  office: {
    appId: 'org.bearsuite.office',
    productName: 'Bear Office',
    upgradeCode: '3F6B2C1E-8A4D-4E57-9B21-5C0D7E9A4F13',
    namePrefix: 'Bear-Office',
    debPrefix: 'bear-office',
    executableName: 'bear-office',
    category: 'Office',
    exts: ['docx', 'xlsx', 'pptx']
  },
  studio: {
    appId: 'org.bearsuite.studio',
    productName: 'Bear Studio',
    upgradeCode: 'A2C9E4B7-61F3-4D8A-B5E0-7F14C3D96E28',
    namePrefix: 'Bear-Studio',
    debPrefix: 'bear-studio',
    executableName: 'bear-studio',
    category: 'Graphics',
    exts: ['bearphoto', 'psd']
  }
}

/** Swaps the leading "Bear" of an artifact name for the edition's prefix (Bear-Setup-... -> Bear-Studio-Setup-...). */
function prefixed(name, namePrefix) {
  return name.replace(/^Bear/, namePrefix)
}

const EDITION_NAMES = ['all', 'office', 'studio']

/**
 * The edition named by BEAR_EDITION. Unset or empty means the full suite; any other value is a typo
 * that would otherwise quietly build the wrong app, so it stops the build.
 * @param {string | undefined} value
 * @returns {'all' | 'office' | 'studio'}
 */
function parseBuildEdition(value) {
  if (value === undefined || value === '') return 'all'
  if (EDITION_NAMES.includes(value)) return value
  throw new Error(`Unknown BEAR_EDITION "${value}". Use all, office or studio (or leave it unset for all).`)
}

/**
 * @param {string | undefined} edition 'all' | 'office' | 'studio' (unset or empty: 'all'); anything else throws
 * @returns {object} the electron-builder configuration for that edition
 */
function builderConfig(edition) {
  const config = structuredClone(base)
  const suite = SUITES[parseBuildEdition(edition)]
  if (!suite) return config // "all": today's configuration, untouched

  config.appId = suite.appId
  config.productName = suite.productName
  // The packaged app's own package.json keeps the name "Bear" otherwise; override it so the app reports its edition.
  config.extraMetadata = { productName: suite.productName }
  config.fileAssociations = config.fileAssociations.filter((f) => suite.exts.includes(f.ext))

  config.nsis.shortcutName = suite.productName
  config.nsis.uninstallDisplayName = suite.productName
  config.msi.shortcutName = suite.productName
  config.msi.upgradeCode = suite.upgradeCode

  for (const section of ['nsis', 'msi', 'mac', 'dmg', 'linux', 'appImage', 'rpm', 'flatpak']) {
    config[section].artifactName = prefixed(config[section].artifactName, suite.namePrefix)
  }
  // deb names are lowercase with underscores; the architecture comes from electron-builder.
  config.deb.artifactName = suite.debPrefix + '_${version}_${arch}.${ext}'

  config.linux.executableName = suite.executableName
  // Without this the deb/rpm package name falls back to productName ("Bear Office"), and rpm refuses a name
  // with a space. "all" keeps today's name, Bear. (electron-builder only accepts packageName per target.)
  config.deb.packageName = suite.executableName
  config.rpm.packageName = suite.executableName
  config.linux.category = suite.category
  return config
}

module.exports = { builderConfig, parseBuildEdition }
