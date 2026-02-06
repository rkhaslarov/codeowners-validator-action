import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import validateCodeOwners, {
  isRuleRelevantToFolders,
  isValidCodeOwnersLine,
  ruleMatchesPath
} from './validator'

const fsAsync = fs.promises

describe('isValidCodeOwnersLine', () => {
  it('returns false for comment lines', () => {
    expect(isValidCodeOwnersLine('# comment')).toBe(false)
    expect(isValidCodeOwnersLine('## section')).toBe(false)
    expect(isValidCodeOwnersLine('#')).toBe(false)
  })

  it('returns false for empty or whitespace-only lines', () => {
    expect(isValidCodeOwnersLine('')).toBe(false)
    expect(isValidCodeOwnersLine('   ')).toBe(false)
    expect(isValidCodeOwnersLine('\t')).toBe(false)
  })

  it('returns true for valid rule lines', () => {
    expect(isValidCodeOwnersLine('/pkg/lib @owner')).toBe(true)
    expect(isValidCodeOwnersLine('*.ts @team')).toBe(true)
    expect(isValidCodeOwnersLine('  /pkg @owner')).toBe(true)
  })
})

describe('ruleMatchesPath', () => {
  describe('exact file match', () => {
    it('matches identical file paths', () => {
      expect(ruleMatchesPath('/pkg/lib/index.ts', 'pkg/lib/index.ts')).toBe(
        true
      )
      expect(ruleMatchesPath('pkg/config.json', 'pkg/config.json')).toBe(true)
    })

    it('matches with ./ prefix in path', () => {
      expect(ruleMatchesPath('/pkg/lib/file.ts', './pkg/lib/file.ts')).toBe(
        true
      )
    })
  })

  describe('directory rules matching files', () => {
    it('matches files under the rule directory', () => {
      expect(ruleMatchesPath('/pkg', 'pkg/lib/index.ts')).toBe(true)
      expect(ruleMatchesPath('/pkg/lib', 'pkg/lib/utils/helper.ts')).toBe(true)
    })

    it('does not match files outside the directory', () => {
      expect(ruleMatchesPath('/pkg/lib', 'pkg/utils/helper.ts')).toBe(false)
      expect(ruleMatchesPath('/pkg/foo', 'pkg/foobar/index.ts')).toBe(false)
    })
  })

  describe('wildcard patterns', () => {
    it('matches single wildcard patterns', () => {
      expect(ruleMatchesPath('/.config/run-*', '.config/run-tests.sh')).toBe(
        true
      )
      expect(ruleMatchesPath('/.config/run-*', '.config/run-lint.js')).toBe(
        true
      )
    })

    it('matches file extension patterns', () => {
      expect(ruleMatchesPath('*.ts', 'pkg/lib/index.ts')).toBe(true)
      expect(ruleMatchesPath('*.json', 'config/settings.json')).toBe(true)
    })

    it('does not match when pattern does not apply', () => {
      expect(ruleMatchesPath('/.config/run-*', '.config/other.sh')).toBe(false)
      expect(ruleMatchesPath('*.ts', 'pkg/lib/index.js')).toBe(false)
    })

    it('supports ** glob for multiple segments', () => {
      expect(ruleMatchesPath('pkg/**/foo.ts', 'pkg/a/foo.ts')).toBe(true)
      expect(ruleMatchesPath('pkg/**/foo.ts', 'pkg/a/b/foo.ts')).toBe(true)
      expect(ruleMatchesPath('pkg/**/foo.ts', 'pkg/foo.ts')).toBe(true)
      expect(ruleMatchesPath('pkg/**/foo.ts', 'pkg/bar.ts')).toBe(false)
    })
  })
})

describe('isRuleRelevantToFolders', () => {
  it('returns true when rule is inside folder', () => {
    expect(isRuleRelevantToFolders('/src/lib', ['src'])).toBe(true)
    expect(isRuleRelevantToFolders('/src/lib/utils', ['src/lib'])).toBe(true)
  })

  it('returns true when folder is inside rule scope', () => {
    expect(isRuleRelevantToFolders('/src', ['src/lib'])).toBe(true)
    expect(isRuleRelevantToFolders('/pkg', ['pkg/modules/foo'])).toBe(true)
  })

  it('returns true when rule exactly matches folder', () => {
    expect(isRuleRelevantToFolders('/src', ['src'])).toBe(true)
    expect(isRuleRelevantToFolders('src', ['src'])).toBe(true)
  })

  it('returns false when rule is unrelated to folders', () => {
    expect(isRuleRelevantToFolders('/docs', ['src'])).toBe(false)
    expect(isRuleRelevantToFolders('/pkg/other', ['pkg/lib'])).toBe(false)
  })

  it('handles glob patterns correctly', () => {
    expect(isRuleRelevantToFolders('*.ts', ['src'])).toBe(false)
    expect(isRuleRelevantToFolders('/src/*.ts', ['src'])).toBe(true)
    expect(isRuleRelevantToFolders('/src/**/*.ts', ['src/lib'])).toBe(true)
  })

  it('handles multiple folders', () => {
    expect(isRuleRelevantToFolders('/src/lib', ['src', 'pkg'])).toBe(true)
    expect(isRuleRelevantToFolders('/pkg/utils', ['src', 'pkg'])).toBe(true)
    expect(isRuleRelevantToFolders('/docs', ['src', 'pkg'])).toBe(false)
  })
})

describe('validateCodeOwners', () => {
  let tmpDir: string
  let originalCwd: string

  beforeEach(async () => {
    originalCwd = process.cwd()
    tmpDir = await fsAsync.mkdtemp(
      path.join(os.tmpdir(), 'codeowners-test-')
    )
    process.chdir(tmpDir)
  })

  afterEach(async () => {
    process.chdir(originalCwd)
    await fsAsync.rm(tmpDir, {recursive: true, force: true})
  })

  it('passes when all files are covered', async () => {
    await fsAsync.writeFile('CODEOWNERS', '/pkg/lib @owner\n/pkg/utils @owner\n')
    await fsAsync.mkdir(path.join('pkg', 'lib'), {recursive: true})
    await fsAsync.mkdir(path.join('pkg', 'utils'), {recursive: true})
    await fsAsync.writeFile(path.join('pkg', 'lib', 'index.ts'), '')
    await fsAsync.writeFile(path.join('pkg', 'utils', 'helper.ts'), '')

    await expect(
      validateCodeOwners(path.join(tmpDir, 'CODEOWNERS'), ['pkg'])
    ).resolves.toBeUndefined()
  })

  it('throws when a file has no owner', async () => {
    await fsAsync.writeFile('CODEOWNERS', '/pkg/lib @owner\n')
    await fsAsync.mkdir(path.join('pkg', 'lib'), {recursive: true})
    await fsAsync.mkdir(path.join('pkg', 'unowned'), {recursive: true})
    await fsAsync.writeFile(path.join('pkg', 'lib', 'index.ts'), '')
    await fsAsync.writeFile(path.join('pkg', 'unowned', 'file.ts'), '')

    await expect(
      validateCodeOwners(path.join(tmpDir, 'CODEOWNERS'), ['pkg'])
    ).rejects.toThrow(/do not have owners/)
  })

  it('throws when a relevant rule matches no files', async () => {
    await fsAsync.writeFile(
      'CODEOWNERS',
      '/pkg/lib @owner\n/pkg/removed @owner\n'
    )
    await fsAsync.mkdir(path.join('pkg', 'lib'), {recursive: true})
    await fsAsync.writeFile(path.join('pkg', 'lib', 'index.ts'), '')

    await expect(
      validateCodeOwners(path.join(tmpDir, 'CODEOWNERS'), ['pkg'])
    ).rejects.toThrow(/do not match any files/)
  })

  it('ignores rules not relevant to the folders', async () => {
    await fsAsync.writeFile(
      'CODEOWNERS',
      '/pkg/lib @owner\n/docs @owner\n/.github @owner\n'
    )
    await fsAsync.mkdir(path.join('pkg', 'lib'), {recursive: true})
    await fsAsync.writeFile(path.join('pkg', 'lib', 'index.ts'), '')

    // Should pass - /docs and /.github are not relevant to pkg folder
    await expect(
      validateCodeOwners(path.join(tmpDir, 'CODEOWNERS'), ['pkg'])
    ).resolves.toBeUndefined()
  })

  it('reports both uncovered files and unused rules', async () => {
    await fsAsync.writeFile('CODEOWNERS', '/pkg/stale @owner\n')
    await fsAsync.mkdir(path.join('pkg', 'unowned'), {recursive: true})
    await fsAsync.writeFile(path.join('pkg', 'unowned', 'file.ts'), '')

    await expect(
      validateCodeOwners(path.join(tmpDir, 'CODEOWNERS'), ['pkg'])
    ).rejects.toThrow(/do not match any files/)

    await expect(
      validateCodeOwners(path.join(tmpDir, 'CODEOWNERS'), ['pkg'])
    ).rejects.toThrow(/do not have owners/)
  })

  it('matches files with glob patterns', async () => {
    await fsAsync.writeFile('CODEOWNERS', '*.ts @owner\n')
    await fsAsync.mkdir(path.join('pkg', 'lib'), {recursive: true})
    await fsAsync.writeFile(path.join('pkg', 'lib', 'index.ts'), '')
    await fsAsync.writeFile(path.join('pkg', 'lib', 'utils.ts'), '')

    await expect(
      validateCodeOwners(path.join(tmpDir, 'CODEOWNERS'), ['pkg'])
    ).resolves.toBeUndefined()
  })

  it('handles nested directory structures', async () => {
    await fsAsync.writeFile('CODEOWNERS', '/pkg @owner\n')
    await fsAsync.mkdir(path.join('pkg', 'a', 'b', 'c'), {recursive: true})
    await fsAsync.writeFile(path.join('pkg', 'a', 'file1.ts'), '')
    await fsAsync.writeFile(path.join('pkg', 'a', 'b', 'file2.ts'), '')
    await fsAsync.writeFile(path.join('pkg', 'a', 'b', 'c', 'file3.ts'), '')

    await expect(
      validateCodeOwners(path.join(tmpDir, 'CODEOWNERS'), ['pkg'])
    ).resolves.toBeUndefined()
  })

  it('credits multiple matching rules', async () => {
    await fsAsync.writeFile(
      'CODEOWNERS',
      '/pkg @team\n/pkg/lib @team\n/pkg/lib/index.ts @team\n'
    )
    await fsAsync.mkdir(path.join('pkg', 'lib'), {recursive: true})
    await fsAsync.writeFile(path.join('pkg', 'lib', 'index.ts'), '')

    await expect(
      validateCodeOwners(path.join(tmpDir, 'CODEOWNERS'), ['pkg'])
    ).resolves.toBeUndefined()
  })

  it('handles multiple folders to validate', async () => {
    await fsAsync.writeFile('CODEOWNERS', '/src @owner\n/pkg @owner\n')
    await fsAsync.mkdir(path.join('src', 'lib'), {recursive: true})
    await fsAsync.mkdir(path.join('pkg', 'utils'), {recursive: true})
    await fsAsync.writeFile(path.join('src', 'lib', 'index.ts'), '')
    await fsAsync.writeFile(path.join('pkg', 'utils', 'helper.ts'), '')

    await expect(
      validateCodeOwners(path.join(tmpDir, 'CODEOWNERS'), ['src', 'pkg'])
    ).resolves.toBeUndefined()
  })

  it('reports unused rules when folder has no files', async () => {
    await fsAsync.writeFile('CODEOWNERS', '/pkg @owner\n')
    await fsAsync.mkdir(path.join('pkg', 'empty'), {recursive: true})

    // Rule should be reported as unused since there are no files to match
    await expect(
      validateCodeOwners(path.join(tmpDir, 'CODEOWNERS'), ['pkg'])
    ).rejects.toThrow(/do not match any files/)
  })
})
