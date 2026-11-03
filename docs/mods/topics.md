# topics

Adds an instruction to the system prompt so long answers start with a
summary and are split into `## ` topics, shown closed when an answer
has two or more of them or a `## Pendências` list (also in the ctrl+o
transcript), with a one-line preview. Titles, boxes and previews are
drawn as plain text: emphasis marks and backticks come off and what a
code span holds stays as written; the list sent back keeps the original
text. The thin rule after a title is drawn on the terminal only. `/topics`
opens the last
answer in a keyboard-driven pane (Tab, arrows, 1–9 for the topics,
a/f to open or close all); its boxes and its send button are the ones
of that answer in the conversation, so checking or sending in one
shows in the other. With the same answer in several messages, the
pane follows the newest one, even after an older one redraws.

A `## Pendências` topic (also written `## **Pendências**`,
``## `Pendências` `` or `## Pendências:`; the instruction puts it last,
and with more than one the last is the list and the others stay as
topics) becomes a list to answer in place:

```markdown
## Pendências
Which database?
- ( ) (recomendo) PostgreSQL
  Keeps the current driver.
  ver: Database choice
- ( ) SQLite
- [ ] Run the migrations
```

- `- [ ]` is an independent action; consecutive `- ( )` items form a group
  of exclusive alternatives, headed by the line of text right before them
  (the question; without one, or when that line closes a code block,
  the group shows "escolha uma opção")
- the instruction asks for each box to hold one action and to say on
  its own what will be done ("Fix the order total with a coupon",
  never "Apply #1" or "Do option B"), so the list sent back makes sense
  without the rest of the answer
- a box may start with Claude's stance, drawn in color before its text
  so it stays in sight when a long item wraps: `(recomendo)` in green,
  `(não recomendo)` in red and `(avalie)` in blue. Older answers wrote
  "(recomendado)" or put the mark at the end; both still count
- a `(recomendo)` box starts checked, and in a radio group only the first
  one does, so sending without touching the list approves it. The
  instruction keeps destructive, hard to undo or outward-facing actions
  out of `(recomendo)`
- indented lines below an item are its details (an indented fenced code
  block is kept whole); the instruction asks for only what is specific to that
  item, so the shared context is not repeated under every item
- `ver: <topic title>` becomes a button that opens that topic next to
  the item; the title is matched ignoring case, accents, backticks and
  bold or italic marks, the first matching topic winning, and with no
  match it stays as a plain detail. Only an item's first `ver:` counts;
  a later one stays as a detail. The instruction asks for it once per
  decision, on the
  first alternative of a group
- a box the answer wrote checked (`[x]`, `(x)`) starts unchecked, marked
  "sugerido" (not when it also has a stance): writing `[x]` never
  checks anything, though `(recomendo)` still does; the format
  instruction tells Claude that such a box coming back unchecked only
  means it was not checked
- "enviar pendências" sends the list back as a message: the boxes as
  checked on screen, each preceded by its question (the line of text
  right before it) and no other loose text; it shows up once Claude
  finishes answering
- the boxes do not change while Claude answers, or once the list was
  sent
