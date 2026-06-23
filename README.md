# JobETL

JobETL helps you turn job boards into a short list of jobs that actually fit your CV.

It discovers listings from supported sources, fetches each full offer description (using Jina Reader with a local Cheerio HTML-to-text fallback), scores it against your resume with AI, and stores the result in a local SQLite database. Optional Notion sync lets the same data flow through GitHub Actions.

## The Idea In 30 Seconds

Simple use case: you want a daily list of jobs worth reviewing instead of opening every offer by hand.

- choose sources and filters
- point the app at your CV in markdown
- run the pipeline
- review only the jobs that passed the match threshold

## Stack

- Runtime: Node.js + TypeScript
- Sources: `justjoin.it`, `nofluffjobs`, `bulldogjob`, `pracuj.pl`
- Full-offer extraction: Jina Reader (with local Cheerio HTML-to-text fallback)
- AI matching: DeepSeek `deepseek-v4-flash` via the AI SDK
- Storage: local SQLite (`./data/jobetl.db`) managed via **Drizzle ORM**
- UI: Svelte 5 + Vite
- Optional sync: Notion
- Automation: GitHub Actions

Current code uses DeepSeek for scoring. No OpenAI key is required.

## How It Works (The Architecture)

JobETL is designed to be fast, resilient, and cheap to run. Instead of building monolithic, brittle scrapers for every job board, the pipeline is split into four distinct layers:

### 1. Discovery & Validation (Cheerio + Zod)
First, we need to find the job links fast.
- **Cheerio** is used to rapidly download and parse the HTML search result pages. It is extremely fast and lightweight.
- **Zod** acts as our structural firewall. Because job boards frequently change their DOM (HTML structure), scrapers break often. Every extracted job listing is immediately passed through a strict Zod schema (`JobListingSchema`). If a job board changes its layout and our scraper misses a title or company, Zod catches it instantly and logs it via our Telemetry system instead of silently corrupting the database.

### 2. Deep Extraction (Jina Reader & Cheerio Fallback)
Once we have a valid list of job URLs, we need the actual job descriptions.
- **Jina Reader API** (`https://r.jina.ai/`) acts as our universal extractor. 
- **Why Jina?** We wanted to avoid writing and maintaining 4 separate, heavy, Puppeteer/Playwright scripts just to read the details of an offer. Jina visits the URL for us, bypasses anti-bot protections, strips out all the noisy HTML (ads, navbars, popups), and returns pure, clean Markdown. 
- **Cheerio Fallback:** If Jina Reader is rate-limited (HTTP 429), out of credits (HTTP 402), or offline, the pipeline automatically falls back to fetching the page directly and using a local Cheerio parser to strip layouts/scripts and extract clean job description text. This provides a 100% free and infinite backup mechanism.

### 3. Intelligence (DeepSeek V4)
With the clean Markdown in hand, we evaluate the job.
- **DeepSeek V4 (`deepseek-v4-flash`)** is used via the Vercel AI SDK to score the job descriptions against your personal `cv.md`. 
- **Why DeepSeek?** DeepSeek V4 Flash provides high-level reasoning and matching intelligence at an extremely low price point. Its superior cost-to-performance ratio and fast response times make it ideal for bulk-scoring hundreds of job descriptions daily without excessive API costs.

### 4. Storage (SQLite + Drizzle ORM)
Everything is saved locally so we don't re-process or re-score the same jobs tomorrow.
- **SQLite** is the local database (`./data/jobetl.db`).
- **Drizzle ORM** manages the schema and queries. We chose Drizzle because it provides 100% strict TypeScript safety for our SQL queries, eliminating runtime bugs and making the database logic extremely easy to refactor without heavy boilerplate.

---

## The Pipeline Flow

```mermaid
flowchart TD
    subgraph Discovery [1. Discovery Layer]
        A[Job Boards] -->|Cheerio HTML Fetch| B[Source Adapters]
        B -->|Extract DOM Nodes| C{Zod Schema Validation}
        C -->|Valid| D[(SQLite via Drizzle)]
        C -->|Invalid| E[Telemetry Monitor]
    end

    subgraph Extraction [2. Extraction Layer]
        D -->|Fetch Pending| F{Jina Reader API?}
        F -->|Success| G[Markdown Description]
        F -->|Failure / Limit| H[Local HTML Fetch]
        H -->|Cheerio Extract| G
    end

    subgraph Intelligence [3. Evaluation Layer]
        G --> DS[DeepSeek V4 Flash]
        DS -->|Compare against cv.md| I{Score >= Threshold?}
        I -->|Yes| J[Save as 'matched']
        I -->|No| K[Save as 'rejected']
        J -->|Write Status| D
        K -->|Write Status| D
    end

    subgraph Presentation [4. Presentation Layer]
        D -->|Bidirectional Sync| L[(Notion Database)]
        D -->|Local API Queries| M[Vite/Svelte Dashboard]
    end
```

## API Keys

Required for the core pipeline:

- `DEEPSEEK_API_KEY`

Optional:

- `JINA_API_KEY`: If not configured, or if your key is out of credits/rate-limited, the pipeline automatically falls back to Jina's keyless free-tier and then to the built-in local Cheerio text parser.

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

Launch the interactive Svelte Web Dashboard:

```bash
npm run dev:ui
```

### Dashboard Features

The Svelte-based dashboard provides:
* **Interactive Metrics Grid:** Live tracking of *Total Evaluated*, *Matched*, *Applied*, *Not Interested*, *Avg Match Score*, and *Reject Rate*. Click the Total Evaluated, Matched, Applied, Not Interested, or Reject Rate cards to filter listings.
* **Global Filter Synchronization:** Main navigation filters and sidebar status segments (Show, Hide, Only) sync bidirectionally.
* **Drawer view:** Inspect details, toggle applied state (stores `appliedAt` timestamp), or mark as not interested.

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
