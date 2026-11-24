import { expect, test } from 'claude-code/testing'

const BACKDROP = {
  plugin: 'the-north',
  component: 'Backdrop',
  requestId: 'backdrop',
  props: { scene: 'the-north', plugin: 'the-north', glass: { blur: 18, opacity: 0.62 } },
} as const

const drawn = async ($: any, surface: 'desktop' | 'mobile') => {
  const ui = await $.ui.mount({ ...BACKDROP, surface })
  const svg = await ui.find({ type: 'Svg' })
  await ui.unmount()

  return { alt: String(svg?.props?.alt ?? ''), source: String(svg?.props?.source ?? '') }
}

test('the sign reads the context, and the cache counts from the last main turn', async ($, on) => {
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('theme.set', () => ({ value: { isDrawn: true, requestId: 'backdrop' } }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }))
  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('turn.complete', () => ({ text: '' }))
  on('clock.now', () => ({ value: 1_000_000 }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  for (const surface of ['desktop', 'mobile'] as const) {
    const { alt, source } = await drawn($, surface)
    expect(alt).toContain('0% context')
    // no turn yet: the cache reads a dash
    expect(source).toContain('>—</text>')
    expect(source.length).toBeLessThan(131072)
  }

  await $.session.measure({
    context: { window: 200000, tokens: 124000, percent: 62 },
    rateLimits: [],
    changed: ['context'],
  })
  await $.turn.complete({
    answer: 'ok',
    durationMs: 10,
    isAborted: false,
    turnId: 't1',
    reason: 'answer',
    usage: {
      input_tokens: 1,
      output_tokens: 1,
      cache_creation_input_tokens: 10,
      cache_read_input_tokens: 0,
      ephemeral_5m_input_tokens: 0,
      ephemeral_1h_input_tokens: 10,
      model: 'claude-opus-5-5',
    },
  } as any)

  const { alt, source } = await drawn($, 'desktop')
  expect(alt).toContain('62% context')
  expect(source).toContain('>60m</text>')
  // a full context window draws the heaviest storm, still under the size limit
  await $.session.measure({ context: { window: 200000, tokens: 200000, percent: 100 }, rateLimits: [], changed: ['context'] })
  expect((await drawn($, 'desktop')).source.length).toBeLessThan(131072)
})

test('a subagent turn leaves the cache alone', async ($, on) => {
  on('turn.complete', () => ({ text: '' }))
  on('clock.now', () => ({ value: 1_000_000 }))

  await $.turn.complete({
    answer: 'ok',
    durationMs: 10,
    isAborted: false,
    turnId: 't2',
    agentId: 'a1',
    reason: 'answer',
    usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, model: 'm' },
  } as any)

  expect((await drawn($, 'desktop')).source).toContain('>—</text>')
})

test('the terminal gets the engine own backdrop', async ($, on) => {
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>engine</Text>
  })

  const ui = await $.ui.mount({ ...BACKDROP, surface: 'terminal' } as any)
  expect(await ui.find({ type: 'Svg' })).toBeUndefined()
  await ui.unmount()
})
