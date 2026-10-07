export type PublishReleaseInput = {
  headRef: string
  mergeSha: string
  merged: string
  repository: string
  title: string
  token: string
}

export type PublishReleaseResult = {
  created: boolean
  url: string
  version: string
}

export const parseReleaseVersion: (title: string) => string

export const shouldPublishRelease: (input: {
  headRef: string
  merged: string
}) => boolean

export const isPrereleaseVersion: (version: string) => boolean

export const publishRelease: (
  input: PublishReleaseInput
) => Promise<PublishReleaseResult>
