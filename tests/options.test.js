// An unstored default must stay unstored, so a later change of default in a
// mod's plugin.json reaches it.
import assert from 'node:assert/strict'
import { test } from 'vitest'
import {
  answerFor,
  optionChanges,
  configuredKeys,
  currentValues,
  defaultChoice,
  initialValue,
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
  assert.deepEqual(valuesToStore(userConfig, { token: '' }, new Set(['token'])), { token: '' })
})

test('an answer changed from the current value is a change', () => {
  const result = optionChanges(userConfig, { minSeconds: '10' }, { minSeconds: '30' }, new Set(['minSeconds']))
  assert.deepEqual(result, { toStore: { minSeconds: '10' }, hasChanges: true })
})

test('defaults of a mod not installed yet are no change', () => {
  const result = optionChanges(userConfig, { minSeconds: '30', excerpt: 'false' }, {}, new Set())
  assert.deepEqual(result, { toStore: {}, hasChanges: false })
})

test('an answer kept at the current value is no change', () => {
  const result = optionChanges(userConfig, { excerpt: 'true' }, { excerpt: 'true' }, new Set(['excerpt']))
  assert.deepEqual(result, { toStore: { excerpt: 'true' }, hasChanges: false })
})

test('a stored value of an unconfigured option is a change, even when it matches the installed default', () => {
  const result = optionChanges(userConfig, { minSeconds: '10' }, { minSeconds: '10' }, new Set())
  assert.deepEqual(result, { toStore: { minSeconds: '10' }, hasChanges: true })
})

test('an answer left out of the stored values is no change', () => {
  const answers = { minSeconds: '30', excerpt: 'true' }
  const result = optionChanges(userConfig, answers, { minSeconds: '10', excerpt: 'true' }, new Set(['excerpt']))
  assert.deepEqual(result, { toStore: { excerpt: 'true' }, hasChanges: false })
})

test('a configured option starts from its current value', () => {
  assert.equal(initialValue({ default: false }, 'true', true), 'true')
  assert.equal(initialValue({ default: 30 }, undefined, true), '30')
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

test('without the configured list, counts the options away from the default', () => {
  const values = { minSeconds: '5', excerpt: 'false', token: '' }
  assert.deepEqual(configuredKeys(undefined, values, userConfig), new Set(['minSeconds']))
  assert.deepEqual(configuredKeys(null, values, userConfig), new Set(['minSeconds']))
  assert.deepEqual(configuredKeys('x', values, userConfig), new Set(['minSeconds']))
})

test('an answer for an option outside the userConfig is stored only when not empty', () => {
  assert.deepEqual(valuesToStore(userConfig, { extra: '' }, new Set()), {})
  assert.deepEqual(valuesToStore(userConfig, { extra: 'x' }, new Set()), { extra: 'x' })
})

test('reads the current values as text, leaving out empty ones but free text', () => {
  const userConfig = {
    minSeconds: { type: 'number' },
    label: { type: 'string' },
    notify: { type: 'string', options: ['always'] },
  }
  const inputs = { minSeconds: 30, excerpt: false, label: '', notify: '', token: null }
  assert.deepEqual(currentValues(inputs, userConfig), { minSeconds: '30', excerpt: 'false', label: '' })
  // A sensitive text starts empty, so an empty value there is no value.
  assert.deepEqual(currentValues({ secret: '' }, { secret: { type: 'string', sensitive: true } }), {})
})

test('has no current values when the reply has no inputs object', () => {
  assert.equal(currentValues(null, {}), undefined)
  assert.equal(currentValues('x', {}), undefined)
  assert.equal(currentValues(undefined, {}), undefined)
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

test('a filled answer is stored as given', () => {
  assert.equal(answerFor({ type: 'number' }, '10', '30'), '10')
  assert.equal(answerFor({ type: 'boolean' }, 'false', 'true'), 'false')
})

test('a null default counts as no default everywhere', () => {
  const nullDefaults = { label: { default: null } }
  assert.deepEqual(valuesToStore(nullDefaults, { label: '' }, new Set()), {})
  assert.deepEqual(configuredKeys(undefined, { label: '' }, nullDefaults), new Set())
  assert.equal(initialValue({ default: null }, undefined, false), '')
})

test('starts a select from its default when it is one of the choices', () => {
  assert.equal(defaultChoice({ type: 'string', default: 'b', options: ['a', 'b'] }), 'b')
})

test('starts a select from its first choice when the default is not one of them', () => {
  assert.equal(defaultChoice({ type: 'string', default: 'z', options: ['a', 'b'] }), 'a')
  assert.equal(defaultChoice({ type: 'string', options: ['a', 'b'] }), 'a')
})
