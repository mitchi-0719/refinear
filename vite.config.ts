import babel from '@rolldown/plugin-babel'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

import { resolveDeploymentEnvironment } from './config/deploymentEnvironment'
import { webMscoreLocalAssets } from './config/vitePlugins'

export default defineConfig(({ mode }) => {
  const deploymentEnvironment = resolveDeploymentEnvironment({
    mode,
    workersCi: process.env.WORKERS_CI,
    workersCiBranch: process.env.WORKERS_CI_BRANCH,
  })

  return {
    define: {
      'import.meta.env.VITE_DEPLOYMENT_ENVIRONMENT': JSON.stringify(
        deploymentEnvironment
      ),
    },
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
  }
})
