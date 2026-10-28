# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`claude-config`: Datalogix's Claude Code setup, installed with
`npx --allow-git=all github:datalogix/claude-config#main` (no npm publish). It ships mods, i.e. Claude Code plugins
(`mods/`), including the `datalogix` mod that holds the skills, plus the installer that puts them in place
(`bin/cli.js`).

## Commands

```bash
npm install
npm test                                  # Vitest for tests/ + `claude plugin test` for each mod with hooks (needs the claude CLI)
npx vitest run tests/cli-install.test.js  # one installer test file
npx vitest run tests/cli-update.test.js -t "renamed"  # installer tests whose name matches
claude plugin test mods/topics            # one mod's tests (*.test.ts/tsx under the folder)
npm run lint                              # eslint . && prettier --check .
npm run format                            # prettier --write . && eslint . --fix
node bin/cli.js install --link            # install from this clone: mods load in place, edits apply after /reload-plugins
```

`claude plugin validate` warns that mods have no `version`; that is intended (see below).

## CI

- `.github/workflows/ci.yml` runs `npm run lint` and actionlint (`ACTIONLINT_VERSION`, bumped by hand) in `lint`, and
  `claude plugin validate` for the root and each mod plus `npm test` in `test`, on Ubuntu only (Node 22 and LTS),
  installing the latest Claude Code. Windows is not in the matrix: the installer still supports it, untested.
- `all-checks` aggregates the jobs and is the single required status check; keep it in `needs` when adding a job.
- Dependabot (`.github/dependabot.yml`): GitHub Actions weekly (`ci:` commits), npm monthly in one group (`chore:`).

## Architecture

### Installer (`bin/`)

- Two commands, `install [--link]` and `update`. Unknown commands or flags are errors. Any failed step ends with
  "Finished with errors" and exit code 1.
- Failing to list the installed mods or the marketplaces (`runClaudeList`) is a failure that stops the mods part of
  the run, since an empty list would read as nothing installed. Failing to read a mod's options
  (`plugin configure --json`) is a failure that skips configuring that mod; a reply without `inputs` only warns and
  skips it too. Cancelling a prompt ends with the run's closing hint (`reloadHint`): `/clear`, and `/reload-plugins`
  when a mod already changed (`hasModChanges`).
- `install` also updates the marketplace (only when it was already added) and the mods already installed
  (`updateMarketplace`, `refreshMod`), as `update` does, so either command leaves them current. It logs
  `refreshed: <name>`, and a failed marketplace update still refreshes the mods. A failed refresh still asks for
  the mod's options. A marketplace added from another source than the one asked for (GitHub with `--link`, or the
  other way around) is only pointed out: neither it nor the mods are updated, and an installed mod with nothing to
  configure logs `ok: <name>`, unless its options could not be read (`isSkipped`), which is already reported. A mod
  also loaded inline (`<name>@inline` in `plugin list`) is pointed out on `install`.
- It no longer writes skills. Earlier versions copied them into `~/.claude/skills/<name>` with a `.claude-config`
  marker (or symlinked them with `--link`); `removeOldSkills` deletes those folders, and only those, once the
  `datalogix` mod (`SKILLS_MOD`) is installed or unchecked. `update` installs `datalogix` when such folders exist.
  Failing to read or remove one is reported with `reportFailure` and does not stop the run.
- Mods go through the `claude` CLI, never by writing Claude Code's files directly (`warnOldOptions` only reads
  `settings.json`, from `$CLAUDE_CONFIG_DIR` when set, else `~/.claude`). The installer calls
  `claude plugin marketplace add/list/update`, `plugin install/uninstall --keep-data/update/list --json` and
  `plugin configure --json/--values-stdin`, using the marketplace `datalogix/claude-config` (or the clone with
  `--link`).
- Option answers go through stdin, never argv.
- Renamed mods (`RENAMED_MODS`): the new name is installed first and the old one is uninstalled with `--keep-data`
  only after that succeeds. Renamed options are not carried over: `plugin configure --json` returns only the keys
  the userConfig declares, so values stored under an old key never reach the installer. `warnOldOptions` reads
  them from `pluginConfigs` in that `settings.json` and warns, on `install` and `update`, with their values.
  On `update`, the new name (and `datalogix` for old skills) is installed only after the marketplace update
  succeeded, since an older marketplace may not list it yet.
- `install` stores only the options already configured (`configured` in `plugin configure --json`; a reply without
  `configured` counts as configured each option whose value differs from this checkout's default, `configuredKeys`)
  and answers that differ from the default (`valuesToStore`, `bin/options.js`), so a default nobody chose stays
  unstored and a later change of default reaches it. The question for an option never configured starts from the
  default in this checkout's `plugin.json` (`initialValue`), not the one `plugin configure --json` reports for the
  installed version. A select whose configured value is not one of its choices starts from that default too
  (`defaultChoice`), or from its first choice if the default is not one either.
  `optionChanges` decides whether anything needs storing, and `configured: <name>` is logged only after
  `plugin configure --values-stdin` ran.
- On Windows, when `claude` resolves to npm's `claude.cmd`, it is run through `cmd` with `quoteForCmd`
  (`bin/quote.js`). That quoting is unit-tested but has never been run on real Windows.
- `tests/cli-install.test.js` and `tests/cli-update.test.js` run the real CLI without a TTY, with a temporary `HOME`
  and a fake `claude` shell script on `PATH` that logs its arguments; `tests/cli-interactive.test.js` runs the
  prompts in process, with `@clack/prompts` mocked. The shared setup is in `tests/helpers/cli.js` (`useTempHome`,
  `fakeClaude`, `runCli`). New installer behavior is tested the same way; pure helpers (`bin/options.js`,
  `bin/quote.js`) are unit-tested directly (`tests/options.test.js`, `tests/quote.test.js`).

### Mods (`mods/<name>/`)

- Each mod has `.claude-plugin/plugin.json` and, except `datalogix`, `hooks/hooks.json`. The latter lists the TS/TSX
  modules (`{ "modules": ["./register.tsx"] }`), which import from `'claude-code'`. Tests sit next to them as
  `*.test.ts(x)`, use `'claude-code/testing'` and run only with `claude plugin test`, never with Vitest
  (`vitest.config.js` limits Vitest to `tests/`). The one exception: `tests/skills.test.js` imports
  `mods/topics/hooks/parse.ts` under Vitest, so that file must not import `'claude-code'`. Vitest loads no tsconfig
  (`oxc: { tsconfig: false }` in `vitest.config.js`): the mod's extends the generated types, which do not exist
  until `claude plugin test` runs, so in CI it would fail.
- There is no `typecheck` script: the mods' types are generated by Claude Code and not in git, so
  `claude plugin test` is the check for the mods.
- Mods that keep plugin state declare it in `types/index.d.ts` (augmenting `PluginState`) and point to it from the
  `types` field of `plugin.json`.
- `mods/*/.claude-plugin/types/` is generated by Claude Code. It is git- and eslint-ignored, and each mod's
  `tsconfig.json` extends it.
- Never add `version` to `plugin.json` or to the marketplace entry. Without it, the commit SHA is the version, so every
  push reaches `update`.
- A new mod needs:
  - `"license": "MIT"` and `"author": { "name": "datalogix" }` in its `plugin.json`;
  - an entry in `.claude-plugin/marketplace.json`;
  - a `claude plugin test mods/<name>` added to the `test` script, if it has hooks (the command fails without them).
- `topics` parses the `## Pendências` format (the last such topic; checkbox/radio items, `(recomendado)`, an item's
  first `ver:` matched to a topic title ignoring case, accents, backticks and bold/italics, the first matching topic
  winning) in `hooks/parse.ts`. An item the answer writes checked (`isSuggested`) starts unchecked, as a suggestion;
  only what the user checks is sent as checked. Keep it in sync with the format `docs/mods/topics.md` documents.

### Skills (`mods/datalogix/skills/`)

- Skills ship in the `datalogix` mod, so they are invoked as `/datalogix:<name>`. Each folder with a `SKILL.md` is a
  skill, found by Claude Code with no registry to update. Refer to them by the full name in skill text and docs.
- Supporting files are found from `${CLAUDE_SKILL_DIR}`, the skill's own folder.
- `/datalogix:issue` (`issue/SKILL.md`) is a single prompt-only file in Portuguese. It reads the target project's
  `CLAUDE.md`/`README.md` only as context, previews the issue and runs `gh issue create --body-file` after confirmation.
  With `#<number>` it rewrites that issue instead, with `gh issue edit --body-file`. It creates missing labels the user
  picked (`gh label create`), never on its own.
- `/datalogix:pr` (`pr/SKILL.md`) is a single prompt-only file in Portuguese. It runs test/lint scripts only when the
  user picks them. Only after confirmation does it push the branch (if the user checked it, never with `--force`)
  and run `gh pr create --body-file`. Without an issue it can create one by
  reading and following `../issue/SKILL.md` from its step 2 (the issue skill has `disable-model-invocation`, so it
  cannot be invoked as a skill): renumbering the issue skill's steps breaks that reference.
- `/datalogix:commit` (`commit/SKILL.md`) is a single prompt-only file in Portuguese. It commits what is staged;
  with nothing staged it lists the changed files (`git status --porcelain -uall`), unchecked, and stages only the
  ones checked (never `git add -A`). It may split the commit, unstaging with `git restore --staged` (or
  `git rm --cached` before the first commit), never `reset --hard`/`checkout`, and only when no staged file has
  unstaged changes. It adds an authorship trailer only when the session's instructions ask for one, runs
  `git commit -F` after confirmation, never with `--amend`/`--no-verify`, and never pushes.
- `/datalogix:ci` (`ci/SKILL.md`) is a single prompt-only file in Portuguese. It reads the failed jobs' logs with `gh`
  (the run of the current or pull request head commit, else the branch's latest failed run), applies only the
  fixes the user checks, and only if checked reproduces a failure locally or reruns the failed jobs
  (`gh run rerun --failed`); it never commits, pushes or comments.
- These skills end their previews and questions with a `## Pendências` list in the format `topics` parses
  (`mods/topics/hooks/parse.ts`), and `/datalogix:review` uses the same format when `topics` is active (its
  `SKILL.md` section 7); keep them in sync. `tests/skills.test.js` runs every item written in a code span in a
  `SKILL.md` through `parseActions`, and checks that pr and commit still find the issue skill's step 2 and its
  "Idioma" item.
- `/datalogix:issue`, `/datalogix:pr` and `/datalogix:commit` take the language of issues, pull requests and commits
  from a `- Issues and pull requests: <language>` line in the target project's `CLAUDE.md` (pr and commit by
  following the "Idioma" item of the issue skill's step 2). Without it they ask (Portuguese suggested) and, only if
  the user checks it, append that line to the local `CLAUDE.md`, the one write they make there.
- `/datalogix:review` is a prompt-only skill, written in Portuguese.
  - `SKILL.md` drives the flow.
  - `types/` holds the rules per project type (`package`, `application`), including the step order.
  - `steps/` has one checklist per step; `http` and `jobs` are extra checklists that the `code` step applies.
  - `modes/` holds the focus modes.
  - `templates/LICENSE` must stay identical to the root `LICENSE`, which `tests/license.test.js` enforces.
- Several rules follow `datalogix/workflows`; check it before changing them:
  - `/datalogix:review`: the reusable workflows for CI, scripts, Pint/ESLint/Prettier, Pest/Vitest and Testbench;
  - `/datalogix:issue`: the `claude`/`claude-plan` labels (inputs of `.github/workflows/claude.yml`), the `task`
    label (`docs/task-manager.md`) and the `rollback` label (`.github/workflows/project.yml` and `deploy.yml`), created
    with the colors and descriptions of `cli/kinds/project/state.js`, and the issue forms (`examples/issue-templates/`);
  - `/datalogix:issue`, `/datalogix:pr` and `/datalogix:commit`: Portuguese as the suggested language, with the
    Conventional Commits type in English (`plugins/laravel/skills/conventions/SKILL.md`);
  - `/datalogix:ci`: the checks it fixes and leaves alone follow `plugins/laravel/commands/fix-ci.md` and
    `.github/workflows/claude-fix-ci.yml`;
  - `/datalogix:pr`: the pull request sections and title rules of `plugins/laravel/skills/conventions/SKILL.md`, and
    the `no-review` label (`cli/kinds/project/state.js`, `.github/workflows/claude-review.yml`).
- Review progress lives in `~/.claude/reviews/`, outside the repo.

## Conventions

- Prettier skips `*.md` on purpose, because reflowing changes the meaning of the skill's lists. Wrap skill Markdown by
  hand at about 72 columns and match the surrounding style.
- `.editorconfig` (from `datalogix/workflows`): UTF-8, LF, 2-space indent, final newline; `*.md` keeps trailing
  whitespace.
- Code, comments, README and `docs/` are in English. Skill content and mod UI strings are in Portuguese.
- JS is ESM with JSDoc types (`// @ts-check` style), and mods are TypeScript. Prettier settings: no semicolons, single
  quotes, width 120.
- Don't keep copies of these skills in a project's `.claude/skills/` or `.claude/commands/`: they would show up next to
  `/datalogix:<name>` and drift from it.
