# status

Shows under the prompt what Claude is doing, the running agents, the
git state and how much of the plan was used, and sends a notice (toast and
system notification) when an answer or the background agents end.

| Option | Default | |
|---|---|---|
| `minSeconds` | `30` | only send a notice for answers, and background agents that end while others keep running, that took at least this long. Errors, refusals of the answer or of a background agent, and interrupted background agents always send one; an interrupted answer, or a foreground agent's refusal or interruption, never does. A notice is the toast; the system notification follows `notify` |
| `planAlert` | `90` | highlight the plan at or above this percentage (1–100) and show a toast when usage reaches it or 75%; at the limit, send a notice instead (the system notification follows `notify`) |
| `notify` | `always` | system notifications: `always`, `agents` (background agents only) or `never` (toast only) |
| `excerpt` | `false` | put the first line of text of the answer (fenced code blocks, rules, table rows that start with `\|`, lines that are only an HTML comment and lines with no letter or digit skipped, also in a quote or a list item) in the system notification (it may show on the lock screen, so it is off by default). An agent's description is always in its notification, whatever this says |

The options were renamed from `segundos`, `alertaPlano`, `notificar`
(`sempre`/`agentes`/`nunca`) and `trecho`, and `excerpt` was called
`showExcerpt`. Values stored only under the earlier names are not
carried over, so those options are back at their defaults; set them
again with `--configure` or `/config`. The installer
(`bin/cli.js`) lists the values still stored under the
earlier names, so they can be set again by hand; it warns on every
run until they are removed from `pluginConfigs` in `settings.json`
(in `$CLAUDE_CONFIG_DIR`, or `~/.claude`). The excerpt starts
off for everyone: both of its earlier names were on by default.

With more than one agent since the last prompt, the status line shows
the progress and one running agent, as in `🤖 2/5 ⚠️1: Revisar +2`: 2 of
5 ended, 1 of them with a problem, and Revisar and 2 more still running.
Agents still running when a new prompt starts stay in the count; the
ended ones leave it.

While agents or workflows run in the background, the status line shows
them and no "pronto": an answer that succeeded is only reported again
once they end. A failed or interrupted answer stays next to them and
after they end. The final notice for background agents goes out when the
last one ends, saying how many workflows still run; a workflow's own end
comes back as a new answer from Claude. An agent held on its own
background work still counts as running, so no end notice goes out until
it really ends.

There are up to three lines, right under the engine's own line (the mode
and the shortcuts), each with its label in bold. `status:` is always
there, as `💤 aguardando` when nothing has happened yet; `plano:` and
`git:` are left out when they have nothing to show:

```
status: code/laravel-config  │  ⠋ trabalhando… 0:42  │  🤖 2/5: Revisar +2  │  🌐 laravel-config.test
plano: 5h 16% (renova em 3h09) · semana 31% (renova em 10h29)
git: datalogix/laravel-config · feat/status-git · PR #5 · ●3 ↑1 ↓2
```

The folder is the last two segments of the repository's root, or of the
working folder outside one, and opens in VS Code (`vscode://`); in a linked
worktree it is the project and the worktree, as `laravel-config (review)`.
The address at the end is the `APP_URL` of the `.env` at that root, only when
it is `localhost`, `127.0.0.1` or a `.test` host, and it shows even with the
server stopped: nothing else is read from that file. The desktop app opens
only `https:` and `http://localhost` links, so it draws the folder and a
`.test` address as plain text.

Each line has its color: `status:` in the Claude color while working,
green when done, red after a failure and gray while waiting; `plano:` in
blue, yellow from `planAlert` on; and `git:` in purple. They are theme
colors, so they follow the user's theme.

Claude Code draws those lines only in the terminal and the desktop app.
Elsewhere, such as VS Code, the same parts go on one status line, which
takes no line breaks, separated by `│`, without the folder and the app's
address, and with no links.

The `git:` line has the repository, which links to its page, the branch
(the short commit when detached), the open
pull request, 3 changed files (an untracked folder counts as one), 1
commit ahead of the upstream and 2 behind; a count at zero is left out.
It is read at the session start, when an answer ends and every minute,
so a change made during an answer can take up to a minute to show.
Outside a repository, or when `git` fails, the line is left out.

The branch links to the remote once it is there, tracked and not deleted
(`/tree/<branch>` on the remote's site, the address GitHub uses, so another
host may not open it). An http(s) remote keeps its scheme and port, even on
a host with no dot; an ssh remote links over https, without its port. A
local path or an ssh alias (a host with no dot) as the remote gets no
link. Any user or token in the remote stays out of the link, and a remote
with `@`, `?` or `#` in its path gets no link. The pull request links to
its own page. A terminal without hyperlink support shows the address after
the text.

While Claude Code's own line next to the mode shows the same pull request,
the `git:` line leaves it out.

The pull request comes from `gh pr view`, which goes over the network:
it is read when the branch changes, and when an answer ends at most every
5 minutes, so one opened meanwhile can take that long to show. Without
`gh`, or when it fails, the line keeps what it had.

A plan window whose reset time has passed leaves the status line
until the next API response brings the new window; a window
that hit the limit sends a notice when it resets. `/clear` and resuming a
session clear the previous answer's outcome and workflows from the status
line, and no end notice goes out for the agents already waited on.

An empty `minSeconds` or `planAlert` takes its default; a non-numeric
one keeps the mod from loading. A `notify` outside its options counts
as `always`, with a warning from Claude Code.
