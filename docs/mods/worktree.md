# worktree

Adds an instruction to the system prompt so Claude asks whether to
create a git worktree before the first file change of a task, and
enters it with `EnterWorktree` on a yes. It does not ask for read-only
tasks, in a session already in a worktree (one made by hand too), for
subagents or with nobody to answer. After a no, it does not ask again in
that session, except in the case below.

A new task in the middle of another, with uncommitted changes from that
other task, asks again even after a no. In a session already in a
worktree, Claude suggests opening another terminal with
`claude --worktree <name>` instead of creating one.

Uncommitted changes do not follow a worktree. When there are any, the
question offers leaving them in the current folder, the recommended
choice, or taking them along. Only that second choice runs
`git stash push -u` and, in the worktree, `git stash pop`; a conflict
stops there and the stash stays stored.

After creating a worktree, Claude warns if `.claude/worktrees/` is not
in the project's `.gitignore`.

A worktree starts from the remote's default branch (the `worktree.baseRef`
setting changes that) on a `worktree-<name>` branch. The mod does not
install dependencies or copy local files: list files such as `.env` in a
`.worktreeinclude` at the project root.

This is an instruction Claude follows, not a block like a hook, so it may
miss now and then. To turn it off, unselect the mod in the installer.

`update` does not install new mods: run `install` once to get this one.
