/** When the main loop last refreshed the prompt cache, and for how long it holds. */
export type TheNorthCache = {
  /** `$.clock.now()` milliseconds at the end of the last main-loop turn; 0 before the first. */
  at: number
  /** Minutes the cache holds: 5 or 60; 0 until a turn reports a cache write. */
  ttl: number
}

declare module 'claude-code' {
  interface PluginState {
    'the-north': {
      /** Context window fill, 0 to 100, stepped by 1. */
      fill: number
      cache: TheNorthCache
    }
  }
}
