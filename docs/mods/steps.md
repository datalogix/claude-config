# steps

Hides the tool rows from the conversation, including the ctrl+b hint to
move a tool to the background, and shows the current step (waiting for
the model, thinking, writing the answer, preparing or using tools)
under Claude's spinner. Errors and interrupted calls stay visible, as
does a group that holds more than tool calls (recalled memory, hook
timing), and the ctrl+o transcript shows every row. `/steps` shows or
hides the rows for the current session.
