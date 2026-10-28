# topics

Adds an instruction to the system prompt so long answers start with a
summary and are split into `## ` topics, shown closed (also in the
ctrl+o transcript) with a one-line preview. `/topics` opens the last
answer in a keyboard-driven pane (Tab, arrows, 1–9 for the topics,
a/f to open or close all); its boxes and its send button are the ones
of that answer in the conversation, so checking or sending in one
shows in the other. With the same answer in several messages, the
pane follows the newest one, even after an older one redraws.

A `## Pendências` topic (also written `## **Pendências**` or
`## Pendências:`; the instruction puts it last, and with more than
one the last is the list and the others stay as topics) becomes a
list to answer in place:

```markdown
## Pendências
Which database?
- ( ) PostgreSQL (recomendado)
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
- an alternative ending in "(recomendado)" is shown as recommended
- indented lines below an item are its details (an indented code block
  is kept whole); the instruction asks for only what is specific to that
  item, so the shared context is not repeated under every item
- `ver: <topic title>` becomes a button that opens that topic next to
  the item; the title is matched ignoring case, accents, backticks and
  bold or italic marks, the first matching topic winning, and with no
  match it stays as a plain detail. Only an item's first `ver:` counts; a later one stays
  as a detail. The instruction asks for it once per decision, on the
  first alternative of a group
- a box the answer wrote checked (`[x]`, `(x)`) starts unchecked, marked
  "sugerido" (only "★ recomendado" when it is also the recommended
  one): only the user checks, so sending never approves something on
  Claude's behalf; the format instruction tells Claude that such a box
  coming back unchecked only means it was not checked
- "enviar pendências" sends the list back as a message: the boxes as
  checked on screen, each preceded by its question (the line of text
  right before it) and no other loose text; it shows up once Claude
  finishes answering
