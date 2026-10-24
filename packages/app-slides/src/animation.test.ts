import { describe, expect, it } from 'vitest'
import { buildSteps, clickCount, frameAt } from './animation'
import type { Animation, Slide } from './model'

const a = (id: string, elementId: string, effect: Animation['effect'], start: Animation['start'], duration = 500, delay = 0): Animation =>
  ({ id, elementId, effect, start, duration, delay })

const slide = (animations: Animation[]): Slide => ({ id: 's', notes: '', elements: [], animations })

describe('animation steps', () => {
  it('groups by click, with "with" starting together and "after" waiting', () => {
    const steps = buildSteps([
      a('1', 'title', 'fade', 'with'), // before any click: plays when the slide appears
      a('2', 'b1', 'flyIn', 'click', 400),
      a('3', 'b2', 'flyIn', 'with', 400),
      a('4', 'b3', 'zoom', 'after', 300, 100),
      a('5', 'pic', 'pulse', 'click')
    ])
    expect(steps.map((s) => s.map((t) => [t.anim.id, t.at]))).toEqual([[['1', 0]], [['2', 0], ['3', 0], ['4', 500]], [['5', 0]]])
    expect(clickCount(slide([a('1', 'x', 'fade', 'click'), a('2', 'y', 'fade', 'click')]))).toBe(2)
    expect(clickCount(slide([]))).toBe(0)
  })

  it('hides entrances until their click and removes exits after theirs', () => {
    const s = slide([a('1', 'b1', 'fade', 'click'), a('2', 'b1', 'fadeOut', 'click'), a('3', 'logo', 'spin', 'click')])
    expect(frameAt(s, 0).get('b1')).toEqual({ visible: false })
    expect(frameAt(s, 0).get('logo')).toEqual({ visible: true })
    expect(frameAt(s, 1).get('b1')?.visible).toBe(true)
    expect(frameAt(s, 1).get('b1')?.play?.anim.id).toBe('1')
    expect(frameAt(s, 2).get('b1')?.play?.anim.id).toBe('2') // still drawn while fading out
    expect(frameAt(s, 3).get('b1')).toEqual({ visible: false })
    expect(frameAt(s, 3).get('logo')?.play?.anim.effect).toBe('spin')
  })
})
