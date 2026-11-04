# claude-config

Claude Code configuration from datalogix, shared across machines and
projects.

## Mods

Each mod is selected during install; its options can be changed by running
the installer again or with `/config`.

- [datalogix](docs/mods/datalogix.md) — the skills `/datalogix:review`,
  `/datalogix:issue`, `/datalogix:commit`, `/datalogix:pr` and
  `/datalogix:ci`
- [steps](docs/mods/steps.md) — shows the current step under Claude's
  spinner instead of the tool rows
- [status](docs/mods/status.md) — status line and notices (toast and
  system notification) when an answer or the background agents finish
- [topics](docs/mods/topics.md) — answers split into closed topics, with
  a `## Pendências` list to answer in place
- [worktree](docs/mods/worktree.md) — asks whether to create a git
  worktree before changing files

## Install

Needs Node 22+, git and the `claude` CLI (without it, the installer
skips the mods). It is installed straight from GitHub, with no npm
publish.

```bash
npx --allow-git=root github:datalogix/claude-config#main
```

Mods come from the GitHub marketplace `datalogix/claude-config`.

`--allow-git=root` is required since npm 12, which refuses packages from
git by default (`EALLOWGIT`); older npm versions ignore it.

This runs the default command, `install`. It asks which mods to install,
all selected by default, and the options of each mod (`userConfig`).
Only the options you change from the default are stored, so the others
follow the mod's default when it changes; see
[how options are stored](docs/development.md#how-options-are-stored).
Without a terminal, it installs every mod and changes no option. It is
safe to run again:

- unselected mods that were installed are removed (they keep their data)
- the marketplace and the mods already installed are updated, as with
  `update` (unless the marketplace was added from another source; see
  [Development](docs/development.md))

`install` and `update` count only the mods in the user scope as
installed: a mod installed only in a project's scope is neither updated
nor uninstalled, and `install` installs it in the user scope too. They
warn about one in the current project's scope.

## Update

Use `update` to keep up to date, and `install` only to pick mods or
change their options:

```bash
npx --allow-git=root github:datalogix/claude-config#main update
```

Mods have no `version`: each commit pushed to `main` is a new version,
which `update` brings in. It updates what is already installed, without
questions: the marketplace and the installed mods. New mods are not
installed; run the install command again for them. If the install could
not add the marketplace, `update` says the mods are not installed. Use
`#main` so `npx` does not reuse an old copy.

Run it with `--help` for usage. Unknown commands or flags (e.g.
`update --link`) are errors; if any step fails, it ends with "Finished
with errors" and exit code 1.

In an open Claude Code session, run `/reload-plugins` to reload mods and
`/clear` so removed skills are gone.

### Auto-update (optional)

Claude Code can also update the mods in the background at startup. It
is off for this marketplace: turn it on in `/plugin` > Marketplaces >
`claude-config` > Enable auto-update. It only updates the mods: renamed
mods and old skill copies (see below) are still handled by `update` (or
`install`).

## Upgrading from older versions

`install` and `update` also clean up after earlier versions:

- `steps` and `topics` were called `passos` and `topicos`. The new name
  is installed and only then the old one is uninstalled, keeping its
  data; if the new one could not be installed, the old one stays
  (`kept: ...`) and running the command again replaces it. With
  `install`, unselecting the new name also removes the old one.
- Skills copied into `~/.claude/skills/` by earlier versions (`/review`,
  `/issue`) are removed once `datalogix` is installed, or unselected;
  `update` installs `datalogix` when such copies exist. Without the
  `claude` CLI they are left in place. See
  [datalogix](docs/mods/datalogix.md).

## Development

The repository layout, working on a clone, running the tests and adding
a mod are covered in [docs/development.md](docs/development.md).

## Notes

- Review progress lives in `~/.claude/reviews/` and is local to each
  machine. It is not part of this repository.

## License

[MIT](LICENSE).
