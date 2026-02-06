import * as core from '@actions/core'
import validateCodeOwners from './lib/validator'

async function run(): Promise<void> {
  try {
    const codeOwnersFilePath: string = core.getInput('path')
    const foldersToTrack: string[] = core
      .getInput('folders')
      .split('\n')
      .map(s => s.replace(/^!\s+/, '!').trim())
      .filter(x => x !== '')

    await validateCodeOwners(codeOwnersFilePath, foldersToTrack)
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
  }
}

run()
