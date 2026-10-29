// @ts-check

const CMD_META = /[()\][%!^"`<>&|;, *?]/g

/**
 * Quotes an argument for claude.cmd (an npm install) run through cmd.exe,
 * like cross-spawn's escapeArgument with its double escape for .cmd shims,
 * except that every backslash before a quote is doubled (cross-spawn doubles
 * only the last one); claude.exe never goes through cmd. Checked against the
 * real cmd.exe by tests/quote-cmd.test.js, on the windows CI job.
 * First for the program's own parser: a quote becomes \" and the backslashes
 * before it (or before the closing quote) are doubled. Then every cmd
 * metacharacter, quotes and % included, gets a caret, twice: cmd parses the
 * line once and again when the .cmd shim passes it on. Inside plain quotes
 * cmd would still expand %VAR%.
 *
 * @param {string} arg
 */
export function quoteForCmd(arg) {
  const quoted = `"${arg.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\*)$/, '$1$1')}"`
  return quoted.replace(CMD_META, '^$&').replace(CMD_META, '^$&')
}

/**
 * The command line for running a .cmd through cmd.exe (spawn with `shell: true`).
 *
 * @param {string} command
 * @param {string[]} args
 */
export function cmdLine(command, args) {
  return [command, ...args.map(quoteForCmd)].join(' ')
}
