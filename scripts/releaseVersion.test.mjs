import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  isPrereleaseVersion,
  parseReleaseVersion,
  publishRelease,
  shouldPublishRelease,
} from './releaseVersion.mjs'

const createResponse = (status, body) =>
  new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    status,
  })

const withMockFetch = async (responses, callback) => {
  const originalFetch = globalThis.fetch
  const requests = []

  globalThis.fetch = async (url, options = {}) => {
    requests.push({ options, url })
    const response = responses.shift()
    assert.ok(response, `未定義のリクエストです: ${url}`)
    return response
  }

  try {
    await callback(requests)
  } finally {
    globalThis.fetch = originalFetch
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
    assert.equal(parseReleaseVersion('release: v0.2.0'), 'v0.2.0')
    assert.equal(parseReleaseVersion('release: v1.0.0'), 'v1.0.0')
  })

  it('プレリリースとビルドメタデータを受け入れる', () => {
    assert.equal(
      parseReleaseVersion('release: v1.2.3-rc.1+build.5'),
      'v1.2.3-rc.1+build.5'
    )
  })

  it('不正なタイトルを拒否する', () => {
    for (const title of [
      'v0.2.0',
      'release v0.2.0',
      'release: 0.2.0',
      'release: v01.2.3',
      'release: v1.2',
      'release: v1.2.3 ',
    ]) {
      assert.throws(() => parseReleaseVersion(title))
    }
  })
})

describe('shouldPublishRelease', () => {
  it('developからmainへマージされた場合だけ公開する', () => {
    assert.equal(
      shouldPublishRelease({ headRef: 'develop', merged: 'true' }),
      true
    )
    assert.equal(
      shouldPublishRelease({ headRef: 'feature/161', merged: 'true' }),
      false
    )
    assert.equal(
      shouldPublishRelease({ headRef: 'develop', merged: 'false' }),
      false
    )
  })
})

describe('isPrereleaseVersion', () => {
  it('プレリリース識別子の有無を判定する', () => {
    assert.equal(isPrereleaseVersion('v1.0.0'), false)
    assert.equal(isPrereleaseVersion('v1.0.0-rc.1'), true)
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

        assert.deepEqual(result, {
          created: true,
          url: 'https://example.com/v0.2.0',
          version: 'v0.2.0',
        })
        assert.equal(requests.length, 4)
        assert.equal(requests[2].options.method, 'POST')
        assert.equal(requests[3].options.method, 'POST')
      }
    )
  })

  it('同じコミットのタグとReleaseがあれば再作成しない', async () => {
    await withMockFetch(
      [
        createResponse(200, { object: { sha: 'merge-sha' } }),
        createResponse(200, { html_url: 'https://example.com/v0.2.0' }),
      ],
      async (requests) => {
        const result = await publishRelease(releaseInput)

        assert.deepEqual(result, {
          created: false,
          url: 'https://example.com/v0.2.0',
          version: 'v0.2.0',
        })
        assert.equal(requests.length, 2)
      }
    )
  })

  it('タグだけ作成済みならGitHub Releaseを作成する', async () => {
    await withMockFetch(
      [
        createResponse(200, { object: { sha: 'merge-sha' } }),
        createResponse(404, { message: 'Not Found' }),
        createResponse(201, { html_url: 'https://example.com/v0.2.0' }),
      ],
      async (requests) => {
        const result = await publishRelease(releaseInput)

        assert.equal(result.created, true)
        assert.equal(requests.length, 3)
        assert.match(requests[2].url, /\/releases$/)
      }
    )
  })

  it('同名タグが別コミットを指す場合は変更しない', async () => {
    await withMockFetch(
      [createResponse(200, { object: { sha: 'different-sha' } })],
      async (requests) => {
        await assert.rejects(
          () => publishRelease(releaseInput),
          /タグは別のコミットに存在します/
        )
        assert.equal(requests.length, 1)
      }
    )
  })
})
