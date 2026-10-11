import JSZip from 'jszip'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { convertMsczToMusicXml } from './msczConverter'

const webMscoreMocks = vi.hoisted(() => ({
  load: vi.fn(),
  saveMxl: vi.fn(),
  saveXml: vi.fn(),
}))

vi.mock('webmscore', () => ({
  default: {
    load: webMscoreMocks.load,
  },
}))

vi.mock('./logger', () => ({
  logger: {
    warn: vi.fn(),
  },
}))

type TestElement = {
  children: TestElement[]
  tagName: string
  textContent: string
}

const createElement = (
  tagName: string,
  textContent = '',
  children: TestElement[] = []
): TestElement => ({ children, tagName, textContent })

const getTagText = (source: string, tagName: string): string | null =>
  source.match(new RegExp(`<${tagName}>([\\s\\S]*?)</${tagName}>`))?.[1] ?? null

const parseHarmony = (source: string): TestElement => {
  const harmonyInfoSource = source.match(
    /<harmonyInfo>([\s\S]*?)<\/harmonyInfo>/
  )?.[1]
  if (harmonyInfoSource === undefined) return createElement('Harmony')

  const children = ['root', 'bass', 'name'].flatMap((tagName) => {
    const text = getTagText(harmonyInfoSource, tagName)
    return text === null ? [] : [createElement(tagName, text)]
  })

  return createElement('Harmony', '', [
    createElement('harmonyInfo', '', children),
  ])
}

class TestDocument {
  private readonly source: string

  constructor(source: string) {
    this.source = source
  }

  querySelector(selector: string) {
    if (selector === 'parsererror' || selector === 'Score') return null
    return null
  }

  querySelectorAll(selector: string): TestElement[] {
    if (selector === 'Harmony') {
      return (this.source.match(/<Harmony>[\s\S]*?<\/Harmony>/g) ?? []).map(
        parseHarmony
      )
    }
    if (selector === 'part-list > score-part') {
      return this.source.includes('<score-part ') ? [createElement('part')] : []
    }
    if (selector === 'score-partwise > part') {
      return this.source.includes('<part ') ? [createElement('part')] : []
    }
    if (selector === 'score-partwise > part > measure') {
      return this.source.includes('<measure ') ? [createElement('measure')] : []
    }
    return []
  }
}

class TestDomParser {
  parseFromString(source: string) {
    return new TestDocument(source)
  }
}

const createMscz = async (harmonies: string[]): Promise<Uint8Array> => {
  const zip = new JSZip()
  zip.file(
    'score.mscx',
    `<museScore><Score>${harmonies.join('')}</Score></museScore>`
  )
  return zip.generateAsync({ type: 'uint8array' })
}

const createMusicXml = (harmonies: string[]): string => `
<score-partwise>
  <part-list><score-part id="P1" /></part-list>
  <part id="P1">
    <measure number="1">${harmonies.join('')}</measure>
  </part>
</score-partwise>`

const noneHarmony =
  '<harmony><root><root-step>C</root-step></root><kind>none</kind></harmony>'

describe('convertMsczToMusicXml', () => {
  beforeEach(() => {
    vi.stubGlobal('DOMParser', TestDomParser)
    webMscoreMocks.load.mockResolvedValue({
      saveMxl: webMscoreMocks.saveMxl,
      saveXml: webMscoreMocks.saveXml,
    })
    webMscoreMocks.saveMxl.mockRejectedValue(new Error('MXL unavailable'))
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })

  it('ルート音のないHarmonyを維持しながら通常コードを復元する', async () => {
    const untouchedHarmony =
      '<harmony><root><root-step>C</root-step></root><kind text="">none</kind></harmony>'
    webMscoreMocks.saveXml.mockResolvedValue(
      createMusicXml([noneHarmony, untouchedHarmony, noneHarmony])
    )
    const mscz = await createMscz([
      '<Harmony><harmonyInfo><root>14</root><name>m7</name></harmonyInfo></Harmony>',
      '<Harmony><harmonyInfo><name>バックコーラスのイメージ</name></harmonyInfo></Harmony>',
      '<Harmony><harmonyInfo><root>15</root><name>7</name></harmonyInfo></Harmony>',
    ])

    const { musicXml } = await convertMsczToMusicXml(mscz)
    const harmonies = musicXml.match(/<harmony\b[\s\S]*?<\/harmony>/g)

    expect(harmonies).toHaveLength(3)
    expect(harmonies?.[0]).toContain('<root-step>C</root-step>')
    expect(harmonies?.[0]).toContain('<kind text="m7">minor-seventh</kind>')
    expect(harmonies?.[1]).toBe(untouchedHarmony)
    expect(harmonies?.[2]).toContain('<root-step>G</root-step>')
    expect(harmonies?.[2]).toContain('<kind text="7">dominant</kind>')
  })

  it('MSCXとMusicXMLのHarmony数が異なる場合は補正しない', async () => {
    const rawMusicXml = createMusicXml([noneHarmony])
    webMscoreMocks.saveXml.mockResolvedValue(rawMusicXml)
    const mscz = await createMscz([
      '<Harmony><harmonyInfo><root>14</root></harmonyInfo></Harmony>',
      '<Harmony><harmonyInfo><root>15</root></harmonyInfo></Harmony>',
    ])

    await expect(convertMsczToMusicXml(mscz)).resolves.toMatchObject({
      musicXml: rawMusicXml,
    })
  })
})
