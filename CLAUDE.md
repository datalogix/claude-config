# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`claude-config`: Datalogix's Claude Code setup, installed with
`npx --allow-git=root github:datalogix/claude-config#main` (no npm publish). It ships mods, i.e. Claude Code plugins
(`mods/`), including the `datalogix` mod that holds the skills, plus the installer that puts them in place
(`bin/cli.js`).

## Commands

```bash
npm install
npm test                                  # Vitest for tests/ + `claude plugin test` per mod with hooks (needs claude)
npx vitest run tests/cli-install.test.js  # one installer test file
npx vitest run tests/cli-update.test.js -t "renamed"  # installer tests whose name matches
claude plugin test mods/topics            # one mod's tests (*.test.ts/tsx under the folder)
npm run lint                              # eslint . && prettier --check .
npm run format                            # prettier --write . && eslint . --fix
node bin/cli.js --link                    # install from this clone: edits apply after /reload-plugins
```

`claude plugin validate` warns that mods have no `version`; that is intended (see below).

## CI

- `.github/workflows/ci.yml` runs `npm run lint` and actionlint (`ACTIONLINT_VERSION`, bumped by hand) in `lint`, on
  Ubuntu and the LTS Node, and `claude plugin validate` for the root and each mod plus `npm test` in `test`, on Ubuntu
  (Node 22 and LTS), installing the latest Claude Code. It also runs weekly (`schedule`), so a Claude Code release
  that breaks something shows up without a push. The `windows` job runs only `tests/quote.test.js`,
  `tests/quote-cmd.test.js` and `tests/options.test.js`, which need no fake `claude` shell script, and
  `node bin/cli.js --help`. `tests/mods.test.js` checks that the test files it names exist. The `minimum-node` job
  installs only the runtime dependencies on Node 22.0.0 and runs `node bin/cli.js --help` and `update` with no `claude`:
  `engines.node` is the runtime's minimum, and the dev tools need `^22.13.0`, `^24` or `>=26`.
- `all-checks` aggregates the jobs; nothing requires it, since `main` has no branch protection. Add a new job to its
  `needs`.
- Dependabot (`.github/dependabot.yml`), each in one group: GitHub Actions weekly (`ci:` commits), npm monthly
  (`chore:`), ignoring majors of `@types/node`, which stays at the minimum Node (`engines.node`), and of `typescript`,
  since typescript-eslint does not support TS 7.
- `@clack/prompts`, the only runtime dependency, is pinned exactly to the version CI tests: the lockfile does not reach
  whoever installs with `npx`, so a range would ship a new 1.x untested. Dependabot still bumps it, through CI.

## Architecture

### Installer (`bin/`)

- One command (`run`), with `--link` and `--configure`; `install` and `update` are accepted as its name, with the same
  result (`update` takes no flag). Nothing of this marketplace installed, or `--configure`: asks every mod and option
  and uninstalls an unselected mod; without a terminal, installs every mod. Otherwise it updates what is installed
  without asking and offers only the mods not installed yet, selected (`newMods`), and asks only their options; without
  a terminal it offers nothing. A new option of an installed mod is not asked: an option answered with its default is
  not stored, so nothing tells it from a new one, and asking would repeat on every run. Nothing records a refused mod
  either, so it is offered again. Unknown commands or flags are errors. Any failed step ends with
  "Finished with errors" and exit code 1.
- Failing to list the installed mods or the marketplaces (`runClaudeList`), or a reply that is not a JSON list of items
  with their `id` or `name`, is a failure that stops the mods part of the run, since an empty list would read as
  nothing installed. Failing to read a mod's options (`plugin configure --json`) is a failure that skips configuring
  that mod; a reply without an `inputs` object only warns and skips it too. Cancelling a prompt ends with the run's
  closing hint (`reloadHint`): `/clear`, and `/reload-plugins` when a mod already changed (`hasModChanges`).
- Every run updates the marketplace (only when it was already added, and not when every mod was left unselected) and
  the mods already installed (`updateMarketplace`, `updateMod`). It logs `updated: <name>`, and a failed marketplace
  update still updates the mods. A failed update still asks for the mod's options with `--configure`. Without
  `--link`, the marketplace updates from whatever source it has. Messages and failures show a URL without its credentials
  (`withoutCredentials`). With `--link`, one added from elsewhere is only pointed out: neither it nor the mods are
  updated, and an installed mod with nothing to configure logs `unchanged: <name>`, unless its options could not be read
  (`hasReadFailed`), which is already reported. A marketplace with no readable source (no text in its source fields)
  still updates. A mod also loaded from a skills folder (`<name>@skills-dir` in `plugin list`) is pointed out.
  `plugin list` also lists installs in other scopes, such as other projects': only the user scope of this
  marketplace's mods counts as installed (`listInstalledModIds`), so the installer neither updates nor uninstalls
  those, and installs the mod in the user scope. An install in the current project's scope (`projectPath`) is pointed
  out.
- It no longer writes skills. Earlier versions copied them into `~/.claude/skills/<name>` with a `.claude-config`
  marker (or symlinked them with `--link`); `removeOldSkills` deletes those folders, and only those, once the
  `datalogix` mod (`SKILLS_MOD`) is installed or unselected. A run with mods installed installs `datalogix` when such
  folders exist. Failing to read or remove one is reported with `reportFailure` and does not stop the run.
- Mods go through the `claude` CLI, never by writing Claude Code's files directly (`warnOldOptions` only reads
  `settings.json`, from `$CLAUDE_CONFIG_DIR` when set, else `~/.claude`). The installer calls
  `claude plugin marketplace add/list/update`, `plugin install/uninstall --keep-data/update/list --json` and
  `plugin configure --json/--values-stdin`, using the marketplace `datalogix/claude-config` (or the clone with
  `--link`).
- Option answers go through stdin, never argv.
- Renamed mods (`RENAMED_MODS`): the new name is installed first and the old one is uninstalled with `--keep-data`
  only after that succeeds. Renamed options are not carried over: `plugin configure --json` returns only the keys
  the userConfig declares, so values stored under an old key never reach the installer. `warnOldOptions` reads
  them from `pluginConfigs` in that `settings.json` and warns with their values. Without `--configure`, the new name
  (and `datalogix` for old skills, `listReplacementMods`) is installed, unasked, only after the marketplace update
  succeeded, since an older marketplace may not list it yet.
- The migration code (`RENAMED_MODS`, `removeOldSkills` and the old skills handling in `run`, `warnOldOptions`)
  is temporary: remove it, with its tests and docs, once every team machine has run the installer once. Whether that
  happened is the user's call; ask before removing it.
- It stores only the options already configured (`configured` in `plugin configure --json`; a reply without
  `configured` counts as configured each option whose value differs from this checkout's default, `configuredKeys`)
  and answers that differ from the default (`valuesToStore`, `bin/options.js`), so a default nobody chose stays
  unstored and a later change of default reaches it. Without a usable default, that compares with what the question
  starts from: `false` for a boolean, the first choice for a select. The question for an option never configured
  starts from the default in this checkout's `plugin.json` (`initialValue`), not the one `plugin configure --json`
  reports for the installed version. A select whose configured value is not one of its choices starts from that
  default too (`defaultChoice`), or from its first choice if the default is not one either.
  `optionChanges` decides whether anything needs storing, and `configured: <name>` is logged only after
  `plugin configure --values-stdin` ran.
- On Windows, when `claude` resolves to npm's `claude.cmd`, it is run through `cmd` with `cmdLine`/`quoteForCmd`
  (`bin/quote.js`). `tests/quote-cmd.test.js` checks that quoting, stdin reaching the program behind the shim and this
  fallback (running `update`) against the real `cmd.exe`, through a fake `claude.cmd` shaped like npm's shim, on the
  `windows` CI job only.
- Every `claude` call (`runClaude`) has a timeout (`CLAUDE_TIMEOUT_MS`, 120s; tests lower it with
  `DATALOGIX_CLAUDE_TIMEOUT_MS`) that sends SIGTERM, so it can clean up, and SIGKILL 5s later (`spawnClaude`), and runs
  with `GIT_TERMINAL_PROMPT=0`, so a hung network call or a git asking for credentials fails the step instead of
  freezing the installer. After `exit`, it waits for `close`, which has all the output, for `CLAUDE_CLOSE_GRACE_MS`
  (5s), since a child of `claude` may hold the output open. A `claude --version` that times out is such a failure
  (`checkClaudeCli`); any other failure of it means the CLI is not installed, which only warns and skips the mods.
- `tests/cli-install.test.js` and `tests/cli-update.test.js` run the real CLI without a TTY, with a temporary `HOME`
  and a fake `claude` shell script on `PATH` that logs its arguments; `tests/cli-interactive.test.js` runs the
  prompts in process, with `@clack/prompts` mocked and the status mod's options fixed. The shared setup is in
  `tests/helpers/cli.js` (`useTempHome`, `fakeClaude`, `installedMods`, `runCli`). The fake is one executable,
  `tests/helpers/fake-claude`, which sources each test's replies: macOS assesses every new executable on its first
  run, which took seconds per test. New installer behavior is tested the same way; pure helpers (`bin/options.js`,
  `bin/quote.js`) are unit-tested directly (`tests/options.test.js`, `tests/quote.test.js`).
  `tests/cli-install.test.js` also runs the CLI from a copy holding only `package.json` and its `files`: a new file the
  installer reads at runtime must be listed there.

### Mods (`mods/<name>/`)

- One mod has no folder here: `core`, a `git-subdir` entry of the marketplace pointing at `plugins/core` of
  `datalogix/workflows`, with no `ref`, so it follows that repository's default branch. The installer takes its
  description from the entry and asks no options (`listMods`), and warns when `core@datalogix`, the same plugin from
  that repository's own marketplace, is installed too (`OTHER_MARKETPLACE_IDS`). The stack plugins (`laravel`, `js`)
  stay out: in the user scope they would load in every project, and their `fix-ci` pushes on its own. The rules below
  are for the mods in `mods/`; `tests/mods.test.js` pins the `core` entry.
- Each mod has `.claude-plugin/plugin.json` and, except `datalogix`, `hooks/hooks.json`. The latter lists the TS/TSX
  modules (`{ "modules": ["./register.tsx"] }`), which import from `'claude-code'`. Tests sit next to them as
  `*.test.ts(x)`, use `'claude-code/testing'` and run only with `claude plugin test`, never with Vitest
  (`vitest.config.js` limits Vitest to `tests/`). The one exception: `tests/skills.test.js` imports
  `mods/topics/hooks/parse.ts` under Vitest, so that file must not import `'claude-code'`. Vitest loads no tsconfig
  (`oxc: { tsconfig: false }` in `vitest.config.js`): the mod's extends the generated types, which do not exist
  until Claude Code loads the mod (`--plugin-dir` or the mods folder), so in CI it would fail.
- There is no `typecheck` script: the mods' types are generated by Claude Code and not in git, and
  `claude plugin test` neither generates nor checks them: it checks the mods' behavior.
- Mods that keep plugin state declare it in `types/index.d.ts` (augmenting `PluginState`) and point to it from the
  `types` field of `plugin.json`.
- `mods/*/.claude-plugin/types/` is generated by Claude Code. It is git- and eslint-ignored, and the `tsconfig.json` of
  each mod with hooks extends it.
- Never add `version` to `plugin.json` or to the marketplace entry. Without it, the commit SHA is the version, so every
  push reaches `update`.
- `worktree` only adds an instruction to the system prompt (`prompt.compose`), so Claude asks before the first file
  change of a task and calls `EnterWorktree`, after a `git fetch origin`, since a worktree starts from the remote's
  default branch. Its tests check that the text is there, not that Claude follows it.
- A new mod needs (`tests/mods.test.js` checks these, plus `name` equal to its folder, no `version` and, with a `types`
  field, that its file exists):
  - `"license": "MIT"` and `"author": { "name": "datalogix" }` in its `plugin.json`;
  - an entry in `.claude-plugin/marketplace.json`;
  - `hooks/hooks.json` (only `datalogix` has none) and a `tsconfig.json` that extends
    `./.claude-plugin/types/tsconfig.json`;
  - a `claude plugin test mods/<name>` added to the `test` script (the command fails for a mod without hooks).
- `mods/status/hooks/register.ts` copies `FENCE`, `QUOTE`, `LIST_ITEM`, `TABLE_ROW`, `HTML_COMMENT`, `CHECKBOX`,
  `CODE_MARK`, `INLINE_MAX`, `isSkippedLine`, `plainText` and `createCodeBlockTracker` (a block also ends with the list
  item or the quote that opened it, and an indented fence ends at a line at column 0 only inside a list, where its
  closing fence then opens nothing: outside one, CommonMark keeps it open) from `mods/topics/hooks/parse.ts`, since each mod installs on its own: change both. `tests/mods.test.js`
  compares them, the tracker apart from what it returns.
- `topics` parses the `## Pendências` format (the last such topic; checkbox/radio items, a stance mark,
  `(recomendo)`, `(não recomendo)` or `(avalie)`, an item's first `ver:` matched to a topic title ignoring case,
  accents, backticks and bold/italics, the first matching topic winning) in `hooks/parse.ts`. An item the answer writes
  checked (`isSuggested`) starts unchecked, as a suggestion; a `(recomendo)` item starts checked (`defaultChecked`, one
  per radio group), so sending as is approves it. Keep it in sync with the format `docs/mods/topics.md` documents.
  In the code, `Actions` is the whole list; in the docs and the instruction, an action is what one item asks.

### Skills (`mods/datalogix/skills/`)

- Skills ship in the `datalogix` mod, so they are invoked as `/datalogix:<name>`. Each folder with a `SKILL.md` is a
  skill, found by Claude Code with no registry to update. Refer to them by the full name in skill text and docs.
- Supporting files are found from `${CLAUDE_SKILL_DIR}`, the skill's own folder.
- `/datalogix:issue` (`issue/SKILL.md`) is a single prompt-only file in Portuguese. It reads the target project's
  `CLAUDE.md`/`README.md` only as context, previews the issue and runs `gh issue create --body-file` after confirmation.
  With `#<number>` it rewrites that issue instead, with `gh issue edit --body-file`. It creates missing labels the user
  picked (`gh label create`), never on its own. Only if checked, after creating an issue in the current repository, it
  creates its branch with `git switch -c <type>/<number>-<slug> --no-track origin/<default>`: without upstream,
  `/datalogix:pr` offers the push. The pr skill's issue creation skips that question.
- `/datalogix:pr` (`pr/SKILL.md`) is a single prompt-only file in Portuguese. It runs test/lint scripts only when the
  user picks them. Only after confirmation does it push the branch (if the user checked it, never with `--force`)
  and run `gh pr create --body-file`. With an open pull request for the branch it follows its section 9 instead,
  rewriting _Resumo_ and _Plano de Testes_ and keeping the rest, with `gh pr edit --body-file`. Without an issue it can create one by reading and following
  `../issue/SKILL.md` from its step 2 (the issue skill has `disable-model-invocation`, so it cannot be invoked as a
  skill): renumbering the issue skill's steps breaks that reference.
- `/datalogix:commit` (`commit/SKILL.md`) is a single prompt-only file in Portuguese. It commits what is staged;
  with nothing staged it suggests commits grouped by feature or fix, unchecked, plus one commit of everything or
  the changed files of `git status --porcelain -uall` one by one, unchecked, and stages only what is checked (never
  `git add -A`); cancelling unstages what it staged. It may split the commit, unstaging with `git restore --staged`
  (or `git rm --cached` before the first commit), never `reset --hard`/`checkout`, and only when no staged file
  has unstaged changes. Parts of a file go to different commits through `git apply --cached` with a patch of whole
  hunks, never `git add -p` and never touching the working tree. A split shows every commit in one preview,
  confirmed all at once or one by one; `grupos: ...` seeds the groups with a split the user already has. It adds an
  authorship trailer only when the session's instructions ask for one, runs `git commit -F` after confirmation,
  never with `--amend`/`--no-verify`, and never pushes.
- A branch whose last segment is only a date (`review/2026-11-01`) is handled by the "Branch com data" item of the
  commit skill's step 1, which pr and review follow: it asks whether to keep the name and renames with
  `git branch -m`; a branch already on the remote only gets a warning, and the remote one is never deleted.
- `/datalogix:ci` (`ci/SKILL.md`) is a single prompt-only file in Portuguese. It reads the failed jobs' logs with `gh`
  (the run of the current or pull request head commit, else the branch's latest failed run), applies only the
  fixes the user checks, and only if checked reproduces a failure locally or reruns the failed jobs
  (`gh run rerun --failed`); it never commits, pushes or comments.
- These skills end their previews and questions with a `## Pendências` list in the format `topics` parses
  (`mods/topics/hooks/parse.ts`), and `/datalogix:review` uses the same format for its reports when `topics` is active
  (its `SKILL.md` section 7) and always for the outdated base and dated branch questions and the commit flow; keep them
  in sync.
  `tests/skills.test.js` runs every item written in a code span in the skills' Markdown files through `parseActions`,
  refuses one outside a span or cut short by a backtick inside it and requires each `SKILL.md` to have items and the
  `## Pendências` title. It also pins what one skill relies on in another (the issue skill's step 2 and "Idioma" item;
  the commit skill's steps 1 and 2, "Branch com data", `grupos:` and "Com grupos marcados"), compares the text the
  skills keep in copies, since each is read alone, and checks that every step in review's type files has its checklist,
  that every file review names exists and that the bare names in `steps/` are files of that folder.
- `/datalogix:issue`, `/datalogix:pr` and `/datalogix:commit` take the language of issues, pull requests and commits
  from a `- Issues and pull requests: <language>` line in the target project's `CLAUDE.md` (pr and commit by
  following the "Idioma" item of the issue skill's step 2). Without it they take the `language` input the project's
  workflows pass to `datalogix/workflows` (`claude.yml` without it means `pt-BR`), when every call agrees, and only then
  detect the language from the default branch's latest commit titles (at least 5, more than three quarters in one language). Only when in doubt do they
  ask (Portuguese suggested) and, only if the user checks it, append that line to the local `CLAUDE.md`, the one write
  they make there. `/datalogix:review` follows the same item for the commit messages it suggests and records the
  result in the progress file ("Decisões do projeto"); it never falls back to a language silently.
- `/datalogix:review` is a prompt-only skill, written in Portuguese.
  - `SKILL.md` fetches the default branch at the start of a session. A branch behind it gets a `git pull --ff-only`
    offer when it is the default branch with a clean tree (outside `report`), and only a warning otherwise.
  - `SKILL.md` drives the flow. It makes the commits the user checks at the end of a step by reading and following
    `../commit/SKILL.md` from its step 2 (commit has `disable-model-invocation` too), with the checked commits as
    step 1's groups: renumbering the commit skill's steps breaks that reference.
  - `types/` holds the rules per project type, including the step order: `laravel-package` and `laravel-app`,
    `js-library` and `js-app` (Nuxt, Next, Vue or React with Vite, and Node in one type, with a section per framework
    where they differ). The JS types reuse the shared steps, which have sections for them, and use `code-js`; `js-app`
    adds `production-js` and `js-library` adds `pack`. Their `ci` step reviews the `datalogix.yml` with `stack: js`
    (`project.yml` for apps, `package.yml` for libraries); only a Node app without a UI, which that stack does not
    cover, keeps its own CI workflow. `production-js` checks only what the `check` leaves out of a `deploy: vercel` or `deploy: netlify`.
  - `steps/` has one checklist per step; `http` and `jobs` are extra checklists that the `code` step applies.
  - `modes/` holds the focus modes and the `report` mode.
  - `templates/LICENSE` must stay identical to the root `LICENSE`, which `tests/license.test.js` enforces.
- Several rules follow the latest version of `datalogix/workflows`: its highest `v<N>` branch or tag, not the default
  branch or the latest release, which can be older. Check it before changing them:
  - `/datalogix:review`: the reusable workflows for CI, scripts, Pint/ESLint/Prettier, Pest/Vitest and Testbench, the
    JS stack (`node-app-tests.yml`, `node-package-tests.yml`, `docs/js/`) and the Vercel and Netlify deploys (`docs/deploy.md`);
  - `/datalogix:issue`: the `claude`/`claude-plan` labels (inputs of `.github/workflows/claude.yml`) and the `rollback`
    label (`.github/workflows/project.yml` and `deploy.yml`), created with the colors and descriptions of
    `cli/kinds/project/state.js`, the `task` label (`docs/task-manager.md`; its color and description are the skill's
    own), and the issue forms (`examples/issue-templates/`);
  - `/datalogix:issue`, `/datalogix:pr` and `/datalogix:commit`: Portuguese as the suggested language, with the
    Conventional Commits type in English (`plugins/core/skills/conventions/SKILL.md`), and the `language` input of
    `.github/workflows/claude.yml` and `release-pr.yml`;
  - `/datalogix:ci`: the checks it fixes and leaves alone follow `plugins/laravel/commands/fix-ci.md` and
    `.github/workflows/claude-fix-ci.yml`, plus the `build` script, which those do not run (for JS projects' own CI);
  - `/datalogix:pr`: the pull request sections and title rules of `plugins/core/skills/conventions/SKILL.md`, and
    the `no-review` label (`cli/kinds/project/state.js`, `.github/workflows/claude-review.yml`).
- Review progress lives in `~/.claude/reviews/`, outside the repo, one file per repository, shared by its worktrees.

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
- Issues and pull requests: English
