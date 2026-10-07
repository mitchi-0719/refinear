import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  buildReleasePrBody,
  createReleasePr,
  normalizeReleaseVersion,
  parseReleaseChanges,
} from './createReleasePr.mjs'

const template = `## 🚀 リリース

### バージョン

- リリースバージョン: \`vX.Y.Z\`

### 変更内容

<!-- 変更内容 -->

-

### 今回含めない変更

<!-- 対象外 -->

-

## 🧪 リリース前確認

- [ ] quality
`

const releaseLog = [
  [
    '1111111111111111111111111111111111111111',
    'Merge pull request #10 from example/feature/10',
    'refs #10 楽譜表示を改善',
  ].join('\x1f'),
  ['2222222222222222222222222222222222222222', '直接コミット', ''].join('\x1f'),
].join('\x1e')

const createCommandRunner = ({
  changedFiles = 'src/index.ts\n',
  existingPullRequests = [],
  existingTag = '',
} = {}) => {
  const calls = []
  const runCommand = async (command, args) => {
    calls.push({ args, command })
    const commandLine = `${command} ${args.join(' ')}`

    if (commandLine.startsWith('git fetch ')) return ''
    if (commandLine.startsWith('git tag --list ')) return existingTag
    if (commandLine.startsWith('gh repo view ')) return 'example/refinear\n'
    if (commandLine.startsWith('gh pr list ')) {
      return JSON.stringify(existingPullRequests)
    }
    if (commandLine.startsWith('git diff --name-only ')) return changedFiles
    if (commandLine.startsWith('git log ')) return releaseLog
    if (commandLine.startsWith('gh pr create ')) {
      return 'https://github.com/example/refinear/pull/20\n'
    }

    throw new Error(`未定義のコマンドです: ${commandLine}`)
  }

  return { calls, runCommand }
}

describe('normalizeReleaseVersion', () => {
  it('vX.Y.Z形式のバージョンを受け入れる', () => {
    assert.equal(normalizeReleaseVersion('v0.2.0'), 'v0.2.0')
    assert.equal(normalizeReleaseVersion(' v1.0.0-rc.1 '), 'v1.0.0-rc.1')
  })

  it('不正なバージョンを拒否する', () => {
    assert.throws(() => normalizeReleaseVersion('0.2.0'))
    assert.throws(() => normalizeReleaseVersion('v1.2'))
  })
})

describe('parseReleaseChanges', () => {
  it('マージPRと直接コミットを変更一覧に変換する', () => {
    assert.deepEqual(parseReleaseChanges(releaseLog), [
      '- #10 refs #10 楽譜表示を改善',
      '- `2222222` 直接コミット',
    ])
  })
})

describe('buildReleasePrBody', () => {
  it('テンプレートへバージョンと変更一覧を反映する', () => {
    const body = buildReleasePrBody({
      changes: ['- #10 楽譜表示を改善'],
      template,
      version: 'v0.2.0',
    })

    assert.match(body, /リリースバージョン: `v0\.2\.0`/)
    assert.match(body, /### 変更内容\n\n- #10 楽譜表示を改善/)
    assert.match(body, /### 今回含めない変更\n\nなし/)
    assert.doesNotMatch(body, /変更内容 -->/)
  })
})

describe('createReleasePr', () => {
  it('dry-runではPRを作成せず内容を返す', async () => {
    const { calls, runCommand } = createCommandRunner()
    const result = await createReleasePr({
      dryRun: true,
      runCommand,
      template,
      version: 'v0.2.0',
    })

    assert.equal(result.created, false)
    assert.equal(result.title, 'release: v0.2.0')
    assert.equal(
      calls.some(
        ({ args, command }) => command === 'gh' && args[1] === 'create'
      ),
      false
    )
  })

  it('リリースPRをdevelopからmainへ作成する', async () => {
    const { calls, runCommand } = createCommandRunner()
    const result = await createReleasePr({
      runCommand,
      template,
      version: 'v0.2.0',
    })

    assert.equal(result.created, true)
    assert.equal(result.url, 'https://github.com/example/refinear/pull/20')
    const createCall = calls.find(
      ({ args, command }) => command === 'gh' && args[1] === 'create'
    )
    assert.ok(createCall)
    assert.ok(createCall.args.includes('main'))
    assert.ok(createCall.args.includes('develop'))
  })

  it('同名タグがある場合はPRを作成しない', async () => {
    const { runCommand } = createCommandRunner({ existingTag: 'v0.2.0\n' })

    await assert.rejects(
      () =>
        createReleasePr({
          runCommand,
          template,
          version: 'v0.2.0',
        }),
      /タグは既に存在します/
    )
  })

  it('developからmainへのPRがある場合は重複作成しない', async () => {
    const { runCommand } = createCommandRunner({
      existingPullRequests: [
        {
          number: 19,
          title: 'release: v0.2.0',
          url: 'https://github.com/example/refinear/pull/19',
        },
      ],
    })

    await assert.rejects(
      () =>
        createReleasePr({
          runCommand,
          template,
          version: 'v0.2.0',
        }),
      /PRが既に存在します/
    )
  })

  it('mainとdevelopに差分がない場合はPRを作成しない', async () => {
    const { runCommand } = createCommandRunner({ changedFiles: '' })

    await assert.rejects(
      () =>
        createReleasePr({
          runCommand,
          template,
          version: 'v0.2.0',
        }),
      /リリース対象の差分がありません/
    )
  })
})
