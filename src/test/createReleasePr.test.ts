import { describe, expect, it } from 'vitest'

import {
  buildReleasePrBody,
  createReleasePr,
  normalizeReleaseVersion,
  parseReleaseChanges,
} from '../../scripts/createReleasePr.mjs'

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

type CommandCall = {
  args: string[]
  command: string
}

type ExistingPullRequest = {
  number: number
  title: string
  url: string
}

const createCommandRunner = ({
  changedFiles = 'src/index.ts\n',
  existingPullRequests = [],
  existingTag = '',
}: {
  changedFiles?: string
  existingPullRequests?: ExistingPullRequest[]
  existingTag?: string
} = {}) => {
  const calls: CommandCall[] = []
  const runCommand = async (command: string, args: string[]) => {
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
    expect(normalizeReleaseVersion('v0.2.0')).toBe('v0.2.0')
    expect(normalizeReleaseVersion(' v1.0.0-rc.1 ')).toBe('v1.0.0-rc.1')
  })

  it('不正なバージョンを拒否する', () => {
    expect(() => normalizeReleaseVersion('0.2.0')).toThrow()
    expect(() => normalizeReleaseVersion('v1.2')).toThrow()
  })
})

describe('parseReleaseChanges', () => {
  it('マージPRと直接コミットを変更一覧に変換する', () => {
    expect(parseReleaseChanges(releaseLog)).toEqual([
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

    expect(body).toMatch(/リリースバージョン: `v0\.2\.0`/)
    expect(body).toMatch(/### 変更内容\n\n- #10 楽譜表示を改善/)
    expect(body).toMatch(/### 今回含めない変更\n\nなし/)
    expect(body).not.toMatch(/変更内容 -->/)
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

    expect(result.created).toBe(false)
    expect(result.title).toBe('release: v0.2.0')
    expect(
      calls.some(
        ({ args, command }) => command === 'gh' && args[1] === 'create'
      )
    ).toBe(false)
  })

  it('リリースPRをdevelopからmainへ作成する', async () => {
    const { calls, runCommand } = createCommandRunner()
    const result = await createReleasePr({
      runCommand,
      template,
      version: 'v0.2.0',
    })

    expect(result.created).toBe(true)
    expect(result.url).toBe('https://github.com/example/refinear/pull/20')
    const createCall = calls.find(
      ({ args, command }) => command === 'gh' && args[1] === 'create'
    )
    expect(createCall).toBeDefined()
    expect(createCall?.args).toContain('main')
    expect(createCall?.args).toContain('develop')
  })

  it('同名タグがある場合はPRを作成しない', async () => {
    const { runCommand } = createCommandRunner({ existingTag: 'v0.2.0\n' })

    await expect(
      createReleasePr({
        runCommand,
        template,
        version: 'v0.2.0',
      })
    ).rejects.toThrow(/タグは既に存在します/)
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

    await expect(
      createReleasePr({
        runCommand,
        template,
        version: 'v0.2.0',
      })
    ).rejects.toThrow(/PRが既に存在します/)
  })

  it('mainとdevelopに差分がない場合はPRを作成しない', async () => {
    const { runCommand } = createCommandRunner({ changedFiles: '' })

    await expect(
      createReleasePr({
        runCommand,
        template,
        version: 'v0.2.0',
      })
    ).rejects.toThrow(/リリース対象の差分がありません/)
  })
})
