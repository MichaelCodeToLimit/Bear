import { setEdition } from '@bear/core'

// The web version and the Android app run as Bear Office for now: they reuse the desktop renderer, but Photo
// (Bear Studio) needs desktop-only parts of window.bear (crash-recovery copies, native file dialogs). Imported first
// by main.tsx, so the edition is set before any app or launcher module evaluates.
setEdition('office')
