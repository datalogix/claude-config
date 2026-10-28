# claude-config

Claude Code configuration from datalogix, shared across machines and
projects. Private repository.

## Contents

- `mods/` — Claude Code mods (plugins), listed in
  `.claude-plugin/marketplace.json`; see [Mods](#mods)
- `bin/` — the installer (`cli.js`) run by `npx`
- `docs/` — documentation of each mod and of development

## Install

Needs Node 22+ and git. It is installed straight from GitHub, with no
npm publish.

```bash
npx --allow-git=all github:datalogix/claude-config#main
```

`--allow-git=all` is required since npm 12, which refuses packages from
git by default (`EALLOWGIT`); older npm versions ignore it.

It asks which mods to install, all selected by default, and the options
of each mod (`userConfig`), starting from the value you configured or,
for an option you never configured, the mod's latest default. Only
answers that differ from the default, and options you already
configured, are stored, so a default you never changed follows the mod
when it changes. Without a terminal, it installs everything and the mods
use their defaults; no answer is stored. It is safe to run again:

- unselected mods that were installed are removed (they keep their data)
- the marketplace and the mods already installed are updated, as with
  `update` (unless the marketplace was added from another source; see
  [Development](docs/development.md))
- mods come from the GitHub marketplace `datalogix/claude-config`
- skills copied into `~/.claude/skills/` by earlier versions (`/review`,
  `/issue`) are removed once `datalogix` is installed, or unchecked; see
  [datalogix](docs/mods/datalogix.md)

## Update

Use `update` to keep up to date, and `install` only to pick mods or
change their options:

```bash
npx --allow-git=all github:datalogix/claude-config#main update
```

Mods have no `version`: each commit pushed to `main` is a new version,
which `update` brings in. It refreshes what is already installed,
without questions: updates the marketplace and the installed mods. New
mods are not installed (except the new name of a renamed mod, and
`datalogix` in place of the skills copied by earlier versions); run the
install command again for them. If the install could not add the
marketplace (no access to the repository), `update` says the mods are
not installed. Use `#main` so `npx` does not reuse an old copy.

Run it with `--help` for usage. Unknown commands or flags (e.g.
`update --link`) are errors; if any step fails, it ends with "Finished
with errors" and exit code 1.

In an open Claude Code session, run `/reload-plugins` to reload mods and
`/clear` so removed skills are gone.

### Auto-update (optional)

Claude Code can also update the mods in the background at startup. It
is off for this marketplace: turn it on in `/plugin` > Marketplaces >
`claude-config` > Enable auto-update. It only updates the mods: renamed
mods and old skill copies are still handled by `update` (or `install`).

## Mods

Each mod is picked during install; its options can be changed by running
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

`steps` and `topics` were called `passos` and `topicos`. `install` and
`update` install the new name and only then uninstall the old one,
keeping its data; if the new one could not be installed, the old one
stays (`kept: ...`) and running the command again replaces it. With
`install`, unchecking the new name also removes the old one.

## Development

Working on a clone, running the tests and adding a mod are covered in
[docs/development.md](docs/development.md).

## Notes

- Review progress lives in `~/.claude/reviews/` and is local to each
  machine. It is not part of this repository.
- Installing needs the `claude` CLI; without it, the installer skips
  the mods and leaves old skill copies in place.

## License

[MIT](LICENSE).
