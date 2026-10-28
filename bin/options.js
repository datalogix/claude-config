// @ts-check

/**
 * @typedef {{ type: string, title?: string, description?: string, default?: unknown, options?: string[], sensitive?: boolean }} Option
 */

/**
 * @param {{ default?: unknown } | undefined} option
 */
function defaultText(option) {
  return option?.default === undefined || option.default === null ? '' : String(option.default)
}

/**
 * A sensitive option starts empty, so an empty answer there means "keep".
 *
 * @param {Option | undefined} option
 */
function isFreeText(option) {
  return option?.type === 'string' && !option.options && !option.sensitive
}

/**
 * An option without a default may come back as ""; only a free text option
 * can be left empty on purpose.
 *
 * @param {unknown} inputs
 * @param {Record<string, Option>} userConfig
 * @returns {Record<string, string> | undefined}
 */
export function currentValues(inputs, userConfig) {
  if (inputs === null || typeof inputs !== 'object') {
    return undefined
  }
  return Object.fromEntries(
    Object.entries(inputs)
      .filter(([key, value]) => value !== undefined && value !== null && (value !== '' || isFreeText(userConfig[key])))
      .map(([key, value]) => [key, String(value)]),
  )
}

/**
 * Undefined leaves the option out. A sensitive one is always left out when
 * empty: claude keeps the options left out, and its current value may come
 * back masked.
 *
 * @param {Option} option
 * @param {string} input what the user answered
 * @param {string} initial the value the question started from (`initialValue`)
 * @returns {string | undefined}
 */
export function answerFor(option, input, initial) {
  if (input !== '' || isFreeText(option)) {
    return input
  }
  return option.sensitive ? undefined : initial || undefined
}

/**
 * An unconfigured option is stored only when it differs from its default, so
 * a default nobody chose stays unstored and a later change of default in the
 * mod's plugin.json reaches it.
 *
 * @param {Record<string, { default?: unknown }>} userConfig
 * @param {Record<string, string>} answers
 * @param {ReadonlySet<string>} configured
 * @returns {Record<string, string>}
 */
export function valuesToStore(userConfig, answers, configured) {
  return Object.fromEntries(
    Object.entries(answers).filter(([key, answer]) => configured.has(key) || answer !== defaultText(userConfig[key])),
  )
}

/**
 * A reply without `configured` counts as configured each option whose value
 * differs from this checkout's default; an option whose default changed
 * between the installed version and this checkout then counts as configured
 * too.
 *
 * @param {unknown} configured
 * @param {Record<string, string>} values
 * @param {Record<string, { default?: unknown }>} userConfig
 * @returns {Set<string>}
 */
export function configuredKeys(configured, values, userConfig) {
  if (Array.isArray(configured)) {
    return new Set(configured.filter((key) => typeof key === 'string'))
  }
  return new Set(Object.keys(values).filter((key) => values[key] !== defaultText(userConfig[key])))
}

/**
 * The current value counts only for an option already configured: an
 * unconfigured one comes back with the default of the installed version,
 * which may be older than this one.
 *
 * @param {{ default?: unknown }} option
 * @param {string | undefined} current
 * @param {boolean} isConfigured
 * @returns {string}
 */
export function initialValue(option, current, isConfigured) {
  const fallback = defaultText(option)
  // ?? and not ||: false, 0 and an empty text are current values too.
  return isConfigured ? (current ?? fallback) : fallback
}

/**
 * @param {Option} option
 * @returns {string}
 */
export function defaultChoice(option) {
  const choices = option.options ?? []
  const fallback = defaultText(option)
  return choices.includes(fallback) ? fallback : (choices[0] ?? '')
}

/**
 * @param {Record<string, { default?: unknown }>} userConfig
 * @param {Record<string, string>} answers
 * @param {Record<string, string>} current
 * @param {ReadonlySet<string>} configured
 * @returns {{ toStore: Record<string, string>, hasChanges: boolean }}
 */
export function optionChanges(userConfig, answers, current, configured) {
  const toStore = valuesToStore(userConfig, answers, configured)
  const hasChanges = Object.entries(toStore).some(([key, value]) => !configured.has(key) || value !== current[key])
  return { toStore, hasChanges }
}
