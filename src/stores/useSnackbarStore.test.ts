import { beforeEach, describe, expect, it } from 'vitest'

import { useSnackbarStore } from './useSnackbarStore'

describe('useSnackbarStore', () => {
  beforeEach(() => {
    useSnackbarStore.getState().hideSnackbar()
  })

  it('既定値で通知を表示して閉じられる', () => {
    useSnackbarStore.getState().showSnackbar({ message: 'お知らせ' })

    expect(useSnackbarStore.getState().notification).toMatchObject({
      duration: 6000,
      message: 'お知らせ',
      variant: 'info',
    })

    useSnackbarStore.getState().hideSnackbar()
    expect(useSnackbarStore.getState().notification).toBeNull()
  })

  it('新しい通知で表示中の通知を置き換える', () => {
    useSnackbarStore.getState().showSnackbar({ message: '最初の通知' })
    const firstId = useSnackbarStore.getState().notification?.id

    useSnackbarStore.getState().showSnackbar({
      duration: 0,
      message: '警告',
      variant: 'warning',
    })

    const notification = useSnackbarStore.getState().notification
    expect(notification).toMatchObject({
      duration: 0,
      message: '警告',
      variant: 'warning',
    })
    expect(notification?.id).not.toBe(firstId)
  })
})
