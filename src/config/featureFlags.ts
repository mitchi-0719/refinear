const isEnabled = (value: string | undefined): boolean => value === 'true'

const deploymentEnvironment = import.meta.env.VITE_DEPLOYMENT_ENVIRONMENT

/**
 * アプリ全体で利用する実行環境情報。
 * import.meta.env はこのファイル以外から直接参照しない。
 */
export const appEnvironment = {
  mode: import.meta.env.MODE,
  isDevelopment: import.meta.env.MODE === 'development',
  isProduction: import.meta.env.MODE === 'production',
  deployment: deploymentEnvironment,
  isProductionDeployment: deploymentEnvironment === 'production',
  isDebugEnabled: deploymentEnvironment !== 'production',
} as const

/**
 * Release前の機能だけをここで管理する。
 * 環境変数が未設定の場合は常にfalseになり、公開後はフラグごと削除する。
 */
export const featureFlags = {
  demoButton: appEnvironment.isDebugEnabled,
  scoreExport: isEnabled(import.meta.env.VITE_FEATURE_SCORE_EXPORT),
} as const
