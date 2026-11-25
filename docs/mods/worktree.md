# worktree

Adds an instruction to the system prompt so Claude asks whether to
create a git worktree before the first file change of a task, and
enters it with `EnterWorktree` on a yes. It does not ask for read-only
tasks, in a session already in a worktree (one made by hand too), for
subagents or with nobody to answer. After a no, it does not ask again in
that session, except in the case below.

A new task in the middle of another, with uncommitted changes from that
other task, asks again even after a no. If the session is already in a
worktree, Claude suggests opening another terminal with
`claude --worktree <name>` instead of creating one. Without such changes,
a no still holds.

Uncommitted changes do not follow a worktree. When there are any, the
question offers leaving them in the current folder, the recommended
choice, or taking them along, warning that this can conflict with the
worktree's base and unstages what is staged. Only that second choice runs
`git stash push -u -m "worktree-<name>"` and finds the entry's sha by that
message, since the stash stack is shared across worktrees. In the worktree
it runs `git stash apply <sha>` and then drops that entry. A failed push
creates no worktree, a failed `EnterWorktree` restores the changes in the
current folder, and any failed restore stops there with the stash still
stored.

After creating a worktree, Claude warns if `.claude/worktrees/` is not
ignored by git in the main checkout, where the folder is.

A worktree starts from the remote's default branch (the `worktree.baseRef`
setting changes that) on a `worktree-<name>` branch, so Claude runs
`git fetch origin` first; if that fails, it warns that the worktree may
start from an old commit and goes on. On another branch, or with commits
not pushed, the question says that the worktree starts without them.

A new worktree has no `vendor/`, `node_modules/` or `.env`, so right
after `EnterWorktree` Claude offers, in one `## Pendências` list at the
end of its answer, only the steps that apply, each one an item marked
`(recomendo)`:

- `composer install`, with a `composer.json` and no `vendor/`;
- installing the JS dependencies from the lockfile, with no
  `node_modules/`: `npm ci`, `pnpm install --frozen-lockfile`,
  `yarn install --frozen-lockfile` (`--immutable` on Yarn 2+) or
  `bun install --frozen-lockfile`;
- copying `.env` from the main checkout with `cp`, without printing it,
  when the worktree has none and the main checkout has one (files listed
  in a `.worktreeinclude` at the project root are already copied);
- `php artisan key:generate` for a Laravel app, when the `.env` it will
  have has an empty `APP_KEY=`, checked without printing other values.

With nothing to do, there is no list. Nothing runs unless checked; the
checked steps run in that order, and a failure is reported, not retried
in a loop.

This is an instruction Claude follows, not a block like a hook, so it may
miss now and then. To turn it off, unselect the mod with `--configure`.

To get this mod on a machine that already has others, run the installer:
it offers the mod, selected by default.
