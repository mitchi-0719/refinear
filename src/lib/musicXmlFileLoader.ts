export type SupportedScoreFileFormat = 'mscz' | 'mxl' | 'musicxml'

export type LoadedMusicScore = {
  musicXml: string
  musicMxl: Uint8Array | null
}

const PLAYABLE_MUSIC_XML_ERROR =
  'MusicXMLファイルを読み込めませんでした。対応するMusicXML形式か確認してください。'

export const getSupportedScoreFileFormat = (
  fileName: string
): SupportedScoreFileFormat | null => {
  const normalizedFileName = fileName.toLowerCase()

  if (normalizedFileName.endsWith('.mscz')) return 'mscz'
  if (normalizedFileName.endsWith('.mxl')) return 'mxl'
  if (normalizedFileName.endsWith('.musicxml')) return 'musicxml'

  return null
}

const assertPlayableMusicXml = (musicXml: string): void => {
  const doc = new DOMParser().parseFromString(musicXml, 'application/xml')
  const hasParserError = Boolean(doc.querySelector('parsererror'))
  const scoreParts = doc.querySelectorAll('part-list > score-part').length
  const parts = doc.querySelectorAll('score-partwise > part').length
  const measures = doc.querySelectorAll(
    'score-partwise > part > measure'
  ).length

  if (hasParserError || scoreParts === 0 || parts === 0 || measures === 0) {
    throw new Error(PLAYABLE_MUSIC_XML_ERROR)
  }
}

const getMxlMusicXml = async (fileBinary: Uint8Array): Promise<string> => {
  const JSZip = (await import('jszip')).default
  const zip = await JSZip.loadAsync(fileBinary)
  const containerEntry = zip.file('META-INF/container.xml')
  const containerXml = containerEntry
    ? await containerEntry.async('string')
    : null
  const containerDoc = containerXml
    ? new DOMParser().parseFromString(containerXml, 'application/xml')
    : null
  const rootFilePath = containerDoc
    ?.querySelector('rootfile')
    ?.getAttribute('full-path')
  const scoreEntry = rootFilePath
    ? zip.file(rootFilePath)
    : Object.values(zip.files).find(
        (entry) =>
          !entry.dir &&
          !entry.name.startsWith('META-INF/') &&
          /\.(musicxml|xml)$/i.test(entry.name)
      )

  if (!scoreEntry) {
    throw new Error('MXL内のMusicXMLを特定できませんでした')
  }

  return scoreEntry.async('string')
}

export const loadMusicXmlFile = async (
  fileFormat: Exclude<SupportedScoreFileFormat, 'mscz'>,
  fileBinary: Uint8Array
): Promise<LoadedMusicScore> => {
  if (fileFormat === 'musicxml') {
    const musicXml = new TextDecoder().decode(fileBinary)
    assertPlayableMusicXml(musicXml)
    return { musicXml, musicMxl: null }
  }

  const musicXml = await getMxlMusicXml(fileBinary)
  assertPlayableMusicXml(musicXml)
  return { musicXml, musicMxl: fileBinary }
}
