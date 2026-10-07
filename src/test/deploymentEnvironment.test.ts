import { describe, expect, it } from 'vitest'

import { resolveDeploymentEnvironment } from '../../config/deploymentEnvironment'

describe('resolveDeploymentEnvironment', () => {
  it('main の Workers Build を本番として扱う', () => {
    expect(
      resolveDeploymentEnvironment({
        mode: 'production',
        workersCi: '1',
        workersCiBranch: 'main',
      })
    ).toBe('production')
  })

  it('main 以外の Workers Build をプレビューとして扱う', () => {
    expect(
      resolveDeploymentEnvironment({
        mode: 'production',
        workersCi: '1',
        workersCiBranch: 'feature/180',
      })
    ).toBe('preview')
  })

  it('Workers Build のブランチが不明な場合は本番として扱う', () => {
    expect(
      resolveDeploymentEnvironment({
        mode: 'production',
        workersCi: '1',
      })
    ).toBe('production')
  })

  it('ローカルでは Vite の mode を使って判定する', () => {
    expect(resolveDeploymentEnvironment({ mode: 'development' })).toBe(
      'development'
    )
    expect(resolveDeploymentEnvironment({ mode: 'production' })).toBe(
      'production'
    )
  })
})
