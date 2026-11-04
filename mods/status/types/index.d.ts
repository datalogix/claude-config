export type StatusLine = {
  text: string
  color: string
  /** What follows the label when part of it is a link; `text` holds the same words */
  segments?: (string | { text: string; href: string })[]
}

declare module 'claude-code' {
  interface PluginState {
    status: {
      /** What is drawn under the prompt, one item per line */
      lines: StatusLine[]
    }
  }
}
