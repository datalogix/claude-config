export type StatusLine = {
  text: string
  color: string
  /** What follows the label when part of it is a link; drawn instead of the rest of `text` */
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
