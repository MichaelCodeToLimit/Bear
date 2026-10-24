import { describe, expect, it } from 'vitest'
import { BLEND_MODES } from '../../ops/blend'
import { ADJUST_KIND, COMPOSITE_FS, SCREEN_FS, VERTEX_SHADER, buildCompositeFragmentShader } from './shaders'

describe('composite shader source', () => {
  it('has one switch case per blend mode, in BLEND_MODES order', () => {
    const src = buildCompositeFragmentShader()
    let at = src.indexOf('switch (mode)')
    expect(at).toBeGreaterThan(0)
    BLEND_MODES.forEach((m, i) => {
      const next = src.indexOf(`case ${i}: // ${m}\n`, at)
      expect(next, `case for ${m}`).toBeGreaterThan(at)
      at = next
    })
    expect(src).not.toContain(`case ${BLEND_MODES.length}:`)
    expect(COMPOSITE_FS).toBe(src)
  })

  it('declares the uniforms the compositor sets', () => {
    for (const u of ['u_mode', 'u_backdrop', 'u_layer', 'u_layerOrigin', 'u_layerSize', 'u_opacity', 'u_adjust', 'u_lut', 'u_hsl', 'u_mask', 'u_hasMask'])
      expect(COMPOSITE_FS).toMatch(new RegExp(`uniform [A-Za-z0-9 ]+ ${u};`))
    for (const u of ['u_comp', 'u_pan', 'u_zoom', 'u_viewSize', 'u_tile', 'u_grid']) expect(SCREEN_FS).toMatch(new RegExp(`uniform [A-Za-z0-9 ]+ ${u};`))
    expect(VERTEX_SHADER).toContain('u_rect')
  })

  it('numbers the adjustments the shader switches on', () => {
    expect(ADJUST_KIND).toEqual({ none: 0, lut: 1, hsl: 2, invert: 3, bw: 4 })
    for (const [name, n] of Object.entries(ADJUST_KIND)) if (n) expect(COMPOSITE_FS).toContain(`u_adjust == ${n}) // ${name}`)
  })

  it('starts every shader with the GLSL ES 3.00 version line', () => {
    for (const s of [VERTEX_SHADER, COMPOSITE_FS, SCREEN_FS]) expect(s.startsWith('#version 300 es\n')).toBe(true)
  })
})
