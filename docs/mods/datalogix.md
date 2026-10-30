# datalogix

Ships the skills, so they are invoked as `/datalogix:<name>`. Skills are
prompts in Portuguese, one folder each under `mods/datalogix/skills/`;
this mod has no hooks, so it has no `claude plugin test` in the
`test` script; `tests/skills.test.js` and `tests/license.test.js`
check its skills.

- `review/` — `/datalogix:review`: step-by-step review of Laravel
  packages and applications, JS/TS libraries and Nuxt/Next
  applications. Run `/datalogix:review help` for details.
  After each step it suggests one commit per feature or fix
  (refactoring and formatting apart), in the commits' language
  (below), as unchecked boxes. The ones you check are made through
  `/datalogix:commit`'s flow, which it reads and follows from step 2
  after its step 1 state checks: one preview, nothing committed before
  you confirm, never a push; their hashes go in the progress file.
  Checking "Seguir para a próxima etapa depois dos commits" moves on
  once they are all made; when the project type checks git before
  each step, they must all be made first. It
  never runs `/code-review` itself: the closing step, and the end of a
  single step or a focus mode, tell you to run it on the changes in a
  new session, so the review is not the only one checking its own
  work.
  - `SKILL.md` — the command itself
  - `types/` — rules per project type (`package`, `application`,
    `library`, `web-app`)
  - `steps/` — one checklist per review step, plus extra checklists
    (`http`, `jobs`) applied in the `code` step; the JS types use
    `code-js` and `production-js` for their `code` and `production`
    steps, and `pack` instead of `install`
  - `modes/` — focus modes (`docs`, `naming`, `tests`, `deps`) and the
    `report` mode
  - `templates/LICENSE` — license model for packages; must match the
    root `LICENSE` (checked by `tests/license.test.js`)
- `issue/` — `/datalogix:issue`: turns a free-form task description into
  a GitHub issue split by responsibility, using the project's
  `CLAUDE.md` and `README.md` as context. It checks for duplicates
  among open and closed issues (commenting on one adds only what is
  new) and follows the project's issue templates, or the
  organization's in `<owner>/.github`. It fixes the description's
  spelling and keeps every piece of information, copying errors,
  logs, code and names as they are. The preview lets you pick labels
  (suggested ones are marked as suggestions; missing ones you pick
  are created, `claude`, `claude-plan`, `rollback` and `task` with
  the `datalogix/workflows` colors and descriptions) and optionally
  add `claude` or `claude-plan` to trigger the `datalogix/workflows`
  Claude workflow. `rollback`, which rolls production (or staging,
  with `env:staging`) back as soon as the issue is created, is never
  suggested and comes last, unchecked. The issue is created with `gh`
  only after confirmation. `/datalogix:issue #123` rewrites an
  existing issue the same way, keeping its labels except the ones
  you check to remove, and warns when the current repository is a
  fork, since a bare `#123` points at the fork's issue. Run
  `/datalogix:issue help` for details.
- `pr/` — `/datalogix:pr`: opens the current branch's pull request in
  the format of Claude's pull requests in `datalogix/workflows`: a
  Conventional Commits title and _Resumo_, _Motivação_ (with
  `Closes #<number>`), _Plano de Testes_ and _Observações_, or the
  project's pull request template. It finds the issue from the
  argument or the branch name (a number taken from the branch is
  always confirmed: suggested when the commits match the issue's
  title, unchecked with a warning otherwise), checks the
  diff against its acceptance criteria and asks what was tested
  (offering to run the project's test and lint scripts, never ones
  that change files). Without an issue, it asks for the motivation
  (an answer is optional) and can create the issue first with
  `/datalogix:issue`. Only after confirmation does it push the
  branch, if you checked that, never with `--force`, and create the
  pull request with `gh`. Run `/datalogix:pr help` for details.
- `commit/` — `/datalogix:commit`: commits the staged changes with a
  Conventional Commits message, following the project's recent
  commits (e.g. whether it uses a scope). With nothing staged, it
  suggests one commit per feature or fix, unchecked, and makes only
  the ones you check, all shown in one preview and confirmed at once
  or one by one; you can also make a single commit of everything, or
  pick the changed files one by one. It never stages with `git add
  -A`, and cancelling unstages what it staged. `grupos: <title>
  (<files>); ...` starts from a given split, as `/datalogix:review`
  shows it. The preview also points out files that look generated
  (`dist/`, `vendor/`, minified files). The preview points out
  a commit that depends on an unchecked one, and one whose content,
  split by hunk, was never tested.
  It warns about changes left out of the commit, commits straight to
  the default branch and parts of the diff that look sensitive, and
  suggests splitting a diff that mixes unrelated changes (not when a
  staged file also has unstaged changes). A file with changes for
  more than one commit is split by hunk (`git apply --cached`), never
  touching the working tree. It adds an authorship trailer only when
  the session's instructions ask for one, and shows it in the
  preview. Only after confirmation does it run `git commit -F`, never
  with `--amend` or `--no-verify`, and it never pushes. Run
  `/datalogix:commit help` for details.
- `ci/` — `/datalogix:ci`: diagnoses the latest failed CI run of the
  current branch, of a pull request (`#<number>`) or a given run,
  looking first at the run of the current (or the pull request's head)
  commit. A run that passed stops it, one still in progress is diagnosed
  from the jobs that already failed, and a run link from another
  repository is refused. It reads only the failed jobs' logs and
  classifies each failure as caused by the change, pre-existing, flaky
  or infrastructure. For failures the change caused in the code checks
  (Pint, PHPStan, Pest/PHPUnit, the `lint`, `test`, `typecheck` and
  `build` scripts, `composer audit`) it proposes fixes, applies only the ones
  you check and runs just what failed to validate them. Only if you
  check them does it reproduce a failure locally (when no log can be
  read) or rerun the failed jobs (`gh run rerun --failed`). It never
  commits, pushes or comments; on `claude/` branches,
  `datalogix/workflows`' `claude-fix-ci` already fixes failures on its
  own. Run `/datalogix:ci help` for details.

`/datalogix:issue`, `/datalogix:pr` and `/datalogix:ci` need the
[`gh`](https://cli.github.com) CLI, logged in with access to the
repository. `/datalogix:issue`, `/datalogix:commit` and
`/datalogix:pr` write in the language set in the project's
`CLAUDE.md` (e.g. `- Issues and pull requests: Portuguese`), which is
also the commits' language; without it, they ask, suggesting
Portuguese, and offer to add that line to `CLAUDE.md`. Conventional
Commits types stay in English. The previews and questions of issue,
pr, commit and ci end with a `## Pendências` list (`/datalogix:review`
uses it only when `topics` is active), answered in place when the
[topics](topics.md) mod is installed. Only the boxes you check
apply: a box a preview wrote checked is a suggestion, which `topics`
shows unchecked, so leaving one alone never removes anything.
`tests/skills.test.js` checks that every item the skills describe
parses as one.

Earlier versions copied these skills into `~/.claude/skills/` as
`/review` and `/issue`, with a `.claude-config` marker (or linked them
with `--link`). `install` and `update` install `datalogix` and only then
remove those folders; folders the installer did not create are left
alone. If `datalogix` could not be installed, they stay
(`kept: ...`) and running the command again replaces them. With
`install`, unchecking `datalogix` also removes them. If a folder
cannot be read or removed, the error is reported, the rest of the run
goes on and it ends with "Finished with errors".

To add a skill, create `mods/datalogix/skills/<name>/SKILL.md`; it needs
no registration.
