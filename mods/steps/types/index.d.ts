declare module 'claude-code' {
  interface PluginState {
    steps: {
      /**
       * Whether /steps turned the tool rows on; errors, interruptions, the ctrl+o transcript and groups holding more
       * than calls show them either way
       */
      areToolRowsVisible: boolean
    }
  }
}
