import { useEffect, useState } from 'react'
import type { Motion } from '../lib/motionPref'

function read(): Motion {
  return document.documentElement.dataset.motion === 'off' ? 'off' : 'on'
}

/** Current motion preference from `<html data-motion>`. Always 'on' during SSR. */
export function useMotion(): Motion {
  const [motion, setMotion] = useState<Motion>('on')
  useEffect(() => {
    setMotion(read())
    const observer = new MutationObserver(() => setMotion(read()))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-motion'] })
    return () => observer.disconnect()
  }, [])
  return motion
}
