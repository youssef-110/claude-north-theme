import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionContextUsage, ThemeSetArgs, ThemeSound, ThemeStyle } from 'claude-code'

import type { TheNorthCache } from '../types'
import { makeColors } from './make-colors.js'

// A frozen northern night, original art in the spirit of the old North.
// A raven on an iron-banded sign reads out the context window and the prompt
// cache (an hourglass that drains as the cache runs out). On the left a cloaked
// swordsman and his white wolf beneath a red-leafed white tree; on the right a
// torch-lit castle under the moon; behind it all a great wall of ice. The storm
// thickens as the context window fills.

const SCENE = 'the-north'

const fill = atom({ plugin: 'the-north', key: 'fill' } as const, 0)
const cache = atom({ plugin: 'the-north', key: 'cache' } as const, { at: 0, ttl: 0 } as TheNorthCache)

const stepFill = (context: SessionContextUsage): number =>
  Math.min(100, Math.max(0, Math.round(context.percent ?? 0)))

// ---------------------------------------------------------------- palette

const { theme, problems } = makeColors({
  label: 'The North',
  only: 'dark',
  roles: {
    accent: '#a9c7e6',
    danger: '#d1495b',
    success: '#86b89a',
    warning: '#d6a25a',
    pro: '#b5a3d9',
  },
  dark: {
    gray: {
      anchors: {
        'surface-0': '#0d1015',
        'surface-1': '#12161c',
        'surface-2': '#171c23',
        'surface-3': '#1b2028',
        'text-primary': '#e8ecf1',
        'text-secondary': '#c3cad3',
        'text-muted': '#9ca5b0',
      },
    },
    git: { added: '#86b89a', removed: '#d1495b', modified: '#d6a25a' },
  },
})

// ---------------------------------------------------------------- helpers

/** Seeded random, so every redraw puts each star, flake and leaf in the same place. */
const random = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

const n = (v: number): number => Math.round(v * 10) / 10

/** A negative delay that puts a loop at the same point on the wall clock, so a redraw doesn't jump. */
const phase = (nowS: number, dur: number, offset = 0): string => `animation-delay:-${n((nowS + offset) % dur)}s`

/** A rolling line closed down to the bottom of a 1600 by 1000 box. */
const ridge = (base: number, amp: number, seed: number, scale: number): string => {
  const rand = random(seed)
  const waves = [0.55, 0.3, 0.15].map((a, i) => ({ a, f: (0.0025 + rand() * 0.003) * (i + 1) * scale, p: rand() * 6.28 }))
  let d = 'M0 1000'

  for (let x = 0; x <= 1600; x += 16) {
    d += `L${x} ${n(base - amp * waves.reduce((sum, w) => sum + w.a * Math.sin(x * w.f + w.p), 0))}`
  }

  return `${d}L1600 1000Z`
}

/** A snowy pine: stacked tiers, each with snow resting on top and on its tips. */
const pine = (x: number, base: number, h: number, body: string, snow: string, tiers = 4): string => {
  const gap = 0.8 / tiers
  const th = h * (gap + 0.14)
  let out = `<rect x="${n(x - h * 0.035)}" y="${n(base - h * 0.14)}" width="${n(h * 0.07)}" height="${n(h * 0.14)}" fill="#1a120c"/>`

  for (let i = 0; i < tiers; i++) {
    const top = base - h + i * h * gap
    const bot = top + th
    const half = h * (0.1 + ((i + 1) / tiers) * 0.24)
    out +=
      `<path d="M${n(x)} ${n(top)}L${n(x + half)} ${n(bot)}Q${n(x)} ${n(bot - th * 0.16)} ${n(x - half)} ${n(bot)}Z" fill="${body}"/>` +
      `<path d="M${n(x)} ${n(top)}L${n(x + half * 0.48)} ${n(top + th * 0.48)}` +
      `Q${n(x + half * 0.34)} ${n(top + th * 0.42)} ${n(x + half * 0.2)} ${n(top + th * 0.56)}` +
      `Q${n(x + half * 0.04)} ${n(top + th * 0.4)} ${n(x - half * 0.14)} ${n(top + th * 0.52)}` +
      `Q${n(x - half * 0.32)} ${n(top + th * 0.4)} ${n(x - half * 0.48)} ${n(top + th * 0.48)}Z" fill="${snow}"/>` +
      `<ellipse cx="${n(x + half * 0.86)}" cy="${n(bot - 2)}" rx="${n(half * 0.2)}" ry="3" fill="${snow}"/>` +
      `<ellipse cx="${n(x - half * 0.86)}" cy="${n(bot - 2)}" rx="${n(half * 0.2)}" ry="3" fill="${snow}"/>`
  }

  return out
}

/** Soft banks of mist or cloud laid twice, a screen apart, so sliding left one screen loops cleanly. */
const drift = (seed: number, count: number, y0: number, y1: number, rx0: number, rx1: number, gradient: string, cls: string, dur: number, nowS: number, opacity: number): string => {
  const rand = random(seed)
  let out = ''

  for (let i = 0; i < count; i++) {
    const x = n(rand() * 1600)
    const y = n(y0 + rand() * (y1 - y0))
    const rx = n(rx0 + rand() * (rx1 - rx0))
    const ry = n(rx * (0.12 + rand() * 0.1))
    out += `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}"/><ellipse cx="${n(x + 1600)}" cy="${y}" rx="${rx}" ry="${ry}"/>`
  }

  return `<g class="${cls}" style="animation-duration:${dur}s;${phase(nowS, dur, seed)}" fill="url(#${gradient})" opacity="${n(opacity)}">${out}</g>`
}

// ---------------------------------------------------------------- sky, the wall of ice and the land (1600 by 1000, cropped to fill)

const STARS = (() => {
  const rand = random(11)
  let out = ''

  for (let i = 0; i < 80; i++) {
    const twinkle =
      i % 3 === 0 ? ` class="tw" style="animation-duration:${n(6 + rand() * 7)}s;animation-delay:-${n(rand() * 9)}s"` : ''
    out += `<circle cx="${n(rand() * 1600)}" cy="${n(Math.pow(rand(), 1.3) * 440)}" r="${n(0.5 + rand() * 1)}" opacity="${n(0.3 + rand() * 0.5)}"${twinkle}/>`
  }

  return `<g fill="#eef3fa">${out}</g>`
})()

const WALL = (() => {
  const rand = random(19)
  const top: [number, number][] = []

  for (let x = -10; x <= 1610; x += 20) {
    top.push([x, 502 + Math.sin(x * 0.0035) * 7 + (rand() - 0.5) * 5])
  }
  const edge = top.map(([x, y]) => `${x} ${n(y)}`).join('L')
  const rim = top.map(([x, y]) => `${x} ${n(y + 9)}`).reverse().join('L')
  let light = ''
  let dark = ''

  for (let i = 0; i < 90; i++) {
    const x = n(rand() * 1600)
    const y = n(512 + rand() * 50)
    const len = n(60 + rand() * 240)
    const lean = n((rand() - 0.5) * 10)

    if (i % 3 === 0) {
      dark += `M${x} ${y}l${lean} ${len}`
    } else {
      light += `M${x} ${y}l${lean} ${len}`
    }
  }

  return (
    '<rect y="430" width="1600" height="80" fill="url(#wallGlow)" opacity=".7"/>' +
    `<path d="M${edge}L1610 900L-10 900Z" fill="url(#wall)"/>` +
    `<path d="${light}" stroke="#dbe8f5" stroke-opacity=".13" stroke-width="1.3" fill="none"/>` +
    `<path d="${dark}" stroke="#1f3049" stroke-opacity=".35" stroke-width="2.2" fill="none"/>` +
    `<path d="M${edge}L${rim}Z" fill="#ffffff" class="ice"/>`
  )
})()

/** Distant forest along the foot of the wall: every pine in one path, every snow cap in another. */
const FOREST = (() => {
  const rand = random(5)
  let body = ''
  let snow = ''

  for (let x = -20; x < 1620; x += 12 + rand() * 20) {
    const base = 822 + Math.sin(x * 0.004) * 12 + rand() * 6
    const h = 40 + rand() * 56

    for (let j = 0; j < 3; j++) {
      const top = base - h + j * h * 0.26
      const half = h * (0.14 + j * 0.08)
      const bot = top + h * 0.42
      body += `M${n(x)} ${n(top)}L${n(x + half)} ${n(bot)}L${n(x - half)} ${n(bot)}Z`
      snow += `M${n(x)} ${n(top)}L${n(x + half * 0.4)} ${n(top + h * 0.17)}L${n(x - half * 0.4)} ${n(top + h * 0.17)}Z`
    }
  }

  return `<path d="${body}" fill="#0f1726"/><path d="${snow}" fill="#7d8fae" opacity=".8"/>`
})()

const FIELD = ridge(852, 12, 13, 0.7)

/** A bat wing: the arm up to the wrist, four long fingers, and the membrane scalloped between them. */
const DRAGON_WING = 'M-10 -6Q-18 -34 -30 -58L-40 -92Q-14 -72 0 -86Q12 -62 34 -68Q36 -46 56 -36Q36 -22 30 -6Z'

/** A great dragon, black against the sky, that crosses every 40 seconds with slow beats of its wings. */
const DRAGON = (nowS: number): string =>
  `<g class="dragon" style="${phase(nowS, 40)}"><g class="glide">` +
  // far wing, behind the body
  `<g class="flap2"><path transform="translate(14 2) scale(.72)" d="${DRAGON_WING}" fill="#0a0c11" stroke="#3e4a63" stroke-width="1.3" opacity=".8"/></g>` +
  // body: horned head, long neck, tucked legs, tail ending in a spade
  '<path d="M-82 -12L-70 -18L-67 -26L-63 -17L-58 -16Q-44 -16 -32 -9Q-16 -15 4 -14Q24 -13 36 -3Q70 6 104 4L114 0L116 8L108 10L112 16L102 12Q70 14 36 9Q22 14 6 14Q-16 13 -30 3Q-44 -4 -58 -8L-70 -8Z' +
  'M0 8L-4 16L4 14ZM22 8L20 17L28 14Z" fill="#0a0c11" stroke="#3e4a63" stroke-width="1.1" stroke-linejoin="round"/>' +
  // near wing
  `<g class="flap"><path d="${DRAGON_WING}" fill="#0b0d12" stroke="#4a5672" stroke-width="1.2" stroke-linejoin="round"/>` +
  '<path d="M-30 -58L0 -86M-30 -58L34 -68M-30 -58L56 -36" stroke="#3a4760" stroke-width="1.2"/></g>' +
  '</g></g>'

const backdrop = (k: number, nowS: number): string =>
  '<svg width="100%" height="100%" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice">' +
  '<rect width="1600" height="1000" fill="url(#sky)"/>' +
  `<g class="au" style="${phase(nowS, 52)}" opacity="${n(0.2 - 0.08 * k)}">` +
  '<path d="M-60 150C260 70 560 230 880 120S1380 90 1660 170L1660 230C1400 160 1180 210 880 195S380 150 -60 225Z" fill="url(#au)"/></g>' +
  STARS +
  drift(61, 7, 90, 330, 180, 340, 'cloud', 'drift', 260, nowS, 0.55 + 0.3 * k) +
  DRAGON(nowS) +
  WALL +
  drift(67, 9, 770, 830, 160, 300, 'mist', 'drift', 140, nowS, 0.45 + 0.4 * k) +
  FOREST +
  `<path d="${FIELD}" fill="url(#field)"/>` +
  drift(71, 6, 880, 960, 140, 260, 'mist', 'drift', 70, nowS, 0.3 + 0.4 * k) +
  '</svg>'

// ---------------------------------------------------------------- left: the sign, the tree, the swordsman and his wolf (480 by 1000, pinned bottom left)

/** A weirwood leaf: five-pointed, like a small red hand, about 20 units across at scale 1. */
const LEAF = 'M0 -10L2 -5L7 -7L5 -2L10 -2L6 2L7 6L2 4L1 8L0 10L-1 8L-2 4L-7 6L-6 2L-10 -2L-5 -2L-7 -7L-2 -5Z'

const LEAF_REDS = ['#5c0e17', '#7a121d', '#931826', '#ad1f2c', '#c42f35']

/** A clump of foliage: a rough disc whose rim is all leaf tips and notches, flatter underneath. */
const clump = (cx: number, cy: number, r: number, rand: () => number): string => {
  let d = ''

  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * Math.PI * 2
    const rr = r * (i % 2 === 0 ? 1 + rand() * 0.16 : 0.82 + rand() * 0.06)
    const squash = Math.sin(a) > 0 ? 0.7 : 0.92
    d += `${i === 0 ? 'M' : 'L'}${Math.round(cx + Math.cos(a) * rr)} ${Math.round(cy + Math.sin(a) * rr * squash)}`
  }

  return `${d}Z`
}

/** The heart tree: a gnarled bone-white weirwood with a weeping face and a wide crown of red hand-shaped leaves. */
const HEART_TREE = (() => {
  const rand = random(53)
  const tops: [number, number, number][] = []
  const layer = (count: number, r0: number, r1: number, ox: number, oy: number, rx: number, ry: number): string => {
    let d = ''

    for (let i = 0; i < count; i++) {
      const a = rand() * Math.PI * 2
      const t = Math.sqrt(rand())
      const cx = ox + Math.cos(a) * t * rx
      const cy = oy + Math.sin(a) * t * ry
      const r = r0 + rand() * (r1 - r0)
      tops.push([cx, cy - r * 0.9, r])
      d += clump(cx, cy, r, rand)
    }

    return d
  }
  const back = layer(12, 34, 50, 108, 566, 150, 60)
  const mid = layer(16, 26, 40, 112, 556, 140, 54)
  const front = layer(14, 18, 30, 118, 548, 124, 48)
  const lit = layer(8, 13, 22, 152, 520, 84, 26)

  // single leaves fringing the crown, and hanging below it
  let fringe = ''

  for (let i = 0; i < 30; i++) {
    const a = rand() * Math.PI * 2
    const x = n(110 + Math.cos(a) * (150 + rand() * 26))
    const y = n(556 + Math.sin(a) * (62 + rand() * 16) + (Math.sin(a) > 0 ? 8 : 0))
    const s = n(0.7 + rand() * 0.5)
    fringe += `<path transform="translate(${x} ${y}) rotate(${Math.round(rand() * 360)}) scale(${s})" d="${LEAF}" fill="${LEAF_REDS[1 + Math.floor(rand() * 4)]}"/>`
  }

  // snow resting on the highest clumps
  const snow = tops
    .filter(([, top]) => top < 512)
    .slice(0, 7)
    .map(([x, top, r]) => `<path d="M${Math.round(x - r * 0.6)} ${Math.round(top + 6)}Q${Math.round(x)} ${Math.round(top - 4)} ${Math.round(x + r * 0.6)} ${Math.round(top + 6)}Q${Math.round(x)} ${Math.round(top + 2)} ${Math.round(x - r * 0.6)} ${Math.round(top + 6)}Z" fill="#edf2f8"/>`)
    .join('')

  return (
    // trunk with its roots and three twisting limbs, lit by the moon from the right
    '<path d="M18 948Q40 936 56 926Q66 900 64 860Q58 810 68 770Q76 730 70 700Q62 672 44 640Q30 618 10 596L22 590Q46 610 64 630Q74 650 82 664' +
    'Q86 630 84 598Q82 570 92 540L104 542Q100 574 104 600Q108 630 104 660Q120 636 146 616Q170 598 200 586L206 596Q178 610 156 628' +
    'Q130 652 122 690Q116 730 124 770Q132 810 128 860Q128 900 140 924Q160 936 186 946L150 950L110 946L80 950Z" fill="url(#bark)"/>' +
    // grooves twisting up the bark
    '<path d="M70 900Q75 860 70 820M118 904Q113 850 120 800M76 742Q83 712 79 690M112 724Q106 694 112 668M60 652Q46 630 28 608M94 600Q92 574 98 548M136 640Q162 616 192 596M44 936Q60 924 66 910M150 934Q136 922 132 904" stroke="#9f978b" stroke-width="2" stroke-linecap="round" fill="none" opacity=".6"/>' +
    '<ellipse cx="72" cy="880" rx="4" ry="8" fill="#a49c90" opacity=".6"/><ellipse cx="118" cy="716" rx="3" ry="6" fill="#a49c90" opacity=".6"/>' +
    // the carved face, long and sorrowful, weeping red sap
    '<path d="M74 772Q78 752 96 750Q116 752 120 774Q122 810 112 834Q96 846 80 834Q70 810 74 772Z" fill="#d6cfc3" opacity=".45"/>' +
    '<path d="M77 777Q86 767 95 774M98 774Q107 767 116 777" stroke="#7e766b" stroke-width="2.8" stroke-linecap="round" fill="none"/>' +
    '<path d="M79 782Q87 776 94 782Q87 788 79 782ZM99 782Q106 776 114 782Q106 788 99 782Z" fill="#2b1f1c"/>' +
    '<path d="M96 780Q93 796 98 806L92 808" stroke="#9b948a" stroke-width="2" stroke-linecap="round" fill="none"/>' +
    '<path d="M83 822Q96 813 109 822Q103 836 96 838Q89 836 83 822Z" fill="#2b1f1c"/>' +
    '<path d="M85 787Q83 800 86 814Q84 826 86 834M108 787Q110 798 107 810M91 837Q90 848 92 858" stroke="#9e1420" stroke-width="2.6" stroke-linecap="round" fill="none"/>' +
    '<circle cx="86" cy="836" r="2.2" fill="#9e1420"/><circle cx="107" cy="812" r="2" fill="#9e1420"/><circle cx="92" cy="860" r="2.2" fill="#9e1420"/>' +
    // crown, back to front, with a leaf texture over the nearer layers
    `<path d="${back}" fill="${LEAF_REDS[0]}"/>` +
    `<path d="${mid}" fill="${LEAF_REDS[1]}"/><path d="${mid}" fill="url(#leafTex)" opacity=".55"/>` +
    `<path d="${front}" fill="${LEAF_REDS[2]}"/><path d="${front}" fill="url(#leafTex)" opacity=".5"/>` +
    `<path d="${lit}" fill="${LEAF_REDS[4]}" opacity=".9"/>` +
    fringe +
    snow +
    // snow heaped round the roots
    '<path d="M8 958Q34 932 64 940Q92 928 122 940Q156 928 196 958Z" fill="url(#drift)"/>'
  )
})()

const LEAVES = (nowS: number): string => {
  const rand = random(59)
  let out = ''

  for (let i = 0; i < 9; i++) {
    const x = n(10 + rand() * 200)
    const y = n(566 + rand() * 50)
    const dur = n(10 + rand() * 6)
    out += `<g transform="translate(${x} ${y})"><g class="leaf" style="animation-duration:${dur}s;${phase(nowS, dur, i * 3.7)}"><path transform="scale(.55)" d="${LEAF}" fill="${LEAF_REDS[2 + (i % 3)]}"/></g></g>`
  }

  return out
}

/** The swordsman of the Watch-black cloak, drawn round his feet (380, 955), facing the castle. */
const SWORDSMAN = (nowS: number): string =>
  '<ellipse cx="374" cy="957" rx="64" ry="7" fill="#8c9bb4" opacity=".5"/>' +
  '<g transform="translate(380 955)">' +
  // black cloak behind him, swept left by the wind
  '<g class="cloak"><path d="M-34 -246C-52 -200 -72 -110 -94 -18Q-72 -8 -52 -15Q-30 -5 -10 -13Q6 -7 22 -15L30 -120L34 -246Z" fill="url(#cloak)"/>' +
  '<path d="M-26 -230Q-48 -140 -70 -20M-10 -220Q-24 -120 -34 -12M12 -200Q8 -110 6 -12M-40 -170Q-56 -100 -82 -24" stroke="#2c3039" stroke-width="2" fill="none" opacity=".7"/>' +
  // moonlight along the cloak's right edge
  '<path d="M33 -240L29 -120L21 -17" stroke="#465066" stroke-width="2.5" stroke-linecap="round" fill="none" opacity=".85"/></g>' +
  // back leg and boot
  '<path d="M-14 -152L-18 -62L-4 -62L0 -150Z" fill="#17181c"/>' +
  '<path d="M-20 -64L-22 -5Q-22 0 -16 0L2 0Q4 -4 -3 -7L-4 -64Z" fill="#0b0b0d"/>' +
  // scabbard hanging back from the hip
  '<path d="M-4 -148L-56 -46" stroke="#2b221b" stroke-width="7" stroke-linecap="round"/>' +
  '<path d="M-51 -56L-57 -44M-14 -128L-18 -120" stroke="#8d939c" stroke-width="7" stroke-linecap="round"/>' +
  // quilted black jerkin, a leather baldric across it
  '<path d="M-24 -230Q-29 -190 -23 -150L23 -150Q29 -190 25 -230Z" fill="#1c1916"/>' +
  '<path d="M-26 -212H26M-27 -196H27M-26 -180H26M-25 -166H25M0 -230V-150" stroke="#2c2722" stroke-width="1.4"/>' +
  '<path d="M20 -228L-21 -158" stroke="#3a2a1c" stroke-width="4.5"/><path d="M19.5 -226L-20 -160" stroke="#5a4330" stroke-width="1"/>' +
  // front leg and boot, buckled
  '<path d="M0 -152L6 -62L20 -62L18 -150Z" fill="#1b1c21"/>' +
  '<path d="M4 -64L6 -5Q6 0 12 0L31 0Q33 -4 25 -8L21 -64Z" fill="#0d0d10"/>' +
  '<path d="M5 -40H22M-21 -40H-4" stroke="#3a2a1c" stroke-width="3"/>' +
  // fur at the boot tops
  '<path d="M-23 -66L-19 -58L-15 -64L-11 -57L-7 -64L-3 -58L-1 -66ZM3 -66L7 -58L11 -64L15 -57L19 -64L23 -66Z" fill="#3e3730"/>' +
  // belt and buckle
  '<rect x="-25" y="-157" width="50" height="9" rx="2" fill="#4a3424"/>' +
  '<rect x="2" y="-158.5" width="9" height="12" rx="1.5" fill="none" stroke="#b0b4ba" stroke-width="1.8"/>' +
  // sword at the hip, his gloved hand on the grip
  '<path d="M0 -153L10 -173" stroke="#3b2a1e" stroke-width="5" stroke-linecap="round"/>' +
  '<path d="M-10.7 -158.4L10.7 -147.6" stroke="#9aa1ab" stroke-width="4" stroke-linecap="round"/>' +
  '<circle cx="11.8" cy="-176.6" r="4.6" fill="#9aa1ab"/><circle cx="10.8" cy="-177.6" r="1.6" fill="#d4d8de"/>' +
  '<path d="M10 -238Q31 -230 31 -196Q31 -178 22 -166L12 -167Q18 -181 16 -196Q14 -214 5 -224Z" fill="#191613"/>' +
  '<path d="M30 -214Q31 -196 27 -178" stroke="#3c4252" stroke-width="2" fill="none"/>' +
  '<ellipse cx="13" cy="-165" rx="7.5" ry="6.5" fill="#0f0f11"/>' +
  // shaggy fur mantle over the shoulders
  '<path d="M-42 -224Q-47 -244 -32 -252Q-28 -266 -12 -262Q0 -272 14 -262Q30 -266 36 -252Q50 -246 45 -228Q49 -214 35 -214L28 -206L20 -214L10 -206L0 -214L-10 -206L-20 -214L-30 -206L-36 -214Q-49 -214 -42 -224Z" fill="#3e3730"/>' +
  '<path d="M-36 -236Q-30 -246 -22 -242M-14 -250Q-6 -258 4 -252M14 -250Q24 -256 30 -246M34 -234Q42 -236 42 -226M-26 -222Q-18 -230 -10 -222M2 -224Q10 -232 18 -224M-40 -226Q-36 -232 -30 -228" stroke="#75695c" stroke-width="2.2" stroke-linecap="round" fill="none"/>' +
  '<path d="M36 -248Q46 -240 44 -228M30 -222Q40 -220 42 -214" stroke="#958877" stroke-width="2" stroke-linecap="round" fill="none"/>' +
  // snow settled on his shoulders
  '<path d="M-38 -238Q-34 -250 -24 -250Q-18 -258 -8 -255Q2 -262 12 -256Q22 -260 30 -252Q40 -250 42 -242Q30 -246 20 -248Q6 -250 -8 -248Q-24 -246 -38 -238Z" fill="#edf2f8" opacity=".9"/>' +
  // head in profile toward the castle: dark curls with a knot at the back, a short full beard
  '<path d="M-16 -258Q-26 -284 -8 -298Q6 -306 20 -298Q27 -292 24 -286Q18 -290 12 -288Q8 -280 9 -270Q8 -262 4 -256Q-6 -250 -16 -258Z" fill="#15100d"/>' +
  '<path d="M6 -288Q14 -292 21 -286L23 -280Q21 -276 22 -274L26 -268L27.5 -265L24 -263.5L24 -261L22.5 -259L23 -257Q21 -252 17 -250Q10 -249 6 -255Z" fill="#d2ab8b"/>' +
  '<path d="M14 -268Q17 -262 15 -257M8 -276Q10 -270 8 -264" stroke="#b48c6e" stroke-width="1.5" fill="none" opacity=".8"/>' +
  '<path d="M6 -264Q8 -256 12 -252Q17 -248 22 -252Q24 -256 23 -258L21 -259Q18 -257 14 -258Q10 -260 8 -266Z" fill="#1d1611"/>' +
  '<path d="M18 -262.5Q21 -263.8 24.3 -262Q21 -260.8 18 -261.5Z" fill="#1d1611"/>' +
  '<path d="M15.5 -276Q18 -277.8 20.6 -276.2" stroke="#2a1c14" stroke-width="1.5" fill="none" stroke-linecap="round"/>' +
  '<path d="M13 -279.6Q17 -281.8 22.6 -279.2" stroke="#1d1611" stroke-width="2.1" fill="none" stroke-linecap="round"/>' +
  '<g fill="#15100d"><circle cx="-13" cy="-262" r="5"/><circle cx="-18" cy="-271" r="5"/><circle cx="-10" cy="-254" r="4.5"/><circle cx="-16" cy="-282" r="4.5"/>' +
  '<circle cx="-4" cy="-294" r="5"/><circle cx="7" cy="-298" r="5"/><circle cx="17" cy="-293" r="4.5"/><circle cx="2" cy="-286" r="4"/><circle cx="-11" cy="-299" r="6"/></g>' +
  '<path d="M-14 -296Q-8 -301 -3 -297M2 -300Q8 -303 13 -298M-20 -276Q-17 -281 -13 -279M-16 -262Q-13 -266 -9 -263M14 -294Q18 -296 21 -292" stroke="#3a2b21" stroke-width="1.3" fill="none" stroke-linecap="round"/>' +
  '<path d="M-14 -300Q-6 -305 2 -302" stroke="#eef3f9" stroke-width="2" stroke-linecap="round" opacity=".7"/>' +
  // breath in the cold
  [0, 1].map(i => `<circle cx="28" cy="-262" r="4" class="breath" style="${phase(nowS, 4.5, i * 2.2)}"/>`).join('') +
  '</g>'

/** A great white wolf with red eyes, sitting at the swordsman's side. Every so often he lifts his head and howls at the moon. */
const WOLF = (nowS: number): string =>
  '<ellipse cx="226" cy="960" rx="98" ry="8" fill="#8c9bb4" opacity=".55"/>' +
  '<g class="breathe">' +
  // back and body, with a shaggy ridge of fur along the spine
  '<path d="M150 956Q142 906 168 880Q196 858 228 842Q250 828 266 812L304 806Q311 840 301 872Q293 900 289 940L289 956Z" fill="url(#fur)" stroke="#8e9aa8" stroke-width="1.3" stroke-linejoin="round"/>' +
  '<path d="M158 894Q152 890 151 884M166 882Q160 877 160 871M178 871Q173 865 174 859M192 862Q188 856 190 850M206 853Q203 847 206 841M220 846Q218 840 221 834M234 838Q233 832 237 827M248 830Q248 824 252 820" stroke="#8e9aa8" stroke-width="1.3" fill="none" stroke-linecap="round"/>' +
  '<path d="M176 872Q186 866 194 870M204 858Q214 852 222 858M234 846Q242 840 250 846M256 832Q262 826 268 830M186 890Q196 884 204 890M214 874Q224 868 232 874" stroke="#b8c2cd" stroke-width="1.5" fill="none" stroke-linecap="round"/>' +
  // far foreleg, in shade
  '<path d="M246 862L244 949Q244 957 252 957L263 957L260 866Z" fill="#b3bdc8" stroke="#8e9aa8" stroke-width="1"/>' +
  // haunch and hind paw
  '<path d="M158 932Q154 884 196 878Q236 880 240 918Q240 946 214 952Q178 958 158 932Z" fill="#f1f4f7" stroke="#8e9aa8" stroke-width="1.2"/>' +
  '<path d="M172 912Q184 902 198 906M180 930Q192 920 206 926M206 896Q218 892 226 902M166 922Q170 914 176 916" stroke="#b8c2cd" stroke-width="1.4" fill="none" stroke-linecap="round"/>' +
  '<path d="M206 958Q206 944 227 944Q246 944 250 958Z" fill="#eef1f4" stroke="#8e9aa8" stroke-width="1.1"/>' +
  // near foreleg, shaggy at the elbow
  '<path d="M266 862Q271 900 268 947Q268 957 279 957L294 957Q294 950 287 946L286 870Z" fill="url(#fur)" stroke="#8e9aa8" stroke-width="1.2"/>' +
  '<path d="M268 880L262 888L270 890L264 898L272 898" stroke="#aeb9c5" stroke-width="1.1" fill="none"/>' +
  '<path d="M277 957V951M283 957V951M252 957V951M257 957V951M222 958V952M230 958V952" stroke="#8e9aa8" stroke-width="1"/>' +
  // the thick ruff of the chest
  '<path d="M284 790L298 800L290 808L304 816L294 824L306 834L294 842L304 854L292 858L298 870L286 872Q278 836 280 796Z" fill="#f7f9fb" stroke="#aeb9c5" stroke-width="1.1" stroke-linejoin="round"/>' +
  // neck and head: they lift together for the howl
  `<g class="howl" style="${phase(nowS, 26)}">` +
  '<path d="M258 830Q258 792 276 768L314 776Q313 802 303 822Z" fill="url(#fur)" stroke="#8e9aa8" stroke-width="1.2"/>' +
  '<path d="M262 804L256 810L264 812L258 820M270 790L264 796L272 798" stroke="#aeb9c5" stroke-width="1.1" fill="none"/>' +
  '<path d="M280 755L283 726L295 748Z" fill="#dce2e8" stroke="#8e9aa8" stroke-width="1.1" stroke-linejoin="round"/>' +
  // the open jaw, shown only while he howls
  `<g class="hjaw" style="${phase(nowS, 26)}"><path d="M318 786L340 782L330 798Q320 800 312 794Z" fill="#3a2a2e"/>` +
  '<path d="M314 794Q324 802 334 797L328 806Q316 806 310 798Z" fill="#eef1f4" stroke="#8e9aa8" stroke-width="1.1"/></g>' +
  '<path d="M276 770Q276 748 292 744Q306 742 316 754L338 775Q344 781 339 786L322 790Q308 796 292 790Q278 784 276 770Z" fill="#f6f8fa" stroke="#8e9aa8" stroke-width="1.2" stroke-linejoin="round"/>' +
  '<path d="M290 751L299 723L307 750Z" fill="#f2f5f8" stroke="#8e9aa8" stroke-width="1.1" stroke-linejoin="round"/>' +
  '<path d="M294 747L299 731L303 747Z" fill="#c9aeb0"/>' +
  '<path d="M280 778L275 790L284 790L280 801L290 796" stroke="#aeb9c5" stroke-width="1.2" fill="none" stroke-linejoin="round"/>' +
  '<path d="M302 761Q308 757 314 761" stroke="#8e9aa8" stroke-width="1.3" fill="none"/>' +
  '<ellipse cx="308" cy="764.5" rx="3" ry="1.8" fill="#b3262d"/><circle cx="308.6" cy="764" r=".7" fill="#ffd4d4"/>' +
  '<path d="M315 759Q325 765 333 773M318 768Q326 772 332 778" stroke="#c9d1da" stroke-width="1.2" fill="none"/>' +
  '<ellipse cx="339.5" cy="781" rx="3.2" ry="2.4" fill="#2a2d33"/>' +
  '<path d="M322 788L336 785" stroke="#8e9aa8" stroke-width="1.2"/>' +
  [0, 1].map(i => `<circle cx="343" cy="782" r="3.5" class="breath" style="${phase(nowS, 4.5, 1.1 + i * 2.2)}"/>`).join('') +
  '</g></g>' +
  // tail curled round the front of the haunch
  '<g class="wtail"><path d="M152 948Q172 962 222 958Q248 956 256 944Q240 950 220 948Q186 944 164 930Z" fill="url(#fur)" stroke="#8e9aa8" stroke-width="1.2"/>' +
  '<path d="M178 950Q196 954 214 952M166 940Q174 946 186 946" stroke="#b8c2cd" stroke-width="1.3" fill="none"/></g>'

/** A shard of ice rising from the ice king's circlet. */
const shard = (x: number, h: number): string => {
  const base = n(-284 - 8 * (1 - (x / 23) ** 2))
  const lean = n(x * 0.25)

  return `M${n(x - 2.6)} ${base}L${n(x + lean)} ${n(base - h)}L${n(x + 2.6)} ${base}Z`
}

/** The ice king's breastplate: rows of overlapping scales. */
const SCALES = (() => {
  let d = ''

  for (let row = 0; row < 8; row++) {
    for (let x = -34; x <= 26; x += 10) {
      d += `M${x + (row % 2) * 5} ${-206 + row * 10}q5 6 10 0`
    }
  }

  return d
})()

/**
 * The ice king, drawn round his feet, facing you. Every two minutes he comes out of the storm
 * before the castle, walks up close, stares with burning blue eyes, then fades back into the snow.
 */
const ICE_KING = (nowS: number): string =>
  `<g class="iceKing" style="${phase(nowS, 120)}"><g class="iceSway">` +
  '<ellipse cx="0" cy="-180" rx="125" ry="175" fill="url(#iceAura)"/>' +
  // tattered cape behind him
  '<path d="M-58 -214Q-80 -150 -96 -8L-86 -14L-80 -2L-70 -12L-62 0L-52 -10L52 -10L62 0L70 -12L80 -2L86 -14L96 -8Q80 -150 58 -214Z" fill="#121820"/>' +
  '<path d="M-62 -180Q-74 -110 -84 -20M62 -180Q74 -110 84 -20" stroke="#26303c" stroke-width="2" fill="none"/>' +
  // legs in dark plate
  '<path d="M-30 -112L-34 -6L-12 -6L-8 -112ZM8 -112L12 -6L34 -6L30 -112Z" fill="#1a2029"/>' +
  '<path d="M-33 -66H-10V-57H-33ZM10 -66H33V-57H10Z" fill="#2b3440"/><path d="M-38 -6H-10V0H-38ZM10 -6H38V0H10Z" fill="#10151c"/>' +
  // the ice sword, point down in his right hand
  '<path d="M-63 -98L-53 -98L-56 -20L-60 -4L-62 -20Z" fill="url(#iceBlade)" stroke="#cfeaff" stroke-width=".8"/>' +
  '<path d="M-58 -96V-18" stroke="#ffffff" stroke-width="1" opacity=".7"/>' +
  '<path d="M-70 -100H-46" stroke="#9ec7e6" stroke-width="3" stroke-linecap="round"/>' +
  // armoured skirt, breastplate and belt
  '<path d="M-36 -124L36 -124L42 -84L28 -90L20 -80L10 -90L0 -80L-10 -90L-20 -80L-28 -90L-42 -84Z" fill="#1e252f" stroke="#3a4655" stroke-width="1"/>' +
  '<path d="M-38 -214Q-44 -170 -36 -124L36 -124Q44 -170 38 -214Q0 -224 -38 -214Z" fill="url(#armor)"/>' +
  `<path d="${SCALES}" stroke="#3d4a5a" stroke-width="1.1" fill="none" opacity=".75"/>` +
  '<path d="M0 -220V-126" stroke="#3d4a5a" stroke-width="1.5"/><path d="M-37 -128H37" stroke="#0e1318" stroke-width="5"/>' +
  // arms, bracers and clawed ice-blue hands
  '<path d="M-52 -208Q-66 -170 -64 -116L-50 -116Q-50 -168 -38 -200ZM52 -208Q66 -170 64 -116L50 -116Q50 -168 38 -200Z" fill="#1a2029" stroke="#3a4655" stroke-width=".8"/>' +
  '<path d="M-66 -132H-49V-122H-66ZM49 -132H66V-122H49Z" fill="#2b3440"/>' +
  '<path d="M-66 -122Q-70 -108 -64 -98L-62 -92L-60 -100L-57 -91L-55 -100L-52 -94L-51 -104Q-48 -114 -50 -122Z' +
  'M66 -122Q70 -108 64 -98L62 -92L60 -100L57 -91L55 -100L52 -94L51 -104Q48 -114 50 -122Z" fill="#9fbcd6" stroke="#6f8fae" stroke-width=".8"/>' +
  // pauldrons rimed with frost
  '<path d="M-60 -200Q-66 -222 -44 -228Q-30 -226 -26 -214Q-40 -206 -60 -200ZM60 -200Q66 -222 44 -228Q30 -226 26 -214Q40 -206 60 -200Z" fill="#232b36" stroke="#46546a" stroke-width="1"/>' +
  '<path d="M-62 -190Q-60 -204 -46 -206L-40 -198Q-52 -196 -62 -190ZM62 -190Q60 -204 46 -206L40 -198Q52 -196 62 -190Z" fill="#2b3440" stroke="#46546a" stroke-width=".8"/>' +
  '<path d="M-60 -203Q-62 -220 -44 -226M60 -203Q62 -220 44 -226" stroke="#cfe8f7" stroke-width="1.5" fill="none" opacity=".6"/>' +
  // neck, and the long pale skull
  '<path d="M-9 -232L-8 -212L8 -212L9 -232Z" fill="#7d9cbb"/><path d="M-4 -230L-3 -214M4 -230L3 -214" stroke="#5a7898" stroke-width="1.2"/>' +
  '<path d="M0 -302Q22 -300 24 -276Q25 -264 20 -256Q18 -242 10 -234Q4 -228 0 -228Q-4 -228 -10 -234Q-18 -242 -20 -256Q-25 -264 -24 -276Q-22 -300 0 -302Z" fill="url(#iceSkin)"/>' +
  '<path d="M-14 -296Q-10 -286 -12 -276M14 -296Q10 -286 12 -276M0 -302V-284M-21 -280Q-17 -274 -19 -268M21 -280Q17 -274 19 -268" stroke="#7393b2" stroke-width="1.2" fill="none" opacity=".75"/>' +
  // brow, sunken sockets and burning eyes
  '<path d="M-18 -268Q-10 -274 -3 -268M3 -268Q10 -274 18 -268" stroke="#4e6c8b" stroke-width="2.4" fill="none" stroke-linecap="round"/>' +
  '<path d="M-16 -264Q-10 -270 -4 -264Q-10 -259 -16 -264ZM4 -264Q10 -270 16 -264Q10 -259 4 -264Z" fill="#24384f"/>' +
  '<g class="iceEyes"><circle cx="-10" cy="-264" r="10" fill="url(#eyeGlow)"/><circle cx="10" cy="-264" r="10" fill="url(#eyeGlow)"/>' +
  '<ellipse cx="-10" cy="-264" rx="3.8" ry="2.1" fill="#7feaff"/><ellipse cx="10" cy="-264" rx="3.8" ry="2.1" fill="#7feaff"/>' +
  '<circle cx="-10" cy="-264" r="1.1" fill="#ffffff"/><circle cx="10" cy="-264" r="1.1" fill="#ffffff"/></g>' +
  // nose, hollow cheeks and a thin hard mouth
  '<path d="M0 -262Q-1 -254 -2 -248M-3 -248Q0 -246 3 -248M-17 -254Q-12 -246 -11 -238M17 -254Q12 -246 11 -238" stroke="#5a7a9a" stroke-width="1.4" fill="none" stroke-linecap="round"/>' +
  '<path d="M-6 -239Q0 -241 6 -239" stroke="#2f4560" stroke-width="1.8" fill="none" stroke-linecap="round"/>' +
  // a crown of ice shards on a frosted circlet
  '<path d="M-23 -284Q0 -293 23 -284" stroke="#a8cbe6" stroke-width="3" fill="none"/>' +
  `<path d="${[[-20, 14], [-13, 22], [-6, 28], [0, 34], [6, 28], [13, 22], [20, 14]].map(([x, h]) => shard(x ?? 0, h ?? 0)).join('')}" fill="#dff3ff" stroke="#8fb8d8" stroke-width=".8" stroke-linejoin="round"/>` +
  // breath like frost, and a glitter of ice about him
  [0, 1].map(i => `<circle cx="0" cy="-238" r="3.5" class="ibreath" style="${phase(nowS, 5, i * 2.5)}"/>`).join('') +
  '<g fill="#dff6ff">' +
  [[-90, -250], [84, -230], [-70, -120], [96, -140], [-40, -300], [50, -310]]
    .map(([x, y], i) => `<path class="tw" style="animation-duration:${3 + i}s" d="M${x} ${(y ?? 0) - 4}L${(x ?? 0) + 1} ${(y ?? 0) - 1}L${(x ?? 0) + 4} ${y}L${(x ?? 0) + 1} ${(y ?? 0) + 1}L${x} ${(y ?? 0) + 4}L${(x ?? 0) - 1} ${(y ?? 0) + 1}L${(x ?? 0) - 4} ${y}L${(x ?? 0) - 1} ${(y ?? 0) - 1}Z"/>`)
    .join('') +
  '</g></g></g>'

const RAVEN =
  '<g class="bob">' +
  '<path d="M152 168L150 182M164 168L166 182M145 182H156M160 182H171" stroke="#2a2d34" stroke-width="2.2" stroke-linecap="round"/>' +
  '<g class="tail"><path d="M128 156L92 172L98 164L90 162L126 148Z" fill="#0b0d12"/></g>' +
  '<path d="M126 150Q132 130 158 130Q182 132 186 146Q186 166 164 170Q140 172 126 150Z" fill="#12151c" stroke="#56647e" stroke-width="1.2"/>' +
  '<path d="M136 142Q150 132 172 136Q160 142 140 150Z" fill="#2c3a55" opacity=".7"/>' +
  '<path d="M132 148Q146 136 170 146Q166 162 140 162Z" fill="#0c0e13"/>' +
  '<path d="M140 154L158 150M142 158L162 155" stroke="#262c39" stroke-width="1.3"/>' +
  '<g class="head">' +
  '<path d="M170 136L176 147L180 138L184 149L189 136Z" fill="#12151c"/>' +
  '<circle cx="180" cy="128" r="14" fill="#12151c" stroke="#56647e" stroke-width="1.2"/>' +
  '<path d="M170 122Q178 114 188 118Q180 120 174 128Z" fill="#2c3a55" opacity=".6"/>' +
  '<g class="caw"><path d="M191 133Q203 133 211 134Q202 138 192 137Z" fill="#171a21"/></g>' +
  '<path d="M190 122Q208 124 214 132Q202 130 191 133Z" fill="#1d2028"/>' +
  '<circle cx="184" cy="124" r="2.4" fill="#05060a"/><circle cx="184.8" cy="123.2" r=".8" fill="#dfe6f0"/>' +
  '</g></g>'

/** The cache as the hourglass and the minutes show it. */
type CacheView = { known: boolean; startMin: number; firstStepS: number; remainingS: number; frac: number }

const cacheView = ({ at, ttl }: TheNorthCache, now: number): CacheView => {
  if (at === 0 || ttl === 0) {
    return { known: false, startMin: 0, firstStepS: 0, remainingS: 0, frac: 1 }
  }
  const ttlMs = ttl * 60_000
  const remaining = Math.max(0, at + ttlMs - now)
  const startMin = Math.ceil(remaining / 60_000)

  return {
    known: true,
    startMin,
    firstStepS: (remaining - (startMin - 1) * 60_000) / 1000,
    remainingS: remaining / 1000,
    frac: remaining / ttlMs,
  }
}

const SNOW_CAP = (x0: number, x1: number, y: number): string => {
  const w = x1 - x0

  return (
    `<path d="M${x0 - 4} ${y + 3}Q${x0 - 4} ${y - 9} ${n(x0 + w * 0.2)} ${y - 7}Q${n(x0 + w * 0.5)} ${y - 12} ${n(x0 + w * 0.8)} ${y - 7}Q${x1 + 4} ${y - 9} ${x1 + 4} ${y + 3}` +
    `Q${n(x0 + w * 0.86)} ${y + 2} ${n(x0 + w * 0.8)} ${y + 8}Q${n(x0 + w * 0.74)} ${y + 2} ${n(x0 + w * 0.55)} ${y + 4}Q${n(x0 + w * 0.3)} ${y + 1} ${n(x0 + w * 0.22)} ${y + 6}Q${n(x0 + w * 0.14)} ${y + 1} ${x0 - 4} ${y + 3}Z" fill="#eef3f9"/>`
  )
}

/** Dark weathered planks bound with iron. */
const board = (x: number, y: number, w: number, h: number): string =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="5" fill="url(#darkWood)" stroke="#1e150d" stroke-width="3"/>` +
  `<path d="M${x + 4} ${y + h * 0.5}H${x + w - 4}" stroke="#2a1d13" stroke-width="1.5" opacity=".6"/>` +
  `<rect x="${x + 12}" y="${y + 2}" width="8" height="${h - 4}" fill="#3a3f47"/><rect x="${x + w - 20}" y="${y + 2}" width="8" height="${h - 4}" fill="#3a3f47"/>` +
  `<circle cx="${x + 16}" cy="${y + 10}" r="1.8" fill="#9aa1ab"/><circle cx="${x + 16}" cy="${y + h - 10}" r="1.8" fill="#9aa1ab"/>` +
  `<circle cx="${x + w - 16}" cy="${y + 10}" r="1.8" fill="#9aa1ab"/><circle cx="${x + w - 16}" cy="${y + h - 10}" r="1.8" fill="#9aa1ab"/>` +
  SNOW_CAP(x, x + w, y)

const chain = (x: number, y0: number, y1: number): string =>
  `<path d="M${x} ${y0}V${y1}" stroke="#5d626a" stroke-width="4" stroke-dasharray="7 3"/>` +
  `<path d="M${x} ${y0 + 5}V${y1}" stroke="#a3a9b2" stroke-width="1.3" stroke-dasharray="3 7"/>`

const signs = (percent: number, view: CacheView, nowS: number): string => {
  const start = view.known ? view.frac : 1
  const running = view.known && view.remainingS > 0
  const timed = (name: string, from: string, to: string): string =>
    running
      ? `<style>@keyframes ${name}{from{transform:${from}}to{transform:${to}}}.${name}{animation:${name} ${n(view.remainingS)}s linear both}</style>`
      : ''

  // minutes: a column of numbers stepping up one row a minute
  const row = 26
  let minutes: string

  if (!view.known || view.startMin === 0) {
    minutes = `<text x="182" y="307" class="tx" font-size="22" text-anchor="middle">${view.known ? '0m' : '—'}</text>`
  } else {
    let column = ''

    for (let i = 0; i <= view.startMin; i++) {
      column += `<text x="182" y="${307 + i * row}" class="tx" font-size="22" text-anchor="middle">${view.startMin - i}m</text>`
    }
    minutes =
      `<style>@keyframes mins{from{transform:translate(0px,0px)}to{transform:translate(0px,-${view.startMin * row}px)}}` +
      `.mins{animation:mins ${view.startMin * 60}s steps(${view.startMin},end) both;animation-delay:-${n(60 - view.firstStepS)}s}</style>` +
      `<g clip-path="url(#minsClip)"><g class="mins">${column}</g></g>`
  }

  return (
    `<g class="swing" style="${phase(nowS, 8)}"><g transform="translate(-40 0) scale(1.25)">` +
    chain(110, 0, 184) +
    chain(210, 0, 184) +
    board(70, 180, 180, 84) +
    `<text x="161.5" y="235.5" class="tx ts" font-size="40" text-anchor="middle">${percent}%</text>` +
    `<text x="160" y="233" class="tx" font-size="40" text-anchor="middle">${percent}%</text>` +
    '<text x="160" y="254" class="tx" font-size="11" text-anchor="middle" fill-opacity=".85" letter-spacing="3">CONTEXT</text>' +
    RAVEN +
    chain(126, 264, 284) +
    chain(194, 264, 284) +
    board(100, 280, 122, 54) +
    // hourglass: the top drains and the bottom fills as the cache runs out
    timed('drain', `scaleY(${n(start)})`, 'scaleY(0)') +
    timed('fillup', `scaleY(${n(1 - start)})`, 'scaleY(1)') +
    '<rect x="109" y="285" width="30" height="4" rx="1.5" fill="#2a1d13"/><rect x="109" y="325" width="30" height="4" rx="1.5" fill="#2a1d13"/>' +
    '<path d="M111 289V325M137 289V325" stroke="#2a1d13" stroke-width="2"/>' +
    `<g clip-path="url(#hgTop)"><rect x="114" y="292" width="20" height="15" fill="#d8b46a" class="drain" style="transform-origin:124px 307px;transform:scaleY(${n(start)})"/></g>` +
    `<g clip-path="url(#hgBot)"><rect x="114" y="309" width="20" height="15" fill="#d8b46a" class="fillup" style="transform-origin:124px 324px;transform:scaleY(${n(1 - start)})"/></g>` +
    (running ? '<path d="M124 307V323" stroke="#d8b46a" stroke-width="1" class="trickle"/>' : '') +
    '<path d="M115 290C115 300 122 304 124 307C126 304 133 300 133 290ZM115 324C115 314 122 310 124 307C126 310 133 314 133 324Z" fill="#cfe0f0" fill-opacity=".1" stroke="#cfe0f0" stroke-opacity=".75" stroke-width="1.2"/>' +
    minutes +
    '<text x="182" y="326" class="tx" font-size="9" text-anchor="middle" fill-opacity=".85" letter-spacing="2.5">CACHE</text>' +
    '</g></g>'
  )
}

const LEFT_GROUND =
  '<path d="M0 1000V890C70 868 150 878 236 892C320 906 380 904 430 932C460 950 474 976 480 1000Z" fill="url(#drift)"/>' +
  '<path d="M0 934C90 922 170 934 260 948C320 958 370 962 410 974" stroke="#b2c0d6" stroke-width="2" fill="none" opacity=".6"/>'

const left = (percent: number, view: CacheView, nowS: number): string =>
  '<svg width="100%" height="100%" viewBox="0 0 480 1000" preserveAspectRatio="xMinYMax meet">' +
  '<defs><clipPath id="minsClip"><rect x="146" y="286" width="72" height="26"/></clipPath>' +
  '<clipPath id="hgTop"><path d="M115 290C115 300 122 304 124 307C126 304 133 300 133 290Z"/></clipPath>' +
  '<clipPath id="hgBot"><path d="M115 324C115 314 122 310 124 307C126 310 133 314 133 324Z"/></clipPath></defs>' +
  pine(470, 905, 230, '#111a2a', '#aab8cf') +
  pine(415, 915, 150, '#152036', '#b8c5da') +
  LEFT_GROUND +
  HEART_TREE +
  LEAVES(nowS) +
  SWORDSMAN(nowS) +
  WOLF(nowS) +
  signs(percent, view, nowS) +
  '</svg>'

// ---------------------------------------------------------------- right: the moon and the castle (480 by 1000, pinned bottom right)

/** A grey wolf running: our own drawing of the old northern blazon, a grey wolf on an ice-white field. */
const WOLF_CHARGE =
  'M0 18Q5 9 14 11Q26 6 40 8L45 5L46 -2L49 4L53 3L60 7L59 10L52 12L47 16L46 20L55 26L57 29L53 29L43 23L40 25L39 33L36 33L37 24' +
  'L28 23L22 24L20 32L17 32L17 25L13 26L6 30L5 27L12 22Q9 18 14 17Q7 16 0 18Z'

/** An ice-white banner with a swallowtail, the grey wolf running across it. */
const banner = (x: number, y: number, w: number, h: number): string => {
  const s = Math.round(((w - 6) / 60) * 1000) / 1000

  return (
    `<g class="banner"><path d="M${x} ${y}H${x + w}V${y + h}L${n(x + w / 2)} ${n(y + h - w * 0.45)}L${x} ${y + h}Z" fill="#e7ecf1" stroke="#59616c" stroke-width="1.6"/>` +
    `<path d="M${x} ${y + 6}H${x + w}" stroke="#59616c" stroke-width="2.5"/>` +
    `<path transform="translate(${n(x + w - 3)} ${n(y + h * 0.32)}) scale(${-s} ${s})" d="${WOLF_CHARGE}" fill="#6b7480"/>` +
    `</g><rect x="${x - 3}" y="${y - 3}" width="${w + 6}" height="4" rx="2" fill="#5d626a"/>`
  )
}

const merlons = (x0: number, x1: number, y: number): string => {
  let stone = ''
  let snow = ''

  for (let x = x0; x + 12 <= x1; x += 20) {
    stone += `M${x} ${y}h12v14h-12Z`
    snow += `M${x - 1} ${y + 1}q7 -6 14 0v2h-14Z`
  }

  return `<path d="${stone}" fill="url(#stoneLit)"/><path d="${snow}" fill="#eef3f9"/>`
}

/** Stone filled with its shade and coursed with joints. */
const masonry = (d: string, shade = 'stoneLit'): string => `<path d="${d}" fill="url(#${shade})"/><path d="${d}" fill="url(#joints)"/>`

const slit = (x: number, y: number, h = 20): string => `<rect x="${x - 3}" y="${y}" width="6" height="${h}" rx="3" fill="url(#warm)"/>`

const torch = (x: number, y: number, delay: number): string =>
  `<path d="M${x} ${y + 18}L${x} ${y + 6}M${x - 6} ${y + 18}H${x + 6}" stroke="#2a2420" stroke-width="3"/>` +
  `<g class="flicker" style="animation-delay:-${delay}s"><circle cx="${x}" cy="${y}" r="44" fill="url(#torchGlow)"/></g>` +
  `<g class="flame"><path d="M${x} ${y - 14}Q${x + 7} ${y - 2} ${x} ${y + 6}Q${x - 7} ${y - 2} ${x} ${y - 14}Z" fill="#ffb347"/>` +
  `<path d="M${x} ${y - 7}Q${x + 3} ${y} ${x} ${y + 4}Q${x - 3} ${y} ${x} ${y - 7}Z" fill="#fff1c4"/></g>`

const CASTLE = (nowS: number): string =>
  '<defs><clipPath id="gateClip"><path d="M236 944V892Q257 866 278 892V944Z"/></clipPath></defs>' +
  // round tower, behind the wall
  masonry('M372 562H448V842H372Z', 'tower') +
  '<path d="M364 563L415 468L456 563Z" fill="#262b33"/>' +
  '<path d="M415 468L436 520L428 522L441 549L415 503L398 541L404 522L394 524Z" fill="#e8eef6" opacity=".9"/>' +
  '<ellipse cx="410" cy="563" rx="48" ry="5" fill="#eef3f9"/>' +
  slit(410, 600, 22) + slit(410, 672, 22) + slit(410, 744, 22) +
  '<path d="M415 468V420" stroke="#2a2f37" stroke-width="2"/>' +
  '<g class="pennant"><path d="M415 422L452 430L415 440Z" fill="#e7ecf1"/><path d="M415 429L440 431" stroke="#59616c" stroke-width="1.8"/></g>' +
  // square tower
  masonry('M56 600H136V842H56Z') +
  merlons(52, 140, 588) +
  slit(96, 636) + slit(96, 700) + slit(96, 770) +
  '<path d="M96 588V542" stroke="#2a2f37" stroke-width="2"/>' +
  '<g class="pennant" style="animation-delay:-.7s"><path d="M96 544L130 552L96 561Z" fill="#e7ecf1"/><path d="M96 551L120 553" stroke="#59616c" stroke-width="1.8"/></g>' +
  // the great hall, its chimney and snowbound roof
  `<g fill="#c3ccd8">${[0, 1, 2, 3].map(i => `<circle cx="326" cy="640" r="10" class="puff" style="${phase(nowS, 11, i * 2.75)}"/>`).join('')}</g>` +
  masonry('M318 646H334V700H318Z') +
  '<path d="M315 648Q326 638 337 648Z" fill="#eef3f9"/>' +
  masonry('M148 700H364V842H148Z', 'stoneDark') +
  '<path d="M140 703L256 622L372 703Z" fill="#2a2f37"/>' +
  '<path d="M140 703L256 616L372 703L360 706Q330 692 300 702Q270 690 240 700Q210 692 180 702Q160 696 150 706Z" fill="url(#snowRoof)"/>' +
  '<g class="hearth"><circle cx="256" cy="748" r="120" fill="url(#hallGlow)"/></g>' +
  [170, 204, 290, 324]
    .map(x => `<path d="M${x} 768V734Q${x + 9} 718 ${x + 18} 734V768Z" fill="url(#warm)" stroke="#2a2f37" stroke-width="2.5"/><path d="M${x + 9} 724V768M${x} 748H${x + 18}" stroke="#2a2f37" stroke-width="1.6"/>`)
    .join('') +
  banner(224, 710, 30, 90) +
  banner(260, 710, 30, 90) +
  // curtain wall and gatehouse
  // steam from the hot springs, rising behind the walls
  `<g fill="#dfe7f0">${[0, 1, 2, 3, 4, 5].map(i => `<circle cx="${[60, 160, 200, 330, 360, 450][i]}" cy="836" r="16" class="steam" style="${phase(nowS, 16, i * 2.7)}"/>`).join('')}</g>` +
  masonry('M18 840H478V946H18Z') +
  merlons(16, 196, 826) +
  merlons(320, 482, 826) +
  '<rect x="18" y="838" width="460" height="3" fill="#eef3f9" opacity=".8"/>' +
  masonry('M196 792H236V946H196ZM278 792H318V946H278Z') +
  merlons(194, 238, 778) +
  merlons(276, 320, 778) +
  '<path d="M236 944V892Q257 866 278 892V944Z" fill="url(#gateLight)"/>' +
  '<g clip-path="url(#gateClip)"><path d="M241 870V914M248 870V914M255 870V914M262 870V914M269 870V914M276 870V914M236 878H278M236 888H278M236 898H278M236 908H278" stroke="#2a221c" stroke-width="2.2"/></g>' +
  '<path d="M236 944V892Q257 866 278 892V944" stroke="#2b3038" stroke-width="4" fill="none"/>' +
  banner(96, 846, 40, 86) +
  banner(378, 846, 40, 86) +
  torch(222, 860, 0.4) +
  torch(292, 860, 1.9) +
  '<ellipse cx="257" cy="954" rx="120" ry="14" fill="#ffc773" opacity=".2"/>'

const MOON =
  '<circle cx="330" cy="140" r="150" fill="url(#moonHalo)"/>' +
  '<circle cx="330" cy="140" r="40" fill="#eef1f2"/>' +
  '<circle cx="317" cy="129" r="8" fill="#d8dde2" opacity=".7"/><circle cx="342" cy="153" r="6" fill="#d8dde2" opacity=".6"/>' +
  '<circle cx="345" cy="124" r="4" fill="#d8dde2" opacity=".6"/>' +
  '<g class="veil"><ellipse cx="300" cy="150" rx="120" ry="9" fill="#2a3346" opacity=".7"/><ellipse cx="380" cy="126" rx="90" ry="6" fill="#2a3346" opacity=".55"/></g>'

const RIGHT_GROUND =
  '<path d="M0 1000C8 978 30 958 70 950C150 938 200 944 260 950C350 958 420 940 480 930V1000Z" fill="url(#drift)"/>' +
  '<path d="M60 990C140 974 230 982 330 984C400 986 450 976 480 970" stroke="#b2c0d6" stroke-width="2" fill="none" opacity=".6"/>'

const right = (nowS: number): string =>
  '<svg class="rs" width="100%" height="100%" viewBox="0 0 480 1000" preserveAspectRatio="xMaxYMax meet">' +
  MOON +
  pine(24, 930, 250, '#111a2a', '#aab8cf') +
  pine(470, 940, 210, '#111a2a', '#aab8cf') +
  CASTLE(nowS) +
  RIGHT_GROUND +
  ICE_KING(nowS) +
  '</svg>'

// ---------------------------------------------------------------- the storm (1600 by 1000, tilted by the wind)

/** One depth of snow: flakes laid twice, a screen apart, so sliding down one screen loops cleanly. */
const snowLayer = (seed: number, count: number, r0: number, r1: number, fall: number, fillColor: string, opacity: number, nowS: number): string => {
  const rand = random(seed)
  let out = ''

  for (let i = 0; i < count; i++) {
    // whole numbers keep a heavy storm inside the scene's size limit
    const x = Math.round(rand() * 1600)
    const y = Math.round(rand() * 1000)
    const r = n(r0 + rand() * (r1 - r0))
    out += `<circle cx="${x}" cy="${y}" r="${r}"/><circle cx="${x}" cy="${y - 1000}" r="${r}"/>`
  }

  return (
    `<g class="sway" style="${phase(nowS, 6, seed)}">` +
    `<g class="fall" style="animation-duration:${n(fall)}s;${phase(nowS, fall, seed)}" fill="${fillColor}" opacity="${opacity}">${out}</g></g>`
  )
}

const storm = (k: number, nowS: number): string =>
  '<svg width="100%" height="100%" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice">' +
  '<g transform="translate(800 500) rotate(16) scale(1.4) translate(-800 -500)">' +
  snowLayer(41, Math.round(60 + 70 * k), 0.8, 1.6, 64 - 22 * k, '#ffffff', 0.55, nowS) +
  snowLayer(43, Math.round(34 + 44 * k), 1.6, 2.6, 40 - 14 * k, '#ffffff', 0.75, nowS) +
  snowLayer(47, Math.round(12 + 22 * k), 3.2, 5.2, 24 - 8 * k, 'url(#flake)', 0.9, nowS) +
  '</g>' +
  `<rect width="1600" height="1000" fill="#c9d3e0" opacity="${n(0.08 * k)}"/>` +
  '</svg>'

// ---------------------------------------------------------------- shared style and paint

const glow = (id: string, color: string, a: number): string =>
  `<radialGradient id="${id}"><stop offset="0" stop-color="${color}" stop-opacity="${a}"/><stop offset=".4" stop-color="${color}" stop-opacity="${n(a * 0.3)}"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient>`

const DEFS =
  '<defs>' +
  '<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#06080e"/><stop offset=".35" stop-color="#0f1522"/><stop offset=".55" stop-color="#1a2232"/><stop offset="1" stop-color="#2a3446"/></linearGradient>' +
  '<linearGradient id="au" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#6fe3c8" stop-opacity="0"/><stop offset=".4" stop-color="#6fe3c8"/><stop offset=".7" stop-color="#7fb4ff"/><stop offset="1" stop-color="#6fe3c8" stop-opacity="0"/></linearGradient>' +
  '<linearGradient id="wall" gradientUnits="userSpaceOnUse" x1="0" y1="500" x2="0" y2="840"><stop offset="0" stop-color="#8ea2bb"/><stop offset=".18" stop-color="#687e9b"/><stop offset=".55" stop-color="#44577a"/><stop offset="1" stop-color="#2a384f"/></linearGradient>' +
  '<linearGradient id="wallGlow" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#bfe3ff" stop-opacity=".22"/><stop offset="1" stop-color="#bfe3ff" stop-opacity="0"/></linearGradient>' +
  '<linearGradient id="field" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c6d1e2"/><stop offset=".25" stop-color="#dfe6f1"/><stop offset="1" stop-color="#eef2f8"/></linearGradient>' +
  '<linearGradient id="drift" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f1f4f9"/><stop offset="1" stop-color="#cdd6e4"/></linearGradient>' +
  '<linearGradient id="darkWood" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5e4736"/><stop offset="1" stop-color="#3b2c21"/></linearGradient>' +
  '<linearGradient id="bark" gradientUnits="userSpaceOnUse" x1="40" y1="0" x2="150" y2="0"><stop offset="0" stop-color="#b3ab9f"/><stop offset=".45" stop-color="#e9e4dc"/><stop offset="1" stop-color="#fbf8f2"/></linearGradient>' +
  '<linearGradient id="cloak" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#0b0c10"/><stop offset=".7" stop-color="#1c1f26"/><stop offset="1" stop-color="#2a2e37"/></linearGradient>' +
  '<linearGradient id="fur" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f6f8fa"/><stop offset="1" stop-color="#cfd6de"/></linearGradient>' +
  '<linearGradient id="stoneLit" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6b727d"/><stop offset="1" stop-color="#454b55"/></linearGradient>' +
  '<linearGradient id="stoneDark" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4f5560"/><stop offset="1" stop-color="#343941"/></linearGradient>' +
  '<linearGradient id="tower" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#3a4048"/><stop offset=".6" stop-color="#6c737e"/><stop offset="1" stop-color="#444a53"/></linearGradient>' +
  '<linearGradient id="snowRoof" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f4f7fb"/><stop offset="1" stop-color="#c9d4e2"/></linearGradient>' +
  '<linearGradient id="warm" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe2a0"/><stop offset="1" stop-color="#f0a24c"/></linearGradient>' +
  '<linearGradient id="gateLight" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd58a"/><stop offset="1" stop-color="#d97b34"/></linearGradient>' +
  '<pattern id="joints" width="32" height="16" patternUnits="userSpaceOnUse"><path d="M0 .5H32M0 8.5H32M8 .5V8.5M24 8.5V16" stroke="#262a31" stroke-width="1" fill="none" opacity=".6"/></pattern>' +
  // a scatter of small hand-shaped leaves, darker and lighter, to texture the crown
  '<pattern id="leafTex" width="36" height="30" patternUnits="userSpaceOnUse">' +
  '<path transform="translate(8 8) rotate(-20) scale(.6)" d="M0 -10L2 -5L7 -7L5 -2L10 -2L6 2L7 6L2 4L1 8L0 10L-1 8L-2 4L-7 6L-6 2L-10 -2L-5 -2L-7 -7L-2 -5Z" fill="#c9363b"/>' +
  '<path transform="translate(26 12) rotate(30) scale(.55)" d="M0 -10L2 -5L7 -7L5 -2L10 -2L6 2L7 6L2 4L1 8L0 10L-1 8L-2 4L-7 6L-6 2L-10 -2L-5 -2L-7 -7L-2 -5Z" fill="#5a0d16"/>' +
  '<path transform="translate(15 23) rotate(160) scale(.6)" d="M0 -10L2 -5L7 -7L5 -2L10 -2L6 2L7 6L2 4L1 8L0 10L-1 8L-2 4L-7 6L-6 2L-10 -2L-5 -2L-7 -7L-2 -5Z" fill="#b52530"/>' +
  '<path transform="translate(32 27) rotate(-70) scale(.5)" d="M0 -10L2 -5L7 -7L5 -2L10 -2L6 2L7 6L2 4L1 8L0 10L-1 8L-2 4L-7 6L-6 2L-10 -2L-5 -2L-7 -7L-2 -5Z" fill="#6e101a"/>' +
  '</pattern>' +
  glow('cloud', '#2c3446', 0.9) +
  glow('mist', '#dfe7f2', 0.35) +
  glow('moonHalo', '#e6edf7', 0.35) +
  glow('torchGlow', '#ffb85c', 0.55) +
  glow('hallGlow', '#ffc96b', 0.28) +
  glow('flake', '#ffffff', 1) +
  glow('iceAura', '#7fd6ff', 0.22) +
  glow('eyeGlow', '#6fe4ff', 0.95) +
  '<radialGradient id="iceSkin" cx=".5" cy=".35" r=".7"><stop offset="0" stop-color="#d9eaf7"/><stop offset=".55" stop-color="#9ab8d4"/><stop offset="1" stop-color="#5f7f9f"/></radialGradient>' +
  '<linearGradient id="armor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2c3542"/><stop offset="1" stop-color="#161c24"/></linearGradient>' +
  '<linearGradient id="iceBlade" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#8fc3e6"/><stop offset=".5" stop-color="#eef9ff"/><stop offset="1" stop-color="#9fcbe8"/></linearGradient>' +
  '</defs>'

const STYLE =
  '<style>' +
  '.tx{font-family:Georgia,"Times New Roman",serif;font-weight:700;fill:#ecebe6}.ts{fill:#140d08;fill-opacity:.6}' +
  '.tw{animation:tw 8s ease-in-out infinite}@keyframes tw{0%,100%{opacity:1}50%{opacity:.3}}' +
  '.au{animation:au 52s ease-in-out infinite alternate}@keyframes au{from{transform:translateX(-60px) scaleY(.9)}to{transform:translateX(60px) scaleY(1.1)}}' +
  '.drift{animation:drift 140s linear infinite}@keyframes drift{from{transform:translateX(0px)}to{transform:translateX(-1600px)}}' +
  '.ice{opacity:.35;animation:ice 9s ease-in-out infinite}@keyframes ice{0%,100%{opacity:.25}50%{opacity:.5}}' +
  '.veil{animation:veil 70s linear infinite}@keyframes veil{from{transform:translateX(140px)}to{transform:translateX(-220px)}}' +
  '.swing{transform-box:view-box;transform-origin:160px 0px;animation:swing 8s ease-in-out infinite}@keyframes swing{0%,100%{transform:rotate(-1.6deg)}50%{transform:rotate(1.6deg)}}' +
  '.bob{animation:bob 3s ease-in-out infinite}@keyframes bob{0%,100%{transform:translate(0px,0px)}50%{transform:translate(0px,-1.4px)}}' +
  '.head{transform-box:fill-box;transform-origin:30% 80%;animation:head 10s ease-in-out infinite}@keyframes head{0%,62%,100%{transform:rotate(0deg)}68%,80%{transform:rotate(-12deg)}}' +
  '.caw{transform-box:fill-box;transform-origin:0% 0%;animation:caw 13s ease-in-out infinite}@keyframes caw{0%,86%,100%{transform:rotate(0deg)}88%,92%{transform:rotate(16deg)}}' +
  '.tail{transform-box:fill-box;transform-origin:100% 50%;animation:tail 7s ease-in-out infinite}@keyframes tail{0%,80%,100%{transform:rotate(0deg)}85%{transform:rotate(-10deg)}90%{transform:rotate(4deg)}}' +
  '.trickle{animation:trickle 1.4s ease-in-out infinite}@keyframes trickle{0%,100%{opacity:.9}50%{opacity:.55}}' +
  '.leaf{opacity:0;transform-box:fill-box;transform-origin:center;animation:leaf 12s ease-in-out infinite}' +
  '@keyframes leaf{0%{opacity:0;transform:translate(0px,0px) rotate(0deg)}8%{opacity:1}30%{transform:translate(26px,110px) rotate(200deg)}60%{transform:translate(-22px,230px) rotate(430deg)}88%{opacity:1}100%{opacity:0;transform:translate(-70px,340px) rotate(700deg)}}' +
  '.cloak{transform-box:fill-box;transform-origin:50% 0%;animation:cloak 3.4s ease-in-out infinite}@keyframes cloak{0%,100%{transform:skewX(-2deg)}50%{transform:skewX(3deg)}}' +
  '.breath{opacity:0;fill:#e8eef6;transform-box:fill-box;transform-origin:center;animation:breath 4.5s ease-out infinite}@keyframes breath{0%{opacity:0;transform:translate(0px,0px) scale(.6)}12%{opacity:.55}100%{opacity:0;transform:translate(26px,-14px) scale(3)}}' +
  '.wtail{transform-box:fill-box;transform-origin:0% 60%;animation:wtail 6s ease-in-out infinite}@keyframes wtail{0%,100%{transform:rotate(0deg)}50%{transform:rotate(-3deg)}}' +
  // the wolf's howl: neck and head tip back toward the moon, the jaw opens, then all settles
  '.howl{transform-box:view-box;transform-origin:270px 832px;animation:howl 26s ease-in-out infinite}' +
  '@keyframes howl{0%,66%{transform:rotate(0deg)}71%{transform:rotate(-34deg)}78%{transform:rotate(-37deg)}86%{transform:rotate(-34deg)}91%,100%{transform:rotate(0deg)}}' +
  '.hjaw{opacity:0;animation:hjaw 26s ease-in-out infinite}@keyframes hjaw{0%,70%,90%,100%{opacity:0}73%,87%{opacity:1}}' +
  // the ice king: out of the storm, close, a long stare, gone
  '.iceKing{opacity:0;transform-box:view-box;transform-origin:0px 0px;animation:iceKing 120s infinite}' +
  '@keyframes iceKing{0%{opacity:0;transform:translate(262px,926px) scale(.3)}2%{opacity:.9}5%{transform:translate(258px,958px) scale(.7)}' +
  '8%{transform:translate(254px,990px) scale(1.15)}11%{transform:translate(251px,1018px) scale(1.6)}14%{opacity:1;transform:translate(250px,1040px) scale(1.95)}' +
  '33%{opacity:1;transform:translate(250px,1040px) scale(1.95)}38%,100%{opacity:0;transform:translate(250px,1040px) scale(1.95)}}' +
  '.iceSway{transform-box:fill-box;transform-origin:50% 100%;animation:iceSway 7s ease-in-out infinite}@keyframes iceSway{0%,100%{transform:rotate(-1deg)}50%{transform:rotate(1deg)}}' +
  '.iceEyes{animation:iceEyes 2.6s ease-in-out infinite}@keyframes iceEyes{0%,100%{opacity:.65}50%{opacity:1}}' +
  '.ibreath{opacity:0;fill:#cfeaff;transform-box:fill-box;transform-origin:center;animation:ibreath 5s ease-out infinite}@keyframes ibreath{0%{opacity:0;transform:translate(0px,0px) scale(.6)}15%{opacity:.5}100%{opacity:0;transform:translate(0px,-18px) scale(3.2)}}' +
  '.dragon{opacity:0;animation:dragon 40s linear infinite}' +
  '@keyframes dragon{0%{opacity:0;transform:translate(1840px,270px) scale(1.5)}2%{opacity:.95}60%{opacity:.95;transform:translate(-340px,160px) scale(1.5)}62%,100%{opacity:0;transform:translate(-340px,160px) scale(1.5)}}' +
  '.glide{animation:glide 6s ease-in-out infinite}@keyframes glide{0%,100%{transform:translate(0px,0px)}50%{transform:translate(0px,-12px)}}' +
  '.flap,.flap2{transform-box:fill-box;transform-origin:70% 100%;animation:flap 2.6s ease-in-out infinite}.flap2{transform-origin:30% 100%}' +
  '@keyframes flap{0%,100%{transform:scaleY(1)}50%{transform:scaleY(-.35)}}' +
  '.breathe{transform-box:fill-box;transform-origin:50% 100%;animation:breathe 3.6s ease-in-out infinite}@keyframes breathe{0%,100%{transform:scaleY(1)}50%{transform:scaleY(1.012)}}' +
  '.ears{transform-box:fill-box;transform-origin:50% 100%;animation:ears 9s ease-in-out infinite}@keyframes ears{0%,90%,100%{transform:rotate(0deg)}93%{transform:rotate(-8deg)}96%{transform:rotate(3deg)}}' +
  '.banner{transform-box:fill-box;transform-origin:50% 0%;animation:banner 4s ease-in-out infinite}@keyframes banner{0%,100%{transform:skewX(-3deg)}50%{transform:skewX(3deg)}}' +
  '.pennant{transform-box:fill-box;transform-origin:0% 50%;animation:pennant 1.8s ease-in-out infinite}@keyframes pennant{0%,100%{transform:skewY(-6deg) scaleX(1)}50%{transform:skewY(5deg) scaleX(.92)}}' +
  '.flicker,.hearth{animation:flicker 2.9s ease-in-out infinite}.hearth{animation-duration:4.3s}@keyframes flicker{0%,100%{opacity:.82}30%{opacity:1}55%{opacity:.88}75%{opacity:.97}}' +
  '.flame{transform-box:fill-box;transform-origin:50% 100%;animation:flame 1.7s ease-in-out infinite}@keyframes flame{0%,100%{transform:scale(1,1)}35%{transform:scale(.92,1.08)}70%{transform:scale(1.05,.94)}}' +
  '.steam{opacity:0;transform-box:fill-box;transform-origin:center;animation:steam 16s ease-out infinite}@keyframes steam{0%{opacity:0;transform:translate(0px,0px) scale(.6)}20%{opacity:.22}100%{opacity:0;transform:translate(-40px,-150px) scale(3.4)}}' +
  '.puff{opacity:0;transform-box:fill-box;transform-origin:center;animation:puff 11s ease-out infinite}@keyframes puff{0%{opacity:0;transform:translate(0px,0px) scale(.5)}15%{opacity:.45}100%{opacity:0;transform:translate(-60px,-180px) scale(2.8)}}' +
  '.fall{animation:fall 40s linear infinite}@keyframes fall{from{transform:translate(0px,0px)}to{transform:translate(0px,1000px)}}' +
  '.sway{animation:sway 6s ease-in-out infinite alternate}@keyframes sway{from{transform:translate(-14px,0px)}to{transform:translate(14px,0px)}}' +
  // a phone held upright has room for one side: keep the sign, the swordsman and the wolf
  '@media (max-aspect-ratio: 3/4){.rs{display:none}}' +
  '</style>'

/** The whole scene: context `percent` full, the cache as last refreshed, at `now` milliseconds. */
const scene = (percent: number, cacheState: TheNorthCache, now: number): string => {
  const nowS = now / 1000
  const k = percent / 100

  return (
    '<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">' +
    STYLE +
    DEFS +
    backdrop(k, nowS) +
    right(nowS) +
    left(percent, cacheView(cacheState, now), nowS) +
    storm(k, nowS) +
    '</svg>'
  )
}

// ---------------------------------------------------------------- sound

const SOUND: ThemeSound = {
  ambience: {
    reverb: 0.45,
    layers: [
      // the wind over the snowfields, and its moaning gusts
      { wave: 'brown', drone: true, gain: 0.15, filter: { type: 'lowpass', hz: 220, to: 620 } },
      { wave: 'pink', drone: true, gain: 0.05, filter: { type: 'bandpass', hz: 800, to: 1700 } },
      // torches at the gate, off to the right
      { wave: 'crackle', scatter: 2, gain: 0.04, attack: 0.002, release: 0.05, pan: 0.55, filter: { type: 'lowpass', hz: 2600 } },
      // now and then, a wolf far off
      { wave: 'sine', notes: ['E4', 'B4'], step: 1.4, glide: 6, scatter: 0.02, gain: 0.025, attack: 0.5, release: 1.9, pan: -0.6, tremolo: { hz: 5, depth: 0.15 } },
    ],
  },
  cues: {
    send: { layers: [{ wave: 'bell', notes: ['D5'], gain: 0.14, release: 1.2 }], reverb: 0.4 },
    tool: { layers: [{ wave: 'sine', notes: ['D6'], gain: 0.03, release: 0.06 }] },
    // a low horn when a turn is done
    done: {
      layers: [
        { wave: 'saw', notes: ['D3', 'A3'], step: 0.35, gain: 0.11, attack: 0.15, release: 1, filter: { type: 'lowpass', hz: 700 } },
        { wave: 'sine', notes: ['D2'], gain: 0.07, attack: 0.15, release: 1.4 },
      ],
      reverb: 0.5,
    },
    ask: { layers: [{ wave: 'bell', notes: ['A5', 'D6'], step: 0.14, gain: 0.15, release: 1 }], reverb: 0.35 },
    error: { layers: [{ wave: 'triangle', notes: ['D4', 'A3'], step: 0.16, gain: 0.13, release: 0.5 }] },
    compact: { layers: [{ wave: 'pink', gain: 0.1, attack: 0.3, release: 1.2, filter: { type: 'lowpass', hz: 1400, to: 300 } }] },
    click: { layers: [{ wave: 'bell', notes: ['D5', 'E5', 'F5', 'A5', 'C6', 'D6'], gain: 0.12, release: 1.2 }], reverb: 0.4 },
  },
}

// ---------------------------------------------------------------- message style

const STYLE_RULES: ThemeStyle = {
  Text: { fontFamily: ['serif'] },
  Heading: { fontFamily: ['serif'], letterSpacing: 0.5 },
  UserMessage: {
    color: '#e8ecf1',
    backgroundColor: '#1a1f27',
    radius: 4,
    paddingX: 14,
    paddingY: 10,
    borderColor: '#a9c7e633',
    borderWidth: 1,
    shadow: { x: 0, y: 2, blur: 14, color: '#00000066' },
  },
  ToolUse: { color: '#c3cad3', backgroundColor: '#12161cf0', radius: 4, paddingX: 10, paddingY: 4 },
}

const BASE: ThemeSetArgs = {
  colors: theme,
  overrideColorScheme: 'dark',
  backdrop: { scene: SCENE, glass: { blur: 18, tint: '#0c0f14', opacity: 0.62 } },
}

const LOOK: ThemeSetArgs = { ...BASE, sound: SOUND, style: STYLE_RULES }

// ---------------------------------------------------------------- hooks

/** Sets the whole look; a build that refuses sound or style gets the look without them. */
const applyTheme = async ($: EngineInterface): Promise<void> => {
  let set

  try {
    set = await $.theme.set(LOOK)
  } catch (error) {
    $.ui.log(`the-north: ${String(error)}`)
    set = await $.theme.set(BASE)
  }

  // A status line only while nothing draws it, cleared once a window does.
  $.ui.status(set.isDrawn ? undefined : set.reason)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const unpainted = problems.find(line => line.startsWith("Desktop won't paint"))

    if (unpainted !== undefined) {
      $.ui.toast(`the-north: ${unpainted}`)
    }

    try {
      const { context } = await $.session.usage()
      await update($, fill, () => stepFill(context))
    } catch {
      // No figures yet: the sign reads 0%.
    }

    await applyTheme($)

    return next(e)
  })

  // The desktop app starts sessions ahead of time and opens background ones later, so the
  // theme set at session.start can predate any window: set it again whenever one attaches.
  on('session.attach', async ($, e, next) => {
    const result = await next(e)

    if (e.surface === 'desktop' || e.surface === 'mobile') {
      await applyTheme($)
    }

    return result
  })

  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('context')) {
      const value = stepFill(e.context)

      if (value !== (await read($, fill))) {
        await update($, fill, () => value)
      }
    }

    return next(e)
  })

  // shortcut: the cache counts from the main turn's end, not its last request's start, so it reads up to a minute long; hook turn.step if that ever matters.
  on('turn.complete', async ($, e, next) => {
    const result = await next(e)

    if (e.agentId === undefined) {
      const hour = (e.usage?.ephemeral_1h_input_tokens ?? 0) > 0
      const fiveMinutes = (e.usage?.ephemeral_5m_input_tokens ?? 0) > 0
      const at = await $.clock.now()
      await update($, cache, prev => ({ at, ttl: hour ? 60 : fiveMinutes ? 5 : prev.ttl }))
    }

    return result
  })

  on('ui.render', { component: 'Backdrop' }, async ($, e, next) => {
    if ((e.surface !== 'desktop' && e.surface !== 'mobile') || e.props.scene !== SCENE) {
      return next(e)
    }

    const { Svg } = $.ui.resolve(e)
    const percent = await read($, fill)
    const cached = await read($, cache)
    const now = await $.clock.now()

    return (
      <Svg
        source={scene(percent, cached, now)}
        alt={`A frozen northern night: a raven on a sign reading ${percent}% context, a swordsman in a black cloak with a white direwolf, and a castle flying grey-wolf banners before a wall of ice`}
        isInteractive
      />
    )
  })
}
