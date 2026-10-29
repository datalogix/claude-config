// Checked on any system; quoteForCmd has never run on real Windows.
import assert from 'node:assert/strict'
import { describe, test } from 'vitest'
import { cmdLine, quoteForCmd } from '../bin/quote.js'

describe('quoteForCmd', () => {
  test.each([
    ['quotes a plain argument, with the quotes escaped twice', 'steps@claude-config', '^^^"steps@claude-config^^^"'],
    ['escapes spaces and cmd operators twice', 'a b&c|d', '^^^"a^^^ b^^^&c^^^|d^^^"'],
    ['escapes % and ! so cmd does not expand variables', '%PATH%!x!', '^^^"^^^%PATH^^^%^^^!x^^^!^^^"'],
    ['turns an inner quote into \\" and doubles the backslashes before it', 'say \\"hi', '^^^"say^^^ \\\\\\^^^"hi^^^"'],
    ['doubles every backslash before an inner quote', 'a\\\\"', '^^^"a\\\\\\\\\\^^^"^^^"'],
    ['escapes carets, parentheses and redirections twice', '^(<>)', '^^^"^^^^^^^(^^^<^^^>^^^)^^^"'],
    ['doubles a trailing backslash so it does not escape the closing quote', 'C:\\dir\\', '^^^"C:\\dir\\\\^^^"'],
    ['leaves backslashes elsewhere alone', 'C:\\a\\b', '^^^"C:\\a\\b^^^"'],
    ['keeps an empty argument as an empty pair of quotes', '', '^^^"^^^"'],
  ])('%s', (_, input, expected) => {
    assert.equal(quoteForCmd(input), expected)
  })
})

test('cmdLine quotes each argument, not the command', () => {
  assert.equal(cmdLine('claude', ['a', 'b c']), 'claude ^^^"a^^^" ^^^"b^^^ c^^^"')
})
