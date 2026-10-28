# status

Shows in the status line what Claude is doing, the running agents and
how much of the plan was used, and sends a notice (toast and
system notification) when an answer or the background agents finish.

| Option | Default | |
|---|---|---|
| `minSeconds` | `30` | only send a notice for answers, and background agents that end while others keep running, that took at least this long. Errors, refusals of the answer or of a background agent, and interrupted background agents always send one; an interrupted answer, or a foreground agent's refusal or interruption, never does. A notice is the toast; the system notification follows `notify` |
| `planAlert` | `90` | highlight the plan at or above this percentage (1–100) and show a toast when usage reaches it or 75%; at the limit, send a notice instead (the system notification follows `notify`) |
| `notify` | `always` | system notifications: `always`, `agents` (background agents only) or `never` (toast only) |
| `excerpt` | `false` | put the first line of text of the answer (code blocks, rules, table rows and lines that are only an HTML comment skipped) in the system notification (it may show on the lock screen, so it is off by default) |

The options were renamed from `segundos`, `alertaPlano`, `notificar`
(`sempre`/`agentes`/`nunca`) and `trecho`, and `excerpt` was called
`showExcerpt`. Values stored only under the earlier names are not
carried over, so those options are back at their defaults; set them
again by running the installer or with `/config`. The installer
(`install` and `update`) lists the values still stored under the
earlier names, so they can be set again by hand; it warns on every
run until they are removed from `pluginConfigs` in `settings.json`
(in `$CLAUDE_CONFIG_DIR`, or `~/.claude`). The excerpt starts
off for everyone: both of its earlier names were on by default.

A plan window whose reset time has passed leaves the status line
until the next answer from the API brings the new window; a window
that hit the limit sends a notice when it resets. `/clear` and resuming a
session clear the previous answer's outcome from the status line.

An empty `minSeconds` or `planAlert` takes its default; a non-numeric
one keeps the mod from loading. A `notify` outside its options counts
as `always`, with a warning from Claude Code.
