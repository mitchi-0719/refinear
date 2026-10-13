import JSZip from 'jszip'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  getSupportedScoreFileFormat,
  loadMusicXmlFile,
} from './musicXmlFileLoader'

const musicXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise>
  <part-list><score-part id="P1" /></part-list>
  <part id="P1"><measure number="1" /></part>
</score-partwise>`

class TestDocument {
  private readonly source: string

  constructor(source: string) {
    this.source = source
  }

  querySelector(selector: string) {
    if (selector === 'parsererror') return null
    if (selector === 'rootfile' && this.source.includes('<container')) {
      return {
        getAttribute: (name: string) =>
          name === 'full-path' ? 'scores/main.musicxml' : null,
      }
    }
    return null
  }

  querySelectorAll(selector: string) {
    if (selector === 'part-list > score-part') {
      return this.source.includes('<score-part') ? [{}] : []
    }
    if (selector === 'score-partwise > part') {
      return this.source.includes('<part id=') ? [{}] : []
    }
    if (selector === 'score-partwise > part > measure') {
      return this.source.includes('<measure ') ? [{}] : []
    }
    return []
  }
}

class TestDomParser {
  parseFromString(source: string) {
    return new TestDocument(source)
  }
}

describe('musicXmlFileLoader', () => {
  beforeEach(() => {
    vi.stubGlobal('DOMParser', TestDomParser)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it.each([
    ['score.mscz', 'mscz'],
    ['score.MXL', 'mxl'],
    ['score.musicxml', 'musicxml'],
    ['score.xml', null],
    ['score.mid', null],
  ] as const)('拡張子 %s を判定する', (fileName, expected) => {
    expect(getSupportedScoreFileFormat(fileName)).toBe(expected)
  })

  it('MusicXMLを直接読み込む', async () => {
    await expect(
      loadMusicXmlFile('musicxml', new TextEncoder().encode(musicXml))
    ).resolves.toEqual({ musicXml, musicMxl: null })
  })

  it('container.xmlの参照先からMXL内のMusicXMLを読み込む', async () => {
    const zip = new JSZip()
    zip.file(
      'META-INF/container.xml',
      '<container><rootfiles><rootfile full-path="scores/main.musicxml" /></rootfiles></container>'
    )
    zip.file('scores/main.musicxml', musicXml)
    const mxl = await zip.generateAsync({ type: 'uint8array' })

    await expect(loadMusicXmlFile('mxl', mxl)).resolves.toEqual({
      musicXml,
      musicMxl: mxl,
    })
  })

  it('MXLにcontainer.xmlがない場合はMusicXMLエントリを探す', async () => {
    const zip = new JSZip()
    zip.file('score.xml', musicXml)
    const mxl = await zip.generateAsync({ type: 'uint8array' })

    await expect(loadMusicXmlFile('mxl', mxl)).resolves.toEqual({
      musicXml,
      musicMxl: mxl,
    })
  })

  it('楽譜情報が不足したMusicXMLを拒否する', async () => {
    await expect(
      loadMusicXmlFile(
        'musicxml',
        new TextEncoder().encode('<score-partwise />')
      )
    ).rejects.toThrow('MusicXMLファイルを読み込めませんでした')
  })
})
