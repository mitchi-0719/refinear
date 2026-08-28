const stableVersionPattern =
  '(?:0|[1-9]\\d*)\\.(?:0|[1-9]\\d*)\\.(?:0|[1-9]\\d*)'
const prereleaseIdentifierPattern = '(?:0|[1-9]\\d*|\\d*[A-Za-z-][0-9A-Za-z-]*)'
const prereleasePattern = `(?:-${prereleaseIdentifierPattern}(?:\\.${prereleaseIdentifierPattern})*)?`
const buildPattern = '(?:\\+[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?'
const releaseTitlePattern = new RegExp(
  `^release: (v${stableVersionPattern}${prereleasePattern}${buildPattern})$`
)

export const parseReleaseVersion = (title) => {
  const match = releaseTitlePattern.exec(title)

  if (!match) {
    throw new Error(
      'リリースPRのタイトルは「release: vX.Y.Z」形式にしてください。'
    )
  }

  return match[1]
}

export const shouldPublishRelease = ({ headRef, merged }) =>
  merged === 'true' && headRef === 'develop'

export const isPrereleaseVersion = (version) =>
  version.split('+', 1)[0].includes('-')

const requestGitHub = async ({ body, method = 'GET', path, token }) => {
  const response = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })

  if (response.status === 204) return null

  const responseBody = await response.json()
  return { body: responseBody, ok: response.ok, status: response.status }
}

const getTagCommitSha = async ({ repository, token, version }) => {
  const result = await requestGitHub({
    path: `/repos/${repository}/git/ref/tags/${encodeURIComponent(version)}`,
    token,
  })

  if (result.status === 404) return null
  if (!result.ok) {
    throw new Error(`タグの確認に失敗しました（HTTP ${result.status}）。`)
  }

  let object = result.body.object
  const visitedTagShas = new Set()

  while (object.type === 'tag') {
    if (visitedTagShas.has(object.sha)) {
      throw new Error(`${version}タグの参照が循環しています。`)
    }
    visitedTagShas.add(object.sha)

    const tagResult = await requestGitHub({
      path: `/repos/${repository}/git/tags/${encodeURIComponent(object.sha)}`,
      token,
    })

    if (!tagResult.ok) {
      throw new Error(
        `注釈付きタグの確認に失敗しました（HTTP ${tagResult.status}）。`
      )
    }

    object = tagResult.body.object
  }

  if (object.type !== 'commit') {
    throw new Error(`${version}タグがコミットを指していません。`)
  }

  return object.sha
}

const getRelease = async ({ repository, token, version }) => {
  const result = await requestGitHub({
    path: `/repos/${repository}/releases/tags/${encodeURIComponent(version)}`,
    token,
  })

  if (result.status === 404) return null
  if (!result.ok) {
    throw new Error(
      `GitHub Releaseの確認に失敗しました（HTTP ${result.status}）。`
    )
  }

  return result.body
}

const createTag = async ({ mergeSha, repository, token, version }) => {
  const result = await requestGitHub({
    body: {
      ref: `refs/tags/${version}`,
      sha: mergeSha,
    },
    method: 'POST',
    path: `/repos/${repository}/git/refs`,
    token,
  })

  if (!result.ok) {
    throw new Error(`タグの作成に失敗しました（HTTP ${result.status}）。`)
  }
}

const createRelease = async ({ mergeSha, repository, token, version }) => {
  const result = await requestGitHub({
    body: {
      generate_release_notes: true,
      name: version,
      prerelease: isPrereleaseVersion(version),
      tag_name: version,
      target_commitish: mergeSha,
    },
    method: 'POST',
    path: `/repos/${repository}/releases`,
    token,
  })

  if (!result.ok) {
    throw new Error(
      `GitHub Releaseの作成に失敗しました（HTTP ${result.status}）。`
    )
  }

  return result.body.html_url
}

export const publishRelease = async ({
  headRef,
  mergeSha,
  merged,
  repository,
  title,
  token,
}) => {
  if (!shouldPublishRelease({ headRef, merged })) {
    throw new Error('developからmainへマージされたPRだけを公開できます。')
  }

  const version = parseReleaseVersion(title)
  const existingTagSha = await getTagCommitSha({ repository, token, version })

  if (existingTagSha && existingTagSha !== mergeSha) {
    throw new Error(`${version}タグは別のコミットに存在します。`)
  }

  const existingRelease = await getRelease({ repository, token, version })
  if (existingRelease) {
    if (!existingTagSha) {
      throw new Error(`${version}のGitHub Releaseだけが存在します。`)
    }

    return { created: false, url: existingRelease.html_url, version }
  }

  if (!existingTagSha) {
    await createTag({ mergeSha, repository, token, version })
  }

  const url = await createRelease({
    mergeSha,
    repository,
    token,
    version,
  })

  return { created: true, url, version }
}

const run = async () => {
  const {
    GITHUB_TOKEN: token,
    RELEASE_HEAD_REF: headRef,
    RELEASE_MERGE_SHA: mergeSha,
    RELEASE_PR_MERGED: merged,
    RELEASE_PR_TITLE: title,
    RELEASE_REPOSITORY: repository,
  } = process.env

  const requiredValues = { headRef, mergeSha, merged, repository, title, token }
  const missingKeys = Object.entries(requiredValues)
    .filter(([, value]) => !value)
    .map(([key]) => key)

  if (missingKeys.length > 0) {
    throw new Error(`必要な環境変数がありません: ${missingKeys.join(', ')}`)
  }

  const result = await publishRelease(requiredValues)
  console.log(
    result.created
      ? `${result.version}を公開しました: ${result.url}`
      : `${result.version}は公開済みです: ${result.url}`
  )
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  await run()
}
