// Runs a Gradle task in android/ with the Android SDK and a JDK found automatically, so
// `pnpm build:apk` works without setting ANDROID_HOME / JAVA_HOME by hand.
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

const android = resolve(import.meta.dirname, '../android')
const env = { ...process.env }

const sdkCandidates = [
  env.ANDROID_HOME,
  env.ANDROID_SDK_ROOT,
  join(env.LOCALAPPDATA ?? '', 'Android', 'Sdk'),
  join(homedir(), 'Library', 'Android', 'sdk'),
  join(homedir(), 'Android', 'Sdk')
]
const sdk = sdkCandidates.find((p) => p && existsSync(p))
if (!sdk) {
  console.error('Android SDK not found. Install Android Studio, or set ANDROID_HOME.')
  process.exit(1)
}
env.ANDROID_HOME = sdk
writeFileSync(join(android, 'local.properties'), `sdk.dir=${sdk.replace(/\\/g, '\\\\')}\n`)

// Prefer Android Studio's bundled JDK, which always matches its Gradle plugin.
const studioJdks = [
  'C:\\Program Files\\Android\\Android Studio\\jbr',
  '/Applications/Android Studio.app/Contents/jbr/Contents/Home',
  '/opt/android-studio/jbr'
]
const jdk = env.BEAR_JAVA_HOME ?? studioJdks.find((p) => existsSync(p)) ?? env.JAVA_HOME
if (jdk) env.JAVA_HOME = jdk

const task = process.argv[2] ?? 'assembleDebug'
const gradlew = join(android, process.platform === 'win32' ? 'gradlew.bat' : 'gradlew')
// gradlew.bat has to run through cmd on Windows.
const [cmd, args] = process.platform === 'win32' ? ['cmd.exe', ['/d', '/c', gradlew, task]] : [gradlew, [task]]
const res = spawnSync(cmd, args, { cwd: android, env, stdio: 'inherit' })
if (res.status !== 0) process.exit(res.status ?? 1)

// Copy the APK to apps/mobile/release/Bear-<version>[-debug].apk, next to where the desktop builds go.
const variant = task.toLowerCase().includes('release') ? 'release' : 'debug'
const out = join(android, 'app', 'build', 'outputs', 'apk', variant)
const apk = [`app-${variant}.apk`, `app-${variant}-unsigned.apk`].map((f) => join(out, f)).find((f) => existsSync(f))
if (apk) {
  const { version } = JSON.parse(readFileSync(resolve(import.meta.dirname, '../package.json'), 'utf8'))
  const dest = resolve(import.meta.dirname, '../release', `Bear-${version}${variant === 'debug' ? '-debug' : ''}.apk`)
  mkdirSync(resolve(dest, '..'), { recursive: true })
  copyFileSync(apk, dest)
  console.log(`APK: ${dest}`)
}
