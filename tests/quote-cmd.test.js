// Runs only on Windows: the real cmd.exe parses what cmdLine builds, through a
// claude.cmd shaped like npm's shim, and the arguments must arrive unchanged.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, test } from 'vitest'
import { cmdLine } from '../bin/quote.js'

describe('cmdLine through cmd.exe', { skip: process.platform !== 'win32' }, () => {
  /** @type {string} */
  let binDir

  beforeAll(() => {
    binDir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-config-cmd-'))
    fs.writeFileSync(
      path.join(binDir, 'args.js'),
      [
        'const args = JSON.stringify(process.argv.slice(2))',
        'const log = process.env.ARGS_LOG',
        "const fs = require('node:fs')",
        "if (log) fs.appendFileSync(log, args + '\\n')",
        // With a log it stands in for claude, whose lists hold objects: an empty one, not the arguments.
        "const reply = process.argv.includes('--values-stdin') ? fs.readFileSync(0, 'utf8') : log ? '[]' : args",
        'process.stdout.write(reply)',
        '',
      ].join('\n'),
    )
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

  // Option answers never go through the arguments, so cmd must let stdin reach the program behind the shim.
  test('passes stdin through to the program', () => {
    const input = '{"label":"a b & c","token":"%PATH%!x!^"}'
    const result = spawnSync(cmdLine('claude', ['plugin', 'configure', 'status@claude-config', '--values-stdin']), {
      encoding: 'utf8',
      input,
      shell: true,
      env: { ...process.env, PATH: `${binDir};${process.env.PATH}` },
    })

    assert.equal(result.status, 0, result.stderr)
    assert.equal(result.stdout, input)
  })

  // Only claude.cmd on PATH: Node cannot run it directly, so runClaude must fall back to cmd.
  test('the installer reaches claude.cmd', () => {
    const log = path.join(binDir, 'calls')
    const result = spawnSync(process.execPath, [fileURLToPath(new URL('../bin/cli.js', import.meta.url)), 'update'], {
      encoding: 'utf8',
      env: { ...process.env, PATH: binDir, USERPROFILE: binDir, ARGS_LOG: log },
    })

    assert.equal(result.status, 0, result.stdout + result.stderr)
    assert.doesNotMatch(result.stdout, /mods skipped/)
    const calls = fs
      .readFileSync(log, 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line))
    assert.deepEqual(calls, [['--version'], ['plugin', 'marketplace', 'list', '--json'], ['plugin', 'list', '--json']])
  })
})
