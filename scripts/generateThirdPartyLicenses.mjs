import { readFile, readdir, writeFile } from 'node:fs/promises'
import { URL } from 'node:url'

const root = new URL('../', import.meta.url)
const lock = JSON.parse(
  await readFile(new URL('package-lock.json', root), 'utf8')
)
const entries = []

for (const [packagePath, metadata] of Object.entries(lock.packages)) {
  if (!packagePath.startsWith('node_modules/') || metadata.dev) continue

  const directory = new URL(`${packagePath}/`, root)
  const files = await readdir(directory)
  const noticeFiles = files
    .filter((file) => /^(licen[cs]e|copying|notice)(\.|$)/i.test(file))
    .sort()
  const notices = await Promise.all(
    noticeFiles.map(async (file) => ({
      file,
      text: (await readFile(new URL(file, directory), 'utf8'))
        .replace(/\r\n?/g, '\n')
        .split('\n')
        .map((line) => line.trimEnd())
        .join('\n'),
    }))
  )

  entries.push({
    name: packagePath.slice('node_modules/'.length),
    version: metadata.version,
    license: metadata.license ?? 'See package distribution',
    notices,
  })
}

entries.sort((left, right) => left.name.localeCompare(right.name))

const sections = entries.map(({ name, version, license, notices }) => {
  const heading = `${name}@${version}\nLicense: ${license}`
  if (notices.length === 0) {
    return `${heading}\n\nNo separate license file was included in the npm package. See its package metadata and upstream source distribution.`
  }
  return `${heading}\n\n${notices
    .map(({ file, text }) => `--- ${file} ---\n${text.trim()}`)
    .join('\n\n')}`
})

const preamble = `REFINEAR THIRD-PARTY LICENSES

This file is generated from the production npm packages installed for Refinear.
It preserves license and notice files shipped in those packages.

webmscore is distributed under GNU GPL version 3. The complete GPL version 3
text is also provided in Refinear's top-level LICENSE file.
`

await writeFile(
  new URL('public/third-party-licenses.txt', root),
  `${preamble}\n${'='.repeat(80)}\n\n${sections.join(
    `\n\n${'='.repeat(80)}\n\n`
  )}\n`
)
