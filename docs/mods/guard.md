# guard

Refuses, before it runs, a Bash command that reads a secret file, wipes
a Laravel database or rewrites remote git branches. It closes what
`permissions.deny` rules for Read and Edit leave open, above all with
`defaultMode: bypassPermissions`: the same file read through `cat`, or a
destructive command, in Bash.

It also asks before a push to `main` or `master` (see "What it asks
about"), so a push of a branch needs no `ask` rule.

Unlike `worktree`, which adds an instruction Claude may miss, this is a
real block: a `tool.call` hook refuses the call and Claude receives the
reason as the tool's error, in Portuguese, saying what was blocked and
that you can run it yourself. It works in subagents too.

## What it blocks

- **Secret files** read by `cat`, `tac`, `less`, `more`, `head`,
  `tail`, `grep`/`egrep`/`fgrep`, `rg`, `ag`, `sed`, `awk`, `bat`,
  `strings`, `xxd`, `od`, `hexdump`, `base64`, `nl`, `cut`, `sort`,
  `uniq`, `diff`, `jq`, `source` or `.`, or sent by `curl` (`@file`,
  `-T`), `wget` or `scp`, and any command whose input is redirected
  from one (`< .env`). The files: `.env` and `.env.*` (also a glob such
  as `.env*`), `auth.json` (`~/.composer/auth.json` included), `*.pem`,
  `*.key` under `storage/` (Laravel's OAuth keys), `id_rsa*` and
  `id_ed25519*`, anything under `.ssh/`, `~/.config/gh/hosts.yml` and
  `~/.npmrc`.
- **Destructive artisan commands**: `migrate:fresh`, `migrate:refresh`,
  `migrate:reset`, `migrate:rollback` and `db:wipe`, also abbreviated
  (`migrate:f`), through `php artisan`, `artisan`, `./artisan`,
  `sail artisan`, `./vendor/bin/sail artisan`, `herd php artisan`,
  `docker compose exec <service> php artisan` or `docker exec ... php
  artisan`.
- **Force pushes and remote deletions**: `git push` with `-f`,
  `--force`, `--force-with-lease`, `--force-if-includes`, `--delete`,
  `-d`, `--mirror` or `--prune` in any position (a cluster such as
  `-uf` too), a `+` refspec (`git push origin +HEAD:main`) or one
  starting with `:` (`git push origin :feature`).

## What it asks about

A push that reaches `main` or `master` is not refused but put to you,
even with `defaultMode: bypassPermissions`: a `tool.check` hook answers
`ask`, with the reason in the dialog. That is:

- a push naming one as its destination (`git push origin main`,
  `HEAD:main`, `feature:refs/heads/master`);
- a push of the current branch (`git push`, `git push -u origin HEAD`)
  when that branch is `main` or `master`, read with
  `git branch --show-current` in the session's folder, or in the folder
  of `git -C <folder>`;
- `git push --all` or `--mirror`, which push every branch;
- a push after a `cd` in the same command line, whose folder it cannot
  tell.

A push of another branch, from a branch checkout or a worktree, keeps
the decision it had (in `bypassPermissions`, it runs), and so does
`git push --tags`. If reading the branch fails, it asks.

The command is split into shell words, quotes aware, so it finds these
in every part of `&&`, `||`, `;` and pipes, in `$( )` and backticks, in
`bash -c`/`sh -c` and `eval` strings, and after `sudo`, `env`, `xargs`
or leading `VAR=value` assignments. Heredoc bodies and quoted text are
not commands: a commit message that mentions `git push --force` passes.

## What it allows

- The examples: `.env.example`, `.env.*.example`, `.env.dist` and
  `.env.sample`.
- Copying, moving or linking a secret file (`cp`, `mv`, `ln`), which
  `.worktreeinclude` and scripts rely on, and appending to one
  (`echo X >> .env`).
- Searching for the text: the first argument of `grep`, `rg`, `ag`,
  `sed` and `awk` is a pattern or a script, not a file, so
  `grep -rn .env config/` passes.
- A quiet `grep` (`grep`, `egrep` or `fgrep` with `-q`, `--quiet` or
  `--silent`, also in a cluster such as `-qE`), which prints nothing:
  `grep -q '^APP_KEY=$' .env` checks a value without showing it.
  `grep -c` still counts as a read, as do a quiet `rg` and input
  redirected from a secret file (`grep -q KEY < .env`).
- `env` and `printenv`, `php artisan migrate`, `migrate:status`,
  `db:seed` (with `--force` too) and every other artisan command, and a
  regular `git push` (`git push -u origin feature/fix-login`).

It is a guard against slips, not a sandbox. It does not see a file read
through a variable (`f=.env; cat $f`), a script or another language
(`python -c "open('.env')"`), `find -exec`, a recursive search with no
file named (`grep -r APP_KEY .`), a git alias or a `git push` run
through `docker exec`.

## Running a blocked command

Run it yourself in the prompt with `!`, e.g. `!php artisan migrate:fresh
--seed`: the command runs in the session's shell without going through
Claude's tools, so the guard does not see it, and its output joins the
conversation.

## Turning it off

There are no options. To turn the guard off, unselect the mod with the
installer's `--configure`.

To get this mod on a machine that already has others, run the installer:
it offers the mod, selected by default.
