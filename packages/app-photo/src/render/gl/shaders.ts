import { BLEND_MODES } from '../../ops/blend'
import type { BlendMode } from '../../model/doc'

/**
 * GLSL ES 3.00 sources for the WebGL2 compositor.
 *
 * COMPOSITE_FS blends one layer over the accumulated backdrop, one document tile at a time,
 * exactly as `compositeLayers` in ops/composite.ts does (W3C Compositing 1, straight alpha):
 *   Cs' = (1 - ab)·Cs + ab·B(Cb, Cs);  ao = as + ab·(1 - as);  Co = (as·Cs' + ab·Cb·(1 - as)) / ao
 * The blend function B follows ops/blend.ts. `u_mode` is the index in BLEND_MODES; the switch
 * below is generated from that list so the two cannot drift apart.
 *
 * Before blending, the preview layer's colour can be run through the preview adjustment, mirroring
 * ops/adjust.ts in 0..255 integer steps (Uint8ClampedArray stores round half to even, hence
 * roundEven), then mixed with the mask as in + (adj - in)·m/255.
 */

/** Values of `u_adjust`. Brightness/contrast is sent as a LUT (see brightnessContrastLut). */
export const ADJUST_KIND = { none: 0, lut: 1, hsl: 2, invert: 3, bw: 4 } as const

/** Unit quad (0..1) mapped onto `u_rect` (x, y, w, h in top-left-origin pixels) of a `u_target` sized surface. */
export const VERTEX_SHADER = `#version 300 es
in vec2 a_pos;
uniform vec4 u_rect;
uniform vec2 u_target;
void main() {
  vec2 p = u_rect.xy + a_pos * u_rect.zw;
  gl_Position = vec4(p.x / u_target.x * 2.0 - 1.0, 1.0 - p.y / u_target.y * 2.0, 0.0, 1.0);
}
`

/** GLSL for B(Cb, Cs) per mode, keyed by BlendMode. Separable modes apply per channel. */
const BLEND_GLSL: Record<BlendMode, string> = {
  normal: 'return cs;',
  multiply: 'return cb * cs;',
  screen: 'return cb + cs - cb * cs;',
  overlay: 'return vec3(hardLight(cs.r, cb.r), hardLight(cs.g, cb.g), hardLight(cs.b, cb.b));',
  darken: 'return min(cb, cs);',
  lighten: 'return max(cb, cs);',
  'color-dodge': 'return vec3(colorDodge(cb.r, cs.r), colorDodge(cb.g, cs.g), colorDodge(cb.b, cs.b));',
  'color-burn': 'return vec3(colorBurn(cb.r, cs.r), colorBurn(cb.g, cs.g), colorBurn(cb.b, cs.b));',
  'hard-light': 'return vec3(hardLight(cb.r, cs.r), hardLight(cb.g, cs.g), hardLight(cb.b, cs.b));',
  'soft-light': 'return vec3(softLight(cb.r, cs.r), softLight(cb.g, cs.g), softLight(cb.b, cs.b));',
  difference: 'return abs(cb - cs);',
  exclusion: 'return cb + cs - 2.0 * cb * cs;',
  hue: 'return setLum(setSat(cs, sat(cb)), lum(cb));',
  saturation: 'return setLum(setSat(cb, sat(cs)), lum(cb));',
  color: 'return setLum(cs, lum(cb));',
  luminosity: 'return setLum(cb, lum(cs));'
}

export function buildCompositeFragmentShader(): string {
  const cases = BLEND_MODES.map((m, i) => `    case ${i}: // ${m}\n      ${BLEND_GLSL[m]}`).join('\n')
  return `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;

uniform sampler2D u_backdrop;   // accumulated tile so far (straight alpha)
uniform sampler2D u_layer;      // RGBA8 layer pixels (straight alpha), one layer tile
uniform ivec2 u_layerOrigin;    // layer tile's top-left, relative to this document tile
uniform ivec2 u_layerSize;      // layer tile size
uniform float u_opacity;
uniform int u_mode;             // index in BLEND_MODES
uniform int u_adjust;           // ADJUST_KIND
uniform sampler2D u_lut;        // 256x1 R8 lookup table (lut kind)
uniform vec3 u_hsl;             // hue shift (turns), saturation multiplier, lightness amount
uniform bool u_hasMask;
uniform sampler2D u_mask;       // R8 mask covering this document tile

out vec4 o_color;

// ---- blend functions, ported from ops/blend.ts ----
float hardLight(float cb, float cs) {
  return cs <= 0.5 ? cb * 2.0 * cs : cb + (2.0 * cs - 1.0) - cb * (2.0 * cs - 1.0);
}
float colorDodge(float cb, float cs) {
  if (cb == 0.0) return 0.0;
  if (cs >= 1.0) return 1.0;
  return min(1.0, cb / (1.0 - cs));
}
float colorBurn(float cb, float cs) {
  if (cb >= 1.0) return 1.0;
  if (cs <= 0.0) return 0.0;
  return 1.0 - min(1.0, (1.0 - cb) / cs);
}
float softLight(float cb, float cs) {
  if (cs <= 0.5) return cb - (1.0 - 2.0 * cs) * cb * (1.0 - cb);
  float d = cb <= 0.25 ? ((16.0 * cb - 12.0) * cb + 4.0) * cb : sqrt(cb);
  return cb + (2.0 * cs - 1.0) * (d - cb);
}
float lum(vec3 c) { return 0.3 * c.r + 0.59 * c.g + 0.11 * c.b; }
vec3 clipColor(vec3 c) {
  float l = lum(c);
  float n = min(c.r, min(c.g, c.b));
  float x = max(c.r, max(c.g, c.b));
  if (n < 0.0) c = l + (c - l) * l / (l - n);
  if (x > 1.0) c = l + (c - l) * (1.0 - l) / (x - l);
  return c;
}
vec3 setLum(vec3 c, float l) { return clipColor(c + (l - lum(c))); }
float sat(vec3 c) { return max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b)); }
// Same result as blend.ts's sort-based SetSat: min -> 0, max -> s, mid scaled between.
vec3 setSat(vec3 c, float s) {
  float mx = max(c.r, max(c.g, c.b));
  float mn = min(c.r, min(c.g, c.b));
  if (mx > mn) return (c - mn) * s / (mx - mn);
  return vec3(0.0);
}

vec3 blendFn(int mode, vec3 cb, vec3 cs) {
  switch (mode) {
${cases}
  }
  return cs;
}

// ---- preview adjustments, ported from ops/adjust.ts (values 0..255) ----
float hue2rgb(float p, float q, float t) {
  if (t < 0.0) t += 1.0;
  if (t > 1.0) t -= 1.0;
  if (t < 1.0 / 6.0) return p + (q - p) * 6.0 * t;
  if (t < 0.5) return q;
  if (t < 2.0 / 3.0) return p + (q - p) * (2.0 / 3.0 - t) * 6.0;
  return p;
}
vec3 hueSaturation(vec3 v) {
  float r = v.r / 255.0;
  float g = v.g / 255.0;
  float b = v.b / 255.0;
  float mx = max(r, max(g, b));
  float mn = min(r, min(g, b));
  float c = mx - mn;
  float l = (mx + mn) / 2.0;
  float h = 0.0;
  float s = 0.0;
  if (c > 0.0) {
    s = c / (1.0 - abs(2.0 * l - 1.0));
    if (mx == r) h = (g - b) / c + (g < b ? 6.0 : 0.0);
    else if (mx == g) h = (b - r) / c + 2.0;
    else h = (r - g) / c + 4.0;
    h /= 6.0;
  }
  h += u_hsl.x;
  h -= floor(h); // == ((h % 1) + 1) % 1
  s = clamp(s * u_hsl.y, 0.0, 1.0);
  l = u_hsl.z > 0.0 ? l + (1.0 - l) * u_hsl.z : l * (1.0 + u_hsl.z);
  float q = l < 0.5 ? l * (1.0 + s) : l + s - l * s;
  float pp = 2.0 * l - q;
  return 255.0 * vec3(hue2rgb(pp, q, h + 1.0 / 3.0), hue2rgb(pp, q, h), hue2rgb(pp, q, h - 1.0 / 3.0));
}
float lutAt(float v) { return round(texelFetch(u_lut, ivec2(int(v), 0), 0).r * 255.0); }
// Store as Uint8ClampedArray would: clamp, round half to even.
vec3 store8(vec3 v) { return roundEven(clamp(v, 0.0, 255.0)); }

vec3 adjust(vec3 v) {
  if (u_adjust == ${ADJUST_KIND.lut}) // lut
    return vec3(lutAt(v.r), lutAt(v.g), lutAt(v.b));
  if (u_adjust == ${ADJUST_KIND.hsl}) // hsl
    return store8(hueSaturation(v));
  if (u_adjust == ${ADJUST_KIND.invert}) // invert
    return 255.0 - v;
  if (u_adjust == ${ADJUST_KIND.bw}) // bw
    return store8(vec3(0.2126 * v.r + 0.7152 * v.g + 0.0722 * v.b));
  return v;
}

void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec4 back = texelFetch(u_backdrop, p, 0);
  ivec2 lp = p - u_layerOrigin;
  if (any(lessThan(lp, ivec2(0))) || any(greaterThanEqual(lp, u_layerSize))) {
    o_color = back;
    return;
  }
  vec4 src = texelFetch(u_layer, lp, 0);
  float sa = src.a * u_opacity;
  if (sa <= 0.0) {
    o_color = back;
    return;
  }
  vec3 cs = src.rgb;
  if (u_adjust != ${ADJUST_KIND.none}) {
    float m = u_hasMask ? round(texelFetch(u_mask, p, 0).r * 255.0) : 255.0;
    if (m > 0.0) {
      vec3 v = round(cs * 255.0);
      vec3 a = adjust(v);
      if (m < 255.0) a = store8(v + (a - v) * m / 255.0);
      cs = a / 255.0;
    }
  }
  float ab = back.a;
  vec3 cb = back.rgb;
  vec3 c = cs;
  if (ab > 0.0 && u_mode != 0) c = (1.0 - ab) * cs + ab * blendFn(u_mode, cb, cs);
  float ao = sa + ab * (1.0 - sa);
  float k = ab * (1.0 - sa);
  o_color = vec4((sa * c + k * cb) / ao, ao);
}
`
}

export const COMPOSITE_FS = buildCompositeFragmentShader()

/**
 * Draws one composited document tile to the screen through the view transform, over an 8 px
 * light/dark checkerboard in screen space, with pixel-grid lines when u_grid is set (zoom >= 8).
 */
export const SCREEN_FS = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;

uniform sampler2D u_comp;  // composited document tile (straight alpha)
uniform vec2 u_pan;
uniform float u_zoom;
uniform vec2 u_viewSize;
uniform vec4 u_tile;       // tile rect in document pixels
uniform bool u_grid;

out vec4 o_color;

const float LIGHT = ${(255 / 255).toFixed(6)};
const float DARK = ${(204 / 255).toFixed(6)};

void main() {
  vec2 s = vec2(gl_FragCoord.x, u_viewSize.y - gl_FragCoord.y); // top-left origin, pixel centre
  vec2 d = (s - u_pan) / u_zoom;
  vec4 c = clamp(texture(u_comp, (d - u_tile.xy) / u_tile.zw), 0.0, 1.0);
  ivec2 cell = ivec2(floor(s / 8.0));
  float checker = ((cell.x + cell.y) & 1) == 0 ? LIGHT : DARK;
  vec3 col = c.rgb * c.a + vec3(checker) * (1.0 - c.a);
  if (u_grid) {
    vec2 f = fract(d) * u_zoom;
    if (f.x < 1.0 || f.y < 1.0) col = mix(col, vec3(0.5), 0.35);
  }
  o_color = vec4(col, 1.0);
}
`
