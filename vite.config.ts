import babel from '@rolldown/plugin-babel'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

import { webMscoreLocalAssets } from './config/vitePlugins'

export default defineConfig({
  optimizeDeps: {
    exclude: ['webmscore'],
  },
  plugins: [
    webMscoreLocalAssets(),
    react(),
    babel({ presets: [reactCompilerPreset()] }),
  ],
  build: {
    // OSMD is loaded only after a score is selected. Its minified package is
    // currently about 1.30 MB, so keep the warning narrowly above that known
    // lazy chunk instead of masking future multi-megabyte regressions.
    chunkSizeWarningLimit: 1350,
  },
})
