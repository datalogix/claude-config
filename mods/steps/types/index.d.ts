declare module 'claude-code' {
  interface PluginState {
    steps: {
      /** Whether /steps turned the tool rows on; errors, interruptions and the ctrl+o transcript show them either way */
      areToolRowsVisible: boolean
    }
  }
}
