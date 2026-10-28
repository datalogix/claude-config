declare module 'claude-code' {
  interface PluginState {
    topics: {
      /** Families are per message (requestId), or the pane: indexes of the open topics */
      openTopics: StateFamily<number[]>
      /** Indexes of the "Pendências" items with their explanation open */
      explainedItems: StateFamily<number[]>
      /** Only what the user checked: an item the answer wrote checked starts unchecked */
      checkedItems: StateFamily<number[]>
      isSent: StateFamily<boolean>
      /** Main turn only (agent turns don't count); sending waits for complete items */
      isAnswering: boolean
      /** Key of the focused element in the /topics pane, to draw the ❯ */
      focusedKey: string
      /** The main turn's last non-empty answer, for the /topics pane */
      lastAnswer: string
    }
  }
}
