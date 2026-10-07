import { describe, expect, it, vi } from 'vitest'

import {
  isPrereleaseVersion,
  parseReleaseVersion,
  publishRelease,
  shouldPublishRelease,
} from '../../scripts/releaseVersion.mjs'

const createResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    status,
  })

type FetchRequest = {
  options: RequestInit
  url: RequestInfo | URL
}

const withMockFetch = async (
  responses: Response[],
  callback: (requests: FetchRequest[]) => Promise<void>
) => {
  const requests: FetchRequest[] = []

  vi.stubGlobal('fetch', async (url: RequestInfo | URL, options = {}) => {
    requests.push({ options, url })
    const response = responses.shift()
    if (!response) throw new Error(`未定義のリクエストです: ${url}`)
    return response
  })

  try {
    await callback(requests)
  } finally {
    vi.unstubAllGlobals()
  }
}

const releaseInput = {
  headRef: 'develop',
  mergeSha: 'merge-sha',
  merged: 'true',
  repository: 'mitchi-0719/refinear',
  title: 'release: v0.2.0',
  token: 'test-token',
}

describe('parseReleaseVersion', () => {
  it('安定版のリリースタイトルからバージョンを取得する', () => {
    expect(parseReleaseVersion('release: v0.2.0')).toBe('v0.2.0')
    expect(parseReleaseVersion('release: v1.0.0')).toBe('v1.0.0')
  })

  it('プレリリースとビルドメタデータを受け入れる', () => {
    expect(parseReleaseVersion('release: v1.2.3-rc.1+build.5')).toBe(
      'v1.2.3-rc.1+build.5'
    )
    expect(parseReleaseVersion('release: v1.2.3-0')).toBe('v1.2.3-0')
    expect(parseReleaseVersion('release: v1.2.3-rc.01a')).toBe('v1.2.3-rc.01a')
  })

  it('不正なタイトルを拒否する', () => {
    for (const title of [
      'v0.2.0',
      'release v0.2.0',
      'release: 0.2.0',
      'release: v01.2.3',
      'release: v1.2.3-01',
      'release: v1.2',
      'release: v1.2.3 ',
    ]) {
      expect(() => parseReleaseVersion(title)).toThrow()
    }
  })
})

describe('shouldPublishRelease', () => {
  it('developからmainへマージされた場合だけ公開する', () => {
    expect(shouldPublishRelease({ headRef: 'develop', merged: 'true' })).toBe(
      true
    )
    expect(
      shouldPublishRelease({ headRef: 'feature/161', merged: 'true' })
    ).toBe(false)
    expect(shouldPublishRelease({ headRef: 'develop', merged: 'false' })).toBe(
      false
    )
  })
})

describe('isPrereleaseVersion', () => {
  it('プレリリース識別子の有無を判定する', () => {
    expect(isPrereleaseVersion('v1.0.0')).toBe(false)
    expect(isPrereleaseVersion('v1.0.0-rc.1')).toBe(true)
    expect(isPrereleaseVersion('v1.0.0+build-5')).toBe(false)
    expect(isPrereleaseVersion('v1.0.0-rc.1+build-5')).toBe(true)
  })
})

describe('publishRelease', () => {
  it('タグとGitHub Releaseを作成する', async () => {
    await withMockFetch(
      [
        createResponse(404, { message: 'Not Found' }),
        createResponse(404, { message: 'Not Found' }),
        createResponse(201, { ref: 'refs/tags/v0.2.0' }),
        createResponse(201, { html_url: 'https://example.com/v0.2.0' }),
      ],
      async (requests) => {
        const result = await publishRelease(releaseInput)

        expect(result).toEqual({
          created: true,
          url: 'https://example.com/v0.2.0',
          version: 'v0.2.0',
        })
        expect(requests).toHaveLength(4)
        expect(requests[2].options.method).toBe('POST')
        expect(requests[3].options.method).toBe('POST')
      }
    )
  })

  it('同じコミットのタグとReleaseがあれば再作成しない', async () => {
    await withMockFetch(
      [
        createResponse(200, {
          object: { sha: 'merge-sha', type: 'commit' },
        }),
        createResponse(200, { html_url: 'https://example.com/v0.2.0' }),
      ],
      async (requests) => {
        const result = await publishRelease(releaseInput)

        expect(result).toEqual({
          created: false,
          url: 'https://example.com/v0.2.0',
          version: 'v0.2.0',
        })
        expect(requests).toHaveLength(2)
      }
    )
  })

  it('タグだけ作成済みならGitHub Releaseを作成する', async () => {
    await withMockFetch(
      [
        createResponse(200, {
          object: { sha: 'merge-sha', type: 'commit' },
        }),
        createResponse(404, { message: 'Not Found' }),
        createResponse(201, { html_url: 'https://example.com/v0.2.0' }),
      ],
      async (requests) => {
        const result = await publishRelease(releaseInput)

        expect(result.created).toBe(true)
        expect(requests).toHaveLength(3)
        expect(String(requests[2].url)).toMatch(/\/releases$/)
      }
    )
  })

  it('同名タグが別コミットを指す場合は変更しない', async () => {
    await withMockFetch(
      [
        createResponse(200, {
          object: { sha: 'different-sha', type: 'commit' },
        }),
      ],
      async (requests) => {
        await expect(publishRelease(releaseInput)).rejects.toThrow(
          /タグは別のコミットに存在します/
        )
        expect(requests).toHaveLength(1)
      }
    )
  })

  it('注釈付きタグをコミットまで解決して再作成しない', async () => {
    await withMockFetch(
      [
        createResponse(200, {
          object: { sha: 'tag-object-sha', type: 'tag' },
        }),
        createResponse(200, {
          object: { sha: 'merge-sha', type: 'commit' },
        }),
        createResponse(200, { html_url: 'https://example.com/v0.2.0' }),
      ],
      async (requests) => {
        const result = await publishRelease(releaseInput)

        expect(result.created).toBe(false)
        expect(requests).toHaveLength(3)
        expect(String(requests[1].url)).toMatch(/\/git\/tags\/tag-object-sha$/)
      }
    )
  })

  it('注釈付きタグが別コミットを指す場合は変更しない', async () => {
    await withMockFetch(
      [
        createResponse(200, {
          object: { sha: 'tag-object-sha', type: 'tag' },
        }),
        createResponse(200, {
          object: { sha: 'different-sha', type: 'commit' },
        }),
      ],
      async (requests) => {
        await expect(publishRelease(releaseInput)).rejects.toThrow(
          /タグは別のコミットに存在します/
        )
        expect(requests).toHaveLength(2)
      }
    )
  })
})
