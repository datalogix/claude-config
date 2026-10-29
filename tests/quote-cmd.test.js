// Runs only on Windows: the real cmd.exe parses what cmdLine builds, through a
// claude.cmd shaped like npm's shim, and the arguments must arrive unchanged.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, test } from 'vitest'
import { cmdLine } from '../bin/quote.js'

describe('cmdLine through cmd.exe', { skip: process.platform !== 'win32' }, () => {
  /** @type {string} */
  let binDir

  beforeAll(() => {
    binDir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-config-cmd-'))
    fs.writeFileSync(path.join(binDir, 'args.js'), 'process.stdout.write(JSON.stringify(process.argv.slice(2)))\n')
    // The last line of npm's cmd-shim, which passes the arguments on with %*.
    fs.writeFileSync(
      path.join(binDir, 'claude.cmd'),
      [
        '@ECHO off',
        'SETLOCAL',
        `SET "_prog=${process.execPath}"`,
        'endLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & "%_prog%"  "%~dp0\\args.js" %*',
        '',
      ].join('\r\n'),
    )
  })

  afterAll(() => {
    fs.rmSync(binDir, { recursive: true, force: true })
  })

  test.each([
    ['a plain argument', ['plugin', 'install', 'steps@claude-config']],
    ['spaces and cmd operators', ['a b&c|d', 'x>y', 'x<y', '(z)']],
    ['% and ! that cmd must not expand', ['%PATH%', '!x!', '%%', '100%']],
    ['quotes and the backslashes before them', ['say "hi"', 'say \\"hi', 'a\\\\"', '"']],
    ['carets and other metacharacters', ['^', 'a^b', ';,=*?', '`']],
    ['Windows paths, with a trailing backslash', ['C:\\dir\\', 'C:\\a\\b', 'C:\\Program Files\\x']],
    ['JSON-like text', ['{"name":"a b","list":["x","y"]}']],
    ['an empty argument', ['', 'after']],
  ])('passes %s unchanged', (_, args) => {
    const result = spawnSync(cmdLine('claude', args), {
      encoding: 'utf8',
      shell: true,
      env: { ...process.env, PATH: `${binDir};${process.env.PATH}` },
    })

    assert.equal(result.status, 0, result.stderr)
    assert.deepEqual(JSON.parse(result.stdout), args)
  })
})
