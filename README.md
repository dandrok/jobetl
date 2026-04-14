# JobETL

`jobetl` is a AI-powered job scraping and matching tool.

It collects job offers from selected websites, turns full offers into markdown, uses LLM-based matching to compare them against your CV, and stores the results in a local SQLite database so you can review matched jobs in one place.

The current flow is:

1. Search `justjoin.it` with source-side filters.
2. Discover offer links and basic listing metadata first.
3. Save discovered listings into a local SQLite database.
4. Skip jobs already finalized as `matched` or `rejected` on later runs.
5. Fetch offer pages through Jina Reader with bounded concurrency.
6. Score fetched offers against your CV with bounded concurrency while fetching continues.
7. Update the same SQLite rows as `matched`, `rejected`, or `error`.

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

Required pipeline variables:

- `JINA_API_KEY`
- `DEEPSEEK_API_KEY`

Required Notion sync variables:

- `NOTION_TOKEN`
- `NOTION_DATABASE_ID`

For local runs you can export them in your shell:

```bash
export JINA_API_KEY=...
export DEEPSEEK_API_KEY=...
export NOTION_TOKEN=...
export NOTION_DATABASE_ID=...
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
- `fetchConcurrency`
- `scoreConcurrency`

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
- `fetching`
- `fetched`
- `scoring`
- `matched`
- `rejected`
- `error`

## Running locally

```bash
npm run dev
```

Expected result:

- the pipeline discovers listing pages first,
- stores listings in SQLite,
- skips jobs already finalized as `matched` or `rejected`,
- fetches and scores offers concurrently with bounded worker counts,
- updates rows as `matched`, `rejected`, or `error`,
- prints a JSON summary with run counters `scanned`, `skipped`, `fetched`, `matched`, `rejected`, `failed`, plus `stored` as the cumulative total currently present in the local database after the run.

## Reviewing local matches

```bash
npm run report
```

This prints the best locally stored matches from SQLite.

## Syncing to Notion

```bash
npm run sync:notion
```

This command:

- reads all jobs from the local SQLite database
- validates the target Notion database schema
- creates new Notion pages for unseen `External ID` values
- updates existing Notion pages when the local `Updated At` value changed
- leaves already up-to-date pages unchanged

Recommended Notion properties:

- `Name` as title
- `External ID` as rich text
- `URL` as url
- `Status` as status or select
- `Source` as select or rich text
- `Company` as rich text
- `Salary` as rich text
- `Location` as rich text
- `Match Score` as number
- `Match Reason` as rich text
- `Summary` as rich text
- `Created At` as date or rich text
- `Updated At` as date or rich text

## Verification

```bash
npm test
npm run build
```

## Current limitations

- The `justjoin.it` adapter is intentionally narrow and should be hardened against future markup changes.
- The current pipeline is bounded-concurrency only; it does not auto-scale or prioritize sources.
- The pipeline does not yet implement retries, backoff, or result caching.
- GitHub Actions automation is still deferred until the local Notion workflow is stable.

## Next extensions

- Add more source adapters behind the same interface
- Expand source-side filter coverage
- Add retry/backoff for Jina and DeepSeek
- Add GitHub Actions once the local workflow is stable
