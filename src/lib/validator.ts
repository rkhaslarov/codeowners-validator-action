import * as fs from 'fs'
import {minimatch} from 'minimatch'
import * as readline from 'readline'

const fsAsync = fs.promises

type CodeOwnersData = {
  rules: Map<string, number>
}

/**
 * Checks if a line in CODEOWNERS file is valid (not a comment and not empty)
 */
export function isValidCodeOwnersLine(line: string): boolean {
  return !line.startsWith('#') && line.trim().length > 0
}

/**
 * Parses the CODEOWNERS file and returns a Map of rules with match counters (initialized to 0)
 */
async function parseCodeOwnersFile(
  codeOwnersFilePath: string
): Promise<CodeOwnersData> {
  const rules = new Map<string, number>()

  const fileStream = fs.createReadStream(codeOwnersFilePath)
  const lineReader = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  })

  for await (const line of lineReader) {
    if (!isValidCodeOwnersLine(line)) {
      continue
    }

    const [pathPattern] = line.split(' ')
    rules.set(pathPattern, 0)
  }

  return {rules}
}

/**
 * Recursively scans a directory and returns all file paths
 */
async function getAllFiles(directoryPath: string): Promise<string[]> {
  const items = await fsAsync.readdir(directoryPath, {withFileTypes: true})

  const files: string[] = []
  const directories: string[] = []

  for (const item of items) {
    const fullPath = `${directoryPath}/${item.name}`
    if (item.isDirectory()) {
      directories.push(fullPath)
    } else if (item.isFile()) {
      files.push(fullPath)
    }
  }

  // Recursively scan each subdirectory
  const nestedFiles = await Promise.all(
    directories.map(dir => getAllFiles(dir))
  )

  return [...files, ...nestedFiles.flat()]
}

/**
 * Scans multiple root folders and returns all file paths
 */
async function scanAllFiles(rootFolders: string[]): Promise<string[]> {
  const allFiles = await Promise.all(
    rootFolders.map(folder => getAllFiles(folder))
  )

  return allFiles.flat()
}

/**
 * Normalizes a path for comparison: strip leading ./ and /, trailing slashes, use forward slashes.
 * Handles both rules (with or without leading /) and scanned paths consistently.
 */
function normalizePath(p: string): string {
  return p
    .replace(/^\.\//, '')
    .replace(/^\//, '')
    .replace(/\/+$/, '')
    .replace(/\\/g, '/')
}

/**
 * Checks if a CODEOWNERS rule matches a file path using glob matching.
 * Supports *, **, and directory rules (with or without leading/trailing slashes).
 */
export function ruleMatchesPath(rule: string, filePath: string): boolean {
  const cleanRule = normalizePath(rule)
  const cleanPath = normalizePath(filePath)

  const hasGlob = cleanRule.includes('*')

  if (hasGlob) {
    return minimatch(cleanPath, cleanRule, {matchBase: true})
  }

  // For non-glob rules, check if:
  // 1. Exact match (for file rules like /pkg/config.ts)
  // 2. File is under the rule directory (for directory rules like /pkg/lib)
  return (
    minimatch(cleanPath, cleanRule) ||
    minimatch(cleanPath, cleanRule + '/**')
  )
}

/**
 * Checks if a rule is relevant to any of the provided folders.
 * A rule is relevant if it could potentially match files in those folders.
 */
export function isRuleRelevantToFolders(
  rule: string,
  folders: string[]
): boolean {
  const cleanRule = normalizePath(rule)

  for (const folder of folders) {
    const cleanFolder = normalizePath(folder)

    // Rule starts with folder path (rule is inside folder)
    if (cleanRule.startsWith(cleanFolder + '/') || cleanRule === cleanFolder) {
      return true
    }

    // Folder starts with rule path (folder is inside rule's scope)
    if (cleanFolder.startsWith(cleanRule + '/') || cleanFolder === cleanRule) {
      return true
    }

    // Rule has glob that could match folder
    if (cleanRule.includes('*')) {
      // Check if the glob pattern could match the folder or files in it
      if (minimatch(cleanFolder, cleanRule, {matchBase: true})) {
        return true
      }
      // Check if folder is under a directory that matches the rule's base
      const ruleBase = cleanRule.split('*')[0].replace(/\/$/, '')
      if (
        ruleBase &&
        (cleanFolder.startsWith(ruleBase + '/') || cleanFolder === ruleBase)
      ) {
        return true
      }
    }
  }

  return false
}

/**
 * Checks if a file path is owned by any rule and increments the counter for every matching rule.
 */
function checkOwnership(filePath: string, rules: Map<string, number>): boolean {
  let owned = false
  for (const [rule, count] of rules) {
    if (ruleMatchesPath(rule, filePath)) {
      rules.set(rule, count + 1)
      owned = true
    }
  }
  return owned
}

/**
 * Validates that all files in the specified folders have code owners defined.
 * Also validates that all relevant rules in CODEOWNERS match at least one file.
 * Reports all validation errors at once.
 */
async function validateCodeOwners(
  codeOwnersFilePath: string,
  foldersToValidate: string[]
): Promise<void> {
  const [{rules}, allFilePaths] = await Promise.all([
    parseCodeOwnersFile(codeOwnersFilePath),
    scanAllFiles(foldersToValidate)
  ])

  // Check ownership for each file (also increments rule counters)
  const uncoveredFiles = allFilePaths.filter(
    filePath => !checkOwnership(filePath, rules)
  )

  // Find rules that are relevant to the folders but never matched any file (counter is 0)
  const unusedRules = [...rules.entries()]
    .filter(
      ([rule, count]) =>
        count === 0 && isRuleRelevantToFolders(rule, foldersToValidate)
    )
    .map(([rule]) => rule)

  // Collect all error messages
  const errorMessages: string[] = []

  if (unusedRules.length > 0) {
    errorMessages.push(
      'CODEOWNERS contains rules that do not match any files in the specified folders:',
      ...unusedRules.map(rule => `  - ${rule}`),
      '',
      'Please remove these entries or verify the paths exist.'
    )
  }

  if (uncoveredFiles.length > 0) {
    errorMessages.push(
      'The following files do not have owners:',
      ...uncoveredFiles.map(path => `  - ${path}`),
      '',
      'Please add rules to CODEOWNERS to cover these files.'
    )
  }

  if (errorMessages.length > 0) {
    throw new Error('\n' + errorMessages.join('\n'))
  }
}

export default validateCodeOwners
