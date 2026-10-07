export type DeploymentEnvironment = 'development' | 'preview' | 'production'

type ResolveDeploymentEnvironmentOptions = {
  mode: string
  workersCi?: string
  workersCiBranch?: string
}

export const resolveDeploymentEnvironment = ({
  mode,
  workersCi,
  workersCiBranch,
}: ResolveDeploymentEnvironmentOptions): DeploymentEnvironment => {
  if (workersCi === '1') {
    return workersCiBranch && workersCiBranch !== 'main'
      ? 'preview'
      : 'production'
  }

  return mode === 'production' ? 'production' : 'development'
}
