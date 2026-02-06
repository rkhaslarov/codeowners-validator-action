# Code Owners Validator

A GitHub Action that validates your `CODEOWNERS` file against specified source folders. It ensures every file in those folders has an owner and that every relevant rule in `CODEOWNERS` matches at least one file.

## What it validates

- **Coverage**: Every file under the specified folders is matched by at least one rule in `CODEOWNERS`. Files without owners cause the action to fail.
- **No orphan rules**: Every rule in `CODEOWNERS` that is relevant to the specified folders matches at least one file. Rules that don't match any file cause the action to fail (so you can clean up obsolete entries).

## Inputs

| Input    | Required | Default                 | Description                                      |
| -------- | -------- | ----------------------- | ------------------------------------------------ |
| `path`   | Yes      | `./.github/CODEOWNERS`   | Path to the CODEOWNERS file.                     |
| `folders`| Yes      | `src`                   | Newline-separated list of folders to validate.   |

Folder entries are trimmed; empty lines are ignored. Leading `!` is preserved (e.g. `! vendor`).

## Usage

### Basic

```yaml
- uses: your-org/codeowners-validator-action@v1
  with:
    path: ./.github/CODEOWNERS
    folders: |
      src
```

### Custom path and multiple folders

```yaml
- uses: your-org/codeowners-validator-action@v1
  with:
    path: ./CODEOWNERS
    folders: |
      src
      lib
      packages
```

### Example workflow

```yaml
name: Validate CODEOWNERS
on: [pull_request, push]
jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: your-org/codeowners-validator-action@v1
        with:
          path: ./.github/CODEOWNERS
          folders: |
            src
            lib
```

## Development

### Setup

```bash
npm install
```

### Build and package

```bash
npm run build && npm run package
```

### Test

```bash
npm test
```

### Local validation

You can run the action from the repo root (see [.github/workflows/test.yml](.github/workflows/test.yml)):

```yaml
uses: ./
with:
  path: ./CODEOWNERS
  folders: |
    ./src
```

## Publishing

1. Build and package: `npm run package`
2. Commit and push the `dist/` folder to your distribution branch (e.g. `releases/v1`).

See [GitHub Actions versioning](https://github.com/actions/toolkit/blob/master/docs/action-versioning.md) for tagging and versioning.

## License

See [LICENSE](LICENSE).
