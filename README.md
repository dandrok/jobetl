# JobETL

`jobetl` is a local-first job scraping and matching tool.

It collects job offers from selected websites, turns full offers into markdown, compares them against your CV, and stores the results in a local SQLite database so you can review matched jobs in one place.

The current flow is:

1. Search `justjoin.it` with source-side filters.
2. Collect offer links and basic listing metadata.
3. Save discovered listings into a local SQLite database.
4. Fetch each offer page through Jina Reader as markdown.
5. Compare the offer markdown against your CV markdown with DeepSeek via AI SDK.
6. Update the same SQLite rows as `matched` or `rejected`.

## MVP scope

- Runtime: Node.js + TypeScript
- Source: `justjoin.it`
- Offer extraction: Jina Reader
- Matching: AI SDK + DeepSeek
- Storage: local SQLite database
- Execution: local CLI first

## Project layout

```text
src/
  cli.ts
  config.ts
  env.ts
  jina/
  matching/
  pipeline/
  report.ts
  sources/
  storage/
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
- `DEEPSEEK_API_KEY`

For local runs you can export them in your shell:

```bash
export JINA_API_KEY=...
export DEEPSEEK_API_KEY=...
```

### 3. Add your CV markdown

Create `cv.md` based on [`cv.example.md`](/home/dandrok/git/jobetl/cv.example.md) and keep `resumeMarkdownPath` pointed at it in [`src/config.ts`](/home/dandrok/git/jobetl/src/config.ts).

### 4. Set your preferences

Edit [`src/config.ts`](/home/dandrok/git/jobetl/src/config.ts):

- `databasePath`
- `keyword`
- `categorySlug`
- `location`
- `workingMode`
- `minSalary`
- `withSalaryOnly`
- `matchThreshold`
- `maxListings`

## Local SQLite storage

The active store is a local SQLite file, by default:

```text
./data/jobetl.db
```

The `jobs` table stores:

- external id
- source
- url
- title
- company
- salary text
- location
- offer markdown
- match score
- match reason
- summary
- status
- created / updated timestamps

Status values currently used:

- `discovered`
- `fetched`
- `matched`
- `rejected`

## Running locally

```bash
npm run dev
```

Expected result:

- the pipeline scans listing pages,
- stores listings in SQLite,
- fetches and scores each offer,
- updates rows as `matched` or `rejected`,
- prints a JSON summary with `scanned`, `fetched`, `matched`, and `stored`.

## Reviewing local matches

```bash
npm run report
```

This prints the best locally stored matches from SQLite.

## Verification

```bash
npm test
npm run build
```

## Current limitations

- The `justjoin.it` adapter is intentionally narrow and should be hardened against future markup changes.
- The current pipeline processes offers sequentially.
- The pipeline does not yet implement retries, backoff, or result caching.
- Local SQLite is the active store; Notion export is intentionally deferred.

## Next extensions

- Add a Notion export or sync layer on top of the local database
- Add more source adapters behind the same interface
- Expand source-side filter coverage
- Add retry/backoff for Jina and DeepSeek
- Add GitHub Actions once the local workflow is stable
