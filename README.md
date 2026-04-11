# JobETL

`jobetl` is a scheduled job-hunting pipeline.

The first version is built around this flow:

1. Search `justjoin.it` with source-side filters.
2. Collect offer links and basic listing metadata.
3. Fetch each offer page through Jina Reader as markdown.
4. Compare the offer markdown against your CV markdown with DeepSeek via AI SDK.
5. Save only strong matches into a Notion database.

## MVP scope

- Runtime: Node.js + TypeScript
- Source: `justjoin.it`
- Offer extraction: Jina Reader
- Matching: AI SDK + DeepSeek
- Storage: Notion database
- Execution: local CLI, cron, or GitHub Actions

## Project layout

```text
src/
  cli.ts
  config.ts
  env.ts
  jina/
  matching/
  notion/
  pipeline/
  sources/
tests/
docs/
```

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure secrets

Copy `.env.example` values into your own environment source.

Required variables:

- `JINA_API_KEY`
- `NOTION_API_KEY`
- `DEEPSEEK_API_KEY`

For local runs you can export them in your shell:

```bash
export JINA_API_KEY=...
export NOTION_API_KEY=...
export DEEPSEEK_API_KEY=...
```

For GitHub Actions, store them as repository secrets.

### 3. Add your CV markdown

Create `cv.md` based on [`cv.example.md`](/home/dandrok/git/jobetl/cv.example.md) and point `resumeMarkdownPath` at it in [`src/config.ts`](/home/dandrok/git/jobetl/src/config.ts).

### 4. Set your preferences

Edit [`src/config.ts`](/home/dandrok/git/jobetl/src/config.ts):

- `keyword`
- `categorySlug`
- `location`
- `workingMode`
- `minSalary`
- `withSalaryOnly`
- `matchThreshold`
- `maxListings`
- `dryRun`
- `notionDatabaseId`

## Notion database schema

Create a database or data source with these properties:

- `Job Title` as `Title`
- `Company` as `Rich text`
- `Salary` as `Rich text`
- `Summary` as `Rich text`
- `Offer URL` as `URL`
- `Source` as `Select`
- `Match Score` as `Number`
- `Match Reason` as `Rich text`
- `Saved At` as `Date`
- `External ID` as `Rich text`

The dedupe check uses `External ID`.

## Running locally

Dry-run is controlled in config.

```bash
npm run dev
```

Expected result:

- the pipeline scans listing pages,
- scores matching offers,
- skips duplicates already present in Notion,
- prints a JSON summary with `scanned`, `matched`, and `saved`.

## Verification

```bash
npm test
npm run build
```

## GitHub Actions example

```yaml
name: jobetl

on:
  schedule:
    - cron: "0 */6 * * *"
  workflow_dispatch:

jobs:
  run:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run dev
        env:
          JINA_API_KEY: ${{ secrets.JINA_API_KEY }}
          NOTION_API_KEY: ${{ secrets.NOTION_API_KEY }}
          DEEPSEEK_API_KEY: ${{ secrets.DEEPSEEK_API_KEY }}
```

## Current limitations

- The `justjoin.it` adapter is intentionally narrow and should be hardened against future markup changes.
- The current dedupe path assumes the configured Notion id works with both page creation and data source querying.
- The pipeline does not yet implement retries, backoff, or result caching.
- Offer detail fetching and scoring are sequential in v1.

## Next extensions

- Add more source adapters behind the same interface
- Expand source-side filter coverage
- Add retry/backoff for Jina, DeepSeek, and Notion
- Add dry-run reports for manual review
