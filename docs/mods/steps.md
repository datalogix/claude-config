# steps

Hides the tool rows from the conversation, including the ctrl+b hint to
move a tool to the background, and shows the current step (waiting for
the model, thinking, writing the answer, preparing or using tools)
under Claude's spinner. Errors and interrupted calls stay visible: a
group of calls with one of them unfolds, which shows the calls around
it too. A group that holds more than tool calls (recalled memory, hook
timing) also stays, and the ctrl+o transcript and `--verbose` show the
tool rows; the ctrl+b hint comes back only with `/steps`, which shows or
hides the rows for the current session, at once, even during a turn. A
tool progress row of any other kind stays visible. The mobile app has
no spinner, so it hides the rows without showing the step.
In VS Code the step takes the place of the spinner's word, in the same row.
