# claude-config

Claude Code configuration from datalogix, shared across machines and
projects.

## Mods

Each mod is selected during install; its options can be changed with
`--configure` or with `/config`.

- [datalogix](docs/mods/datalogix.md) — the skills `/datalogix:review`,
  `/datalogix:issue`, `/datalogix:commit`, `/datalogix:pr` and
  `/datalogix:ci`
- [steps](docs/mods/steps.md) — hides the tool rows and shows the
  current step with Claude's spinner
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

Run the same command to install and to keep up to date. Mods have no
`version`: each commit pushed to `main` is a new version. Use `#main` so
`npx` does not reuse an old copy. What it does depends on the machine:

- **Nothing installed yet:** adds the marketplace and asks which mods to
  install, all selected by default, and the options of each mod
  (`userConfig`).
- **Mods already installed:** updates the marketplace and the installed
  mods, without asking about them, and offers only the mods not installed
  yet, selected by default, with their options. A mod you left out is
  offered again on the next run.
- **Without a terminal:** with nothing installed, installs every mod with
  the default options; otherwise it only updates what is installed.

To go through every mod and option again, or to remove a mod, use
`--configure`. An unselected mod is removed: its data stays, its options
do not. Without a terminal, `--configure` installs every mod and changes no
option.

```bash
npx --allow-git=root github:datalogix/claude-config#main --configure
```

Only the options you change from the default are stored, so the others
follow the mod's default when it changes; see
[how options are stored](docs/development.md#how-options-are-stored).
That also means a new option of an installed mod is not asked: it starts
from its default, and `--configure` or `/config` changes it.

Only the mods in the user scope count as installed: a mod installed only
in a project's scope is neither updated nor uninstalled, and is installed
in the user scope too when selected. The installer warns about one in the
current project's scope.

The earlier commands `install` and `update` are still accepted, with the
same result as no command. Run it with `--help` for usage. Unknown commands
or flags are errors; if any step fails, it ends with "Finished with errors"
and exit code 1.

In an open Claude Code session, run `/reload-plugins` to reload mods and
`/clear` so removed skills are gone.

### Auto-update (optional)

Claude Code can also update the mods in the background at startup. It
is off for this marketplace: turn it on in `/plugin` > Marketplaces >
`claude-config` > Enable auto-update. It only updates the mods: renamed
mods and old skill copies (see below) are still handled by the installer.

## Upgrading from older versions

The installer also cleans up after earlier versions:

- `steps` and `topics` were called `passos` and `topicos`. The new name
  is installed and only then the old one is uninstalled, keeping its
  data; if the new one could not be installed, the old one stays
  (`kept: ...`) and running the command again replaces it. With
  `--configure`, unselecting the new name also removes the old one.
- Skills copied into `~/.claude/skills/` by earlier versions (`/review`,
  `/issue`) are removed once `datalogix` is installed, or unselected;
  `datalogix` is installed when such copies exist. Without the
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
