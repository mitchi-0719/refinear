import { toast } from 'sonner'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { showSnackbar } from './snackbar'

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  },
}))

describe('showSnackbar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('既定値ではinfo通知を6秒間表示する', () => {
    showSnackbar({ message: 'お知らせ' })

    expect(toast.info).toHaveBeenCalledWith('お知らせ', { duration: 6000 })
  })

  it('指定した種類と表示時間で通知する', () => {
    showSnackbar({
      duration: 0,
      message: '警告',
      variant: 'warning',
    })

    expect(toast.warning).toHaveBeenCalledWith('警告', { duration: 0 })
  })
})
