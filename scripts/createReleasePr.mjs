import { execFile as execFileCallback } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

import { parseReleaseVersion } from './releaseVersion.mjs'

const execFile = promisify(execFileCallback)
const repositoryRoot = fileURLToPath(new URL('..', import.meta.url))
const releaseTemplateUrl = new URL(
  '../.github/PULL_REQUEST_TEMPLATE/release.md',
  import.meta.url
)
const recordSeparator = '\x1e'
const fieldSeparator = '\x1f'

const executeCommand = async (command, args) => {
  const { stdout } = await execFile(command, args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  })
  return stdout
}

export const normalizeReleaseVersion = (value) =>
  parseReleaseVersion(`release: ${value.trim()}`)

export const parseReleaseChanges = (log) =>
  log
    .split(recordSeparator)
    .map((record) => record.trim())
    .filter(Boolean)
    .map((record) => {
      const [sha = '', subject = '', ...bodyParts] =
        record.split(fieldSeparator)
      const body = bodyParts.join(fieldSeparator).trim()
      const pullRequestMatch = subject.match(/^Merge pull request #(\d+)\b/)
      const pullRequestTitle = body
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find(Boolean)

      if (pullRequestMatch) {
        return `- #${pullRequestMatch[1]} ${pullRequestTitle ?? subject}`
      }

      return `- \`${sha.slice(0, 7)}\` ${subject}`
    })

const replaceSection = ({ body, content, heading, nextHeading }) => {
  const headingMarker = `${heading}\n`
  const sectionStart = body.indexOf(headingMarker)
  const sectionEnd = body.indexOf(`\n${nextHeading}`, sectionStart)

  if (sectionStart === -1 || sectionEnd === -1) {
    throw new Error(`リリースPRテンプレートの「${heading}」を更新できません。`)
  }

  const contentStart = sectionStart + headingMarker.length
  return `${body.slice(0, contentStart)}\n${content}\n${body.slice(sectionEnd)}`
}

export const buildReleasePrBody = ({ changes, template, version }) => {
  let body = template.replaceAll('vX.Y.Z', version)
  body = replaceSection({
    body,
    content: changes.join('\n'),
    heading: '### 変更内容',
    nextHeading: '### 今回含めない変更',
  })
  return replaceSection({
    body,
    content: 'なし',
    heading: '### 今回含めない変更',
    nextHeading: '## 🧪 リリース前確認',
  })
}

const parseExistingPullRequests = (value) => {
  try {
    const pullRequests = JSON.parse(value)
    if (!Array.isArray(pullRequests)) throw new Error()
    return pullRequests
  } catch {
    throw new Error('既存のリリースPR確認結果を解析できません。')
  }
}

export const createReleasePr = async ({
  dryRun = false,
  runCommand = executeCommand,
  template,
  version: inputVersion,
}) => {
  const version = normalizeReleaseVersion(inputVersion)
  const title = `release: ${version}`

  await runCommand('git', ['fetch', '--tags', 'origin', 'main', 'develop'])

  const existingTag = await runCommand('git', ['tag', '--list', version])
  if (existingTag.trim()) {
    throw new Error(`${version}タグは既に存在します。`)
  }

  const repository = (
    await runCommand('gh', [
      'repo',
      'view',
      '--json',
      'nameWithOwner',
      '--jq',
      '.nameWithOwner',
    ])
  ).trim()
  if (!repository) {
    throw new Error('GitHubリポジトリを特定できません。')
  }

  const existingPullRequests = parseExistingPullRequests(
    await runCommand('gh', [
      'pr',
      'list',
      '--repo',
      repository,
      '--base',
      'main',
      '--head',
      'develop',
      '--state',
      'open',
      '--json',
      'number,title,url',
      '--limit',
      '1',
    ])
  )
  if (existingPullRequests.length > 0) {
    const existing = existingPullRequests[0]
    throw new Error(
      `developからmainへのPRが既に存在します: ${existing.url ?? `#${existing.number}`}`
    )
  }

  const changedFiles = await runCommand('git', [
    'diff',
    '--name-only',
    'origin/main',
    'origin/develop',
  ])
  if (!changedFiles.trim()) {
    throw new Error('mainとdevelopにリリース対象の差分がありません。')
  }

  const releaseLog = await runCommand('git', [
    'log',
    '--reverse',
    '--first-parent',
    `--format=%H${fieldSeparator}%s${fieldSeparator}%b${recordSeparator}`,
    'origin/main..origin/develop',
  ])
  const changes = parseReleaseChanges(releaseLog)
  if (changes.length === 0) {
    throw new Error('リリース対象の変更一覧を作成できません。')
  }

  const releaseTemplate =
    template ?? (await readFile(releaseTemplateUrl, 'utf8'))
  const body = buildReleasePrBody({
    changes,
    template: releaseTemplate,
    version,
  })

  if (dryRun) {
    return {
      base: 'main',
      body,
      created: false,
      head: 'develop',
      repository,
      title,
    }
  }

  const temporaryDirectory = await mkdtemp(
    join(tmpdir(), 'refinear-release-pr-')
  )
  const bodyFile = join(temporaryDirectory, 'body.md')

  try {
    await writeFile(bodyFile, body, 'utf8')
    const url = (
      await runCommand('gh', [
        'pr',
        'create',
        '--repo',
        repository,
        '--base',
        'main',
        '--head',
        'develop',
        '--title',
        title,
        '--body-file',
        bodyFile,
      ])
    ).trim()

    if (!url) throw new Error('作成したリリースPRのURLを取得できません。')

    return {
      base: 'main',
      body,
      created: true,
      head: 'develop',
      repository,
      title,
      url,
    }
  } finally {
    await rm(temporaryDirectory, { force: true, recursive: true })
  }
}

const usage = '使い方: npm run release:pr -- vX.Y.Z [--dry-run]'

const run = async () => {
  const args = process.argv.slice(2)
  if (args.includes('--help')) {
    console.log(usage)
    return
  }

  const dryRun = args.includes('--dry-run')
  const positionalArgs = args.filter((argument) => !argument.startsWith('--'))
  const unknownOptions = args.filter(
    (argument) => argument.startsWith('--') && argument !== '--dry-run'
  )

  if (positionalArgs.length !== 1 || unknownOptions.length > 0) {
    throw new Error(usage)
  }

  const result = await createReleasePr({
    dryRun,
    version: positionalArgs[0],
  })

  if (dryRun) {
    console.log(`タイトル: ${result.title}`)
    console.log(`base: ${result.base}`)
    console.log(`head: ${result.head}`)
    console.log('\n--- PR本文 ---\n')
    console.log(result.body)
    return
  }

  console.log(`リリースPRを作成しました: ${result.url}`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    await run()
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  }
}
