/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DEPLOYMENT_ENVIRONMENT: 'development' | 'preview' | 'production'
  readonly VITE_FEATURE_SCORE_EXPORT?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
