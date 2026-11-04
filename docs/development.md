# Development

## Contents

- `mods/` — Claude Code mods (plugins), listed in
  `.claude-plugin/marketplace.json`
- `bin/` — the installer (`cli.js`, `options.js`, `quote.js`) run by
  `npx`
- `tests/` — Vitest tests of the installer, of the skills' Markdown and
  of the rules every mod follows; each mod's own tests sit next to its
  hooks
- `docs/` — documentation of each mod and of development

## Working on this repository

```bash
git clone git@github.com:datalogix/claude-config.git ~/claude-config
cd ~/claude-config && npm install
node bin/cli.js install --link
```

Working on a clone needs a newer Node than running the installer:
`^22.13.0`, `^24` or `>=26`, which ESLint and Vitest require.

With `--link`, if the marketplace was not added yet, it is added from
the clone, and Claude Code reads the mods from it in place: edits show
up after `/reload-plugins`, with no reinstall. A marketplace already
added from another source (GitHub, or a clone when installing without
`--link`) stays as it is: the install warns about it and updates
neither it nor its mods (`update` still does). Remove it with
`claude plugin marketplace remove claude-config` to switch, which also
uninstalls its mods and deletes their options and data.

Run the tests with `npm test`: Vitest for `tests/` (the installer,
the skills' Markdown against the `topics` parser and each other, the
mods' manifests and marketplace entries, the license) plus
`claude plugin test` for each mod with hooks, so it needs the `claude`
CLI.

Check formatting and lint with `npm run lint` (ESLint and Prettier,
as CI does) and fix them with `npm run format`. Prettier skips `*.md`:
wrap Markdown by hand.

## How options are stored

During install, each option's question starts from the value you
configured or, for an option you never configured, the mod's latest
default. Only answers that differ from the default, and options you
already configured, are stored, so a default you never changed follows
the mod when it changes. An option without a default is compared with
what its question starts from: `false` for a boolean, the first choice
for a select. Without a terminal, nothing is asked or stored: options
already configured keep their values and the others use their defaults.

## Adding a mod

1. Create `mods/<name>/` with `.claude-plugin/plugin.json` (with
   `"license": "MIT"` and `"author": { "name": "datalogix" }`) and, for
   a mod with hooks, `hooks/hooks.json` listing its modules (e.g.
   `{ "modules": ["./register.ts"] }`), a `tsconfig.json` like the other
   mods' and the tests next to the modules. Leave `version` out of both
   `plugin.json` and the marketplace entry: Claude Code then uses the
   commit SHA as the version, so every pushed commit reaches `update`. A
   fixed `version` keeps users on their cached copy until it changes.
   `claude plugin validate` warns about the missing version; that is
   expected. A mod that keeps plugin state declares it in
   `types/index.d.ts` (augmenting `PluginState`) and points to it from
   the `types` field of `plugin.json`.
2. List it in `.claude-plugin/marketplace.json`:

   ```json
   { "name": "<name>", "source": "./mods/<name>" }
   ```

3. Add `claude plugin test mods/<name>` to the `test` script in
   `package.json` (it fails for a mod without hooks).
   `tests/mods.test.js` fails until these steps are done: it checks the
   `name`, `license`, `author` and missing `version`, the marketplace
   entry and this script.
4. Run the installer again. Options declared in `userConfig` are asked
   during install (`number`, `string`, `boolean`, `options` for a fixed
   list, and `sensitive` for a hidden answer that keeps the stored value
   when left empty).
