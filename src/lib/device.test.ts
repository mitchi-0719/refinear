import { describe, expect, it } from 'vitest'

import { isIOSDevice } from './device'

const createNavigatorInfo = (
  overrides: Partial<{
    maxTouchPoints: number
    platform: string
    userAgent: string
  }> = {}
) => ({
  maxTouchPoints: 0,
  platform: '',
  userAgent: '',
  ...overrides,
})

describe('isIOSDevice', () => {
  it.each(['iPhone', 'iPad', 'iPod'])('%sをiOS端末として判定する', (device) => {
    const navigatorInfo = createNavigatorInfo({
      userAgent: `Mozilla/5.0 (${device}) AppleWebKit/605.1.15`,
    })

    expect(isIOSDevice(navigatorInfo)).toBe(true)
  })

  it('デスクトップ表示のiPadOSをiOS端末として判定する', () => {
    const navigatorInfo = createNavigatorInfo({
      maxTouchPoints: 5,
      platform: 'MacIntel',
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)',
    })

    expect(isIOSDevice(navigatorInfo)).toBe(true)
  })

  it.each([
    {
      name: 'macOS',
      navigatorInfo: createNavigatorInfo({
        maxTouchPoints: 0,
        platform: 'MacIntel',
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)',
      }),
    },
    {
      name: 'Android',
      navigatorInfo: createNavigatorInfo({
        maxTouchPoints: 5,
        platform: 'Linux armv8l',
        userAgent: 'Mozilla/5.0 (Linux; Android 15)',
      }),
    },
    {
      name: 'Windows',
      navigatorInfo: createNavigatorInfo({
        platform: 'Win32',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      }),
    },
  ])('$nameをiOS端末として判定しない', ({ navigatorInfo }) => {
    expect(isIOSDevice(navigatorInfo)).toBe(false)
  })
})
