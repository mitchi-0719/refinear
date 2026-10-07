export type ReleasePrCommandRunner = (
  command: string,
  args: string[]
) => Promise<string>

export type CreateReleasePrInput = {
  dryRun?: boolean
  runCommand?: ReleasePrCommandRunner
  template?: string
  version: string
}

export type CreateReleasePrResult = {
  base: 'main'
  body: string
  created: boolean
  head: 'develop'
  repository: string
  title: string
  url?: string
}

export const normalizeReleaseVersion: (value: string) => string

export const parseReleaseChanges: (log: string) => string[]

export const buildReleasePrBody: (input: {
  changes: string[]
  template: string
  version: string
}) => string

export const createReleasePr: (
  input: CreateReleasePrInput
) => Promise<CreateReleasePrResult>
