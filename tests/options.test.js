// @ts-check
// The pure helpers of bin/options.js. The rule behind most of them: an unstored default must stay unstored, so a
// later change of default in a mod's plugin.json reaches it.
import assert from 'node:assert/strict'
import { describe, test } from 'vitest'
import {
  answerFor,
  configuredKeys,
  currentValues,
  defaultChoice,
  initialValue,
  optionChanges,
  valuesToStore,
} from '../bin/options.js'

const userConfig = { minSeconds: { default: 30 }, excerpt: { default: false }, token: {} }

test('leaves out an unconfigured option answered with its default', () => {
  assert.deepEqual(valuesToStore(userConfig, { minSeconds: '30', excerpt: 'false' }, new Set()), {})
})

test('stores an answer that differs from the default', () => {
  assert.deepEqual(valuesToStore(userConfig, { minSeconds: '10', excerpt: 'false' }, new Set()), { minSeconds: '10' })
})

test('keeps an option already configured, even at its default', () => {
  assert.deepEqual(valuesToStore(userConfig, { excerpt: 'false' }, new Set(['excerpt'])), { excerpt: 'false' })
})

test('stores an option without a default only once filled in', () => {
  assert.deepEqual(valuesToStore(userConfig, { token: '' }, new Set()), {})
  assert.deepEqual(valuesToStore(userConfig, { token: 'abc' }, new Set()), { token: 'abc' })
})

test('keeps an option without a default already configured, even empty', () => {
  assert.deepEqual(valuesToStore(userConfig, { token: '' }, new Set(['token'])), { token: '' })
})

test('leaves out an untouched boolean or select without a default', () => {
  const noDefaults = { flag: { type: 'boolean' }, pick: { type: 'string', options: ['a', 'b'] } }
  assert.deepEqual(valuesToStore(noDefaults, { flag: 'false', pick: 'a' }, new Set()), {})
  assert.deepEqual(valuesToStore(noDefaults, { flag: 'true', pick: 'b' }, new Set()), { flag: 'true', pick: 'b' })
})

test('does not count as configured an untouched boolean or select without a default', () => {
  const noDefaults = { flag: { type: 'boolean' }, pick: { type: 'string', options: ['a', 'b'] } }
  assert.deepEqual(configuredKeys(undefined, { flag: 'false', pick: 'a' }, noDefaults), new Set())
})

test('takes as untouched what a boolean question starts from, whatever its default or options', () => {
  const booleans = {
    text: { type: 'boolean', default: 'yes' },
    number: { type: 'boolean', default: 1 },
    choices: { type: 'boolean', options: ['true', 'false'] },
    enabled: { type: 'boolean', default: true },
  }
  const answers = { text: 'false', number: 'false', choices: 'false', enabled: 'true' }
  assert.deepEqual(valuesToStore(booleans, answers, new Set()), {})
  assert.deepEqual(configuredKeys(undefined, answers, booleans), new Set())
})

test('takes as untouched the choice a select starts from when its default is not one of them', () => {
  const select = { pick: { type: 'string', default: 'z', options: ['a', 'b'] } }
  assert.deepEqual(valuesToStore(select, { pick: 'a' }, new Set()), {})
})

test('an answer changed from the current value is a change', () => {
  const changes = optionChanges(userConfig, { minSeconds: '10' }, { minSeconds: '30' }, new Set(['minSeconds']))
  assert.deepEqual(changes, { toStore: { minSeconds: '10' }, hasChanges: true })
})

test('defaults of a mod not installed yet are no change', () => {
  const changes = optionChanges(userConfig, { minSeconds: '30', excerpt: 'false' }, {}, new Set())
  assert.deepEqual(changes, { toStore: {}, hasChanges: false })
})

test('an answer kept at the current value is no change', () => {
  const changes = optionChanges(userConfig, { excerpt: 'true' }, { excerpt: 'true' }, new Set(['excerpt']))
  assert.deepEqual(changes, { toStore: { excerpt: 'true' }, hasChanges: false })
})

test('a stored value of an unconfigured option is a change, even when it matches the installed default', () => {
  const changes = optionChanges(userConfig, { minSeconds: '10' }, { minSeconds: '10' }, new Set())
  assert.deepEqual(changes, { toStore: { minSeconds: '10' }, hasChanges: true })
})

test('an answer left out of the stored values is no change', () => {
  const answers = { minSeconds: '30', excerpt: 'true' }
  const changes = optionChanges(userConfig, answers, { minSeconds: '10', excerpt: 'true' }, new Set(['excerpt']))
  assert.deepEqual(changes, { toStore: { excerpt: 'true' }, hasChanges: false })
})

test('a configured option starts from its current value', () => {
  assert.equal(initialValue({ default: false }, 'true', true), 'true')
  assert.equal(initialValue({ default: 30 }, undefined, true), '30')
})

test('a configured empty text starts empty, not from the default', () => {
  assert.equal(initialValue({ default: 'x' }, '', true), '')
})

test('an unconfigured option starts from the default, not the installed one', () => {
  assert.equal(initialValue({ default: 60 }, '30', false), '60')
  assert.equal(initialValue({}, undefined, false), '')
})

test('takes the configured options from the reply', () => {
  assert.deepEqual(
    configuredKeys(['excerpt', 1], { excerpt: 'false', minSeconds: '5' }, userConfig),
    new Set(['excerpt']),
  )
})

test.each([[undefined], [null], ['x']])(
  'with %j as the configured list, counts the options away from the default',
  (configured) => {
    const values = { minSeconds: '5', excerpt: 'false', token: '' }
    assert.deepEqual(configuredKeys(configured, values, userConfig), new Set(['minSeconds']))
  },
)

test('an answer for an option outside the userConfig is stored only when not empty', () => {
  assert.deepEqual(valuesToStore(userConfig, { extra: '' }, new Set()), {})
  assert.deepEqual(valuesToStore(userConfig, { extra: 'x' }, new Set()), { extra: 'x' })
})

test('reads the current values as text, leaving out empty ones but free text', () => {
  const options = {
    minSeconds: { type: 'number' },
    label: { type: 'string' },
    notify: { type: 'string', options: ['always'] },
  }
  const inputs = { minSeconds: 30, excerpt: false, label: '', notify: '', token: null }
  assert.deepEqual(currentValues(inputs, options), { minSeconds: '30', excerpt: 'false', label: '' })
})

// A sensitive text starts empty, so an empty value there is no value.
test('leaves out an empty sensitive value', () => {
  assert.deepEqual(currentValues({ secret: '' }, { secret: { type: 'string', sensitive: true } }), {})
})

test.each([[null], ['x'], [undefined], [['x']]])('has no current values when the inputs are %j', (inputs) => {
  assert.equal(currentValues(inputs, {}), undefined)
})

test('an empty answer clears free text and keeps the starting value of the rest', () => {
  assert.equal(answerFor({ type: 'string' }, '', 'old'), '')
  assert.equal(answerFor({ type: 'number' }, '', '30'), '30')
  assert.equal(answerFor({ type: 'number' }, '', ''), undefined)
  assert.equal(answerFor({ type: 'string', options: ['a', 'b'] }, '', 'a'), 'a')
})

test('an empty sensitive answer leaves the option out', () => {
  assert.equal(answerFor({ type: 'string', sensitive: true }, '', 'masked'), undefined)
  assert.equal(answerFor({ type: 'string', sensitive: true }, 'secret', ''), 'secret')
})

test('a filled answer stands as given', () => {
  assert.equal(answerFor({ type: 'number' }, '10', '30'), '10')
  assert.equal(answerFor({ type: 'boolean' }, 'false', 'true'), 'false')
})

describe('a null default counts as no default', () => {
  const nullDefaults = { label: { default: null } }

  test('when storing', () => {
    assert.deepEqual(valuesToStore(nullDefaults, { label: '' }, new Set()), {})
  })

  test('when counting what is configured', () => {
    assert.deepEqual(configuredKeys(undefined, { label: '' }, nullDefaults), new Set())
  })

  test('when starting a question', () => {
    assert.equal(initialValue({ default: null }, undefined, false), '')
  })
})

test('starts a select from its default when it is one of the choices', () => {
  assert.equal(defaultChoice({ type: 'string', default: 'b', options: ['a', 'b'] }), 'b')
})

test('compares a select with a default that is not text as text', () => {
  assert.equal(defaultChoice({ type: 'string', default: 2, options: ['1', '2'] }), '2')
})

test('a select without choices starts empty', () => {
  assert.equal(defaultChoice({ type: 'string', options: [] }), '')
})

test('starts a select from its first choice when the default is not one of them', () => {
  assert.equal(defaultChoice({ type: 'string', default: 'z', options: ['a', 'b'] }), 'a')
  assert.equal(defaultChoice({ type: 'string', options: ['a', 'b'] }), 'a')
})
