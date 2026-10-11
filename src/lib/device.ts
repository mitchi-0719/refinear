type NavigatorInfo = Pick<
  Navigator,
  'maxTouchPoints' | 'platform' | 'userAgent'
>

export const isIOSDevice = (
  navigatorInfo: NavigatorInfo = navigator
): boolean =>
  /iPad|iPhone|iPod/.test(navigatorInfo.userAgent) ||
  (navigatorInfo.platform === 'MacIntel' && navigatorInfo.maxTouchPoints > 1)
