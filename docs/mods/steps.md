# steps

Hides the tool rows from the conversation, including the ctrl+b hint to
move a tool to the background, and shows the current step (waiting for
the model, thinking, writing the answer, preparing or using tools)
under Claude's spinner. Errors and interrupted calls stay visible, as
does a group that holds more than tool calls (recalled memory, hook
timing), and the ctrl+o transcript shows the tool rows; the ctrl+b hint
comes back only with `/steps`, which shows or hides the rows for the
current session. A tool progress row of any other kind stays visible.
In VS Code the step takes the place of the spinner's word, in the same row.
