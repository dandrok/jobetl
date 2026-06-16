# JobETL

JobETL helps you turn job boards into a short list of jobs that actually fit your CV.

It discovers listings from supported sources, fetches each full offer as markdown, scores it against your resume with AI, and stores the result in a local SQLite database. Optional Notion sync lets the same data flow through GitHub Actions.

## The Idea In 30 Seconds

Simple use case: you want a daily list of jobs worth reviewing instead of opening every offer by hand.

- choose sources and filters
- point the app at your CV in markdown
- run the pipeline
- review only the jobs that passed the match threshold

## Stack

- Runtime: Node.js + TypeScript
- Sources: `justjoin.it`, `nofluffjobs`, `bulldogjob`, `pracuj.pl`
- Full-offer extraction: Jina Reader
- AI matching: DeepSeek `deepseek-v4-flash` via the AI SDK
- Storage: local SQLite (`./data/jobetl.db`)
- Optional sync: Notion
- Automation: GitHub Actions

Current code uses DeepSeek for scoring. No OpenAI key is required.

## Flow

```mermaid
flowchart TD
    subgraph Discovery [1. Discovery Phase]
        A[Job Boards] -->|Scrape HTML| B[Source Adapters]
        B -->|Extract Job Links| C[(Local SQLite)]
    end

    subgraph Extraction [2. Content Extraction]
        C --> D{Already Processed?}
        D -->|No| F[Jina Reader API]
        F -->|Clean Markdown| G[Raw Job Content]
    end

    subgraph Intelligence [3. AI Evaluation]
        G --> H[Deepseek V4 Flash]
        H -->|Compare against CV| I{Score >= Threshold?}
        I -->|Yes| J[Mark as Matched]
        I -->|No| K[Mark as Rejected]
    end

    subgraph Integration [4. Sync & Dashboard]
        J --> L[(Notion Database)]
        K --> L
        J --> M[Web Dashboard UI]
        K --> M
    end
```

## How Jina Reader Works In This Project

Jina Reader is used only for the full job page, not for listing discovery.

1. Each source adapter fetches listing/search pages directly from the job board.
2. The adapter extracts lightweight metadata such as title, company, salary, location, and the job URL.
3. For every job that still needs processing, the app calls `https://r.jina.ai/http://<job-url>` with `JINA_API_KEY`.
4. Jina Reader visits the original job page and returns a cleaned markdown version of the offer.
5. That markdown is sent to DeepSeek together with your CV markdown for scoring.

This means the project does not need a custom detail-page scraper for every source. It only needs source-specific listing discovery plus one shared Jina fetch step for full offers.

## API Keys

Required for the core pipeline:

- `JINA_API_KEY`
- `DEEPSEEK_API_KEY`

Required only if you use Notion sync or the bundled GitHub Actions workflow:

- `NOTION_TOKEN`
- `NOTION_DATABASE_ID`

The same names are used for local env vars and GitHub Actions secrets.

## Quick Setup

Install dependencies:

```bash
npm install
```

Create your local env file and CV file:

```bash
cp .env.example .env
cp cv.example.md cv.md
```

Then:

1. Fill `.env` with your keys.
2. Update `resumeMarkdownPath` in [`src/config.ts`](/home/dandrok/git/jobetl/src/config.ts) to `./cv.md`.
3. Adjust source filters, `matchThreshold`, and concurrency in [`src/config.ts`](/home/dandrok/git/jobetl/src/config.ts).

## Run

Run all enabled sources:

```bash
npm run dev
```

Run a single source:

```bash
npm run dev -- --source justjoinit
npm run dev -- --source nofluffjobs
npm run dev -- --source bulldogjob
npm run dev -- --source pracujpl
```

Review the best saved matches in the terminal:

```bash
npm run report
```

Launch the interactive local Web Dashboard (includes filtering, sorting, and CV sent tracking):

```bash
npm run dashboard
```

Optional Notion sync commands:

```bash
npm run import:notion
npm run sync:notion
```

## GitHub Actions

The repo includes two core workflows:

1. [`daily-crawl.yml`](/home/dandrok/git/jobetl/.github/workflows/daily-crawl.yml): Production ETL cron job.
   - Trigger: daily schedule plus manual `workflow_dispatch`
   - Secrets: `JINA_API_KEY`, `DEEPSEEK_API_KEY`, `NOTION_TOKEN`, `NOTION_DATABASE_ID`
   - Expectations: Expects Notion to be configured since it rebuilds local SQLite state from Notion before crawling.
2. [`ci.yml`](/home/dandrok/git/jobetl/.github/workflows/ci.yml): Continuous Integration.
   - Trigger: `push` and `pull_request` to `master`.
   - Pipeline: Enforces Prettier formatting, ESLint rules, TypeScript compilation, and Vitest suite execution.

## Verify & Format

Before pushing changes, ensure your code passes the CI checks locally:

```bash
npm run format
npm run lint
npm test
npm run build
```
