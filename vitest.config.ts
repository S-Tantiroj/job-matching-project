import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    // Integration tests hit real Supabase/Gemini over the network. The default
    // 5s is not enough for the first call in a run, which pays DNS + TLS setup
    // and, on a paused free-tier project, the instance wake-up. Unit tests are
    // unaffected — a passing test never waits for its timeout.
    testTimeout: 20000,
    hookTimeout: 20000,
  },
  resolve: {
    alias: { '@': __dirname },
  },
})
