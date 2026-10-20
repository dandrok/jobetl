# JobETL

JobETL helps you turn job boards into a short list of jobs that actually fit your CV.

It discovers listings from supported sources, fetches each full offer description (using Jina Reader with a local Cheerio HTML-to-text fallback), scores it against your resume with AI, and stores the result in a local PostgreSQL database. Optional Notion sync lets the same data flow through GitHub Actions.

## The Idea In 30 Seconds

Simple use case: you want a daily list of jobs worth reviewing instead of opening every offer by hand.

- choose sources and filters
- point the app at one or more profile match briefs (`cv.md`, `cv-ai.md`, …)
- run the pipeline (all enabled profiles, or one with `--profile`)
- review only the jobs that passed each profile’s match threshold

## Stack

- Runtime: Node.js + TypeScript
- Sources: `justjoin.it`, `nofluffjobs`, `bulldogjob`, `pracuj.pl`, `thesmartjobs.com`
- Full-offer extraction: Jina Reader (with local Cheerio HTML-to-text fallback)
- AI matching: DeepSeek `deepseek-v4-flash` via the AI SDK
- Storage: local PostgreSQL database managed via **Drizzle ORM**
- UI: Svelte 5 + Vite
- Optional sync: Notion
- Automation: GitHub Actions

Current code uses DeepSeek for scoring. No OpenAI key is required.

## How It Works (The Architecture)

JobETL is designed to be fast, resilient, and cheap to run. Instead of building monolithic, brittle scrapers for every job board, the pipeline is split into four distinct layers:

### 1. Discovery & Validation (Cheerio + Zod)
First, the pipeline discovers job links fast.
- **Cheerio** rapidly downloads and parses HTML search result pages. It is extremely fast and lightweight.
- **Zod** acts as a structural firewall. Because job boards frequently change their DOM (HTML structure), scrapers break often. Every extracted job listing is immediately validated against a strict Zod schema (`JobListingSchema`). If a board changes its layout and the scraper misses a title or company, Zod catches it instantly and logs it to the Telemetry system instead of silently corrupting the database.

### 2. Deep Extraction (Jina Reader & Cheerio Fallback)
Once a valid list of job URLs is collected, the pipeline extracts full descriptions.
- **Jina Reader API** (`https://r.jina.ai/`) acts as a universal extractor.
- **Why Jina?** It visits the URL, bypasses anti-bot protections, strips noisy HTML (ads, navbars, modals), and returns pure Markdown. This avoids maintaining separate browser automation scripts for every source.
- **Cheerio Fallback:** If Jina Reader is rate-limited (HTTP 429), out of credits (HTTP 402), or unreachable, the pipeline automatically falls back to fetching the page directly and using a local Cheerio parser to strip layouts/scripts and extract clean text. This provides an automated, free backup mechanism.

### 3. Intelligence (DeepSeek V4)
With clean Markdown extracted, the pipeline evaluates the offer.
- **DeepSeek V4 (`deepseek-v4-flash`)** scores descriptions against each profile’s match brief (`cv.md`, `cv-ai.md`, …) via the Vercel AI SDK.
- **Why DeepSeek?** DeepSeek V4 Flash provides strong reasoning and matching precision at low cost, making it feasible to score hundreds of offers daily.

### 4. Storage (PostgreSQL + Drizzle ORM)
All results are stored in a containerized database to prevent re-processing identical offers in subsequent runs.
- **PostgreSQL** runs inside a local Docker container (configured via Docker Compose with persistent named volumes).
- **Drizzle ORM** manages the schema and queries with strict TypeScript safety, eliminating SQL runtime bugs and keeping queries maintainable.

---

## The Pipeline Flow

```mermaid
flowchart TD
    subgraph Discovery [1. Discovery Layer]
        A[Job Boards] -->|Cheerio HTML Fetch| B[Source Adapters]
        B -->|Extract DOM Nodes| C{Zod Schema Validation}
        C -->|Valid| D[(PostgreSQL via Drizzle)]
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
        DS -->|Compare against profile brief| I{Score >= Threshold?}
        I -->|Yes| J[Save as 'matched']
        I -->|No| K[Save as 'rejected']
        J -->|Write Status| D
        K -->|Write Status| D
    end

    subgraph Presentation [4. Presentation & Alert Layer]
        D -->|Bidirectional Sync| L[(Notion Database)]
        D -->|Local API Queries| M[Vite/Svelte Dashboard]
        CLI[Scrape Runner] -->|Combined Digest & Health Heartbeat| R[Resend Email API]
        R -->|HTML Newsletter| Inbox((Your Inbox))
    end
```

## API Keys

Required for the core pipeline:

- `DEEPSEEK_API_KEY`

Optional:

- `JINA_API_KEY`: If not configured, or if your key is out of credits/rate-limited, the pipeline automatically falls back to Jina's keyless free-tier and then to the built-in local Cheerio text parser.
- `RESEND_API_KEY`, `SENDER_EMAIL`, `RECIPIENT_EMAIL`: If configured, the pipeline compiles a styled HTML digest combining all enabled profiles and dispatches it via Resend. It provides guaranteed daily heartbeat delivery (even on 0 matches) with an embedded Scraper Health Monitor widget displaying adapter status and latency metrics.

Required only if you use Notion sync or the bundled GitHub Actions workflow:

- `NOTION_TOKEN`
- `NOTION_DATABASE_ID`

The same names are used for local env vars and GitHub Actions secrets.

## Quick Setup

Install dependencies:

```bash
npm install
```

Create local environment configuration and CV / match-brief files:

```bash
cp .env.example .env
cp cv.example.md cv.md
cp cv-ai.example.md cv-ai.md
```

> [!IMPORTANT]
> `cv.md` and `cv-ai.md` are ignored by git to protect personal candidate data. When deploying to production (such as AWS EC2), manually provision these files on the server (e.g. via `scp`), or disable unprovisioned profiles in [`src/core/config.ts`](src/core/config.ts) (`enabled: false`) to prevent `ENOENT` pipeline crashes.

Then:

1. Fill `.env` with API keys and set `DATABASE_URL` to point to the PostgreSQL instance:
   ```env
   DATABASE_URL=postgres://jobetl_user:secure_password_here@localhost:5432/jobetl
   ```
2. Edit profiles in [`src/core/config.ts`](src/core/config.ts): each profile defines `enabled`, `resumeMarkdownPath`, `matchThreshold`, `emailSubjectPrefix`, and source filters.
3. Customize `cv.md` (software) and `cv-ai.md` (AI hybrid brief — see `cv-ai.example.md`).
4. Start the local database container and apply migrations:
   ```bash
   npm run db:start
   npm run db:migrate
   ```

## Run

Run smoke tests against scraper health and DOM selectors without LLM scoring or database writes:

```bash
npm run check:sources
```

Run all enabled profiles (`software` then `ai` by default), each with its configured sources:

```bash
npm run dev
```

Run a single profile and/or source:

```bash
npm run dev -- --profile software
npm run dev -- --profile ai
npm run dev -- --profile ai --source justjoinit
npm run dev -- --source justjoinit
npm run dev -- --source nofluffjobs
npm run dev -- --source bulldogjob
npm run dev -- --source pracujpl
npm run dev -- --source thesmartjobs
```

Jobs are tagged with `profile` (`software` | `ai` | `both` | null for legacy). Matching runs across all enabled profiles consolidate into a single daily digest email with profile breakdown sections.

Review the best saved matches in the terminal:

```bash
npm run report
```

Launch the interactive Svelte Web Dashboard:

```bash
npm run dashboard   # API on :3001 + Vite UI on :3000
```

The dashboard is password-protected. Generate the hash before first use:

```bash
npm run hash:password   # prompts without echoing, prints a DASHBOARD_PASSWORD_HASH line for .env
```

The server refuses to start if `DASHBOARD_PASSWORD_HASH` is unset, so a
misconfigured deployment fails loudly instead of serving a login nobody can pass.

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

1. [`ci.yml`](.github/workflows/ci.yml): Continuous Integration.
   - Trigger: `push` and `pull_request` to `master`.
   - Pipeline: Enforces Prettier formatting, ESLint rules, TypeScript compilation, and Vitest suite execution.
2. [`deploy.yml`](.github/workflows/deploy.yml): Continuous Deployment.
   - Trigger: `push` to `master`.
   - Pipeline: Connects to the AWS EC2 instance via SSH, pulls code changes, runs database migrations, compiles the build, and reloads PM2.

## Deployment & Production Setup

In production, the application runs on a cloud instance with automated delivery:

- **Hosting**: AWS EC2 instance running Ubuntu.
- **Process Manager**: PM2 manages background tasks and supervises the API server using `ecosystem.config.cjs`.
- **Database**: PostgreSQL runs in a containerized environment (via `docker-compose.yml`) with Docker persistent volumes preserving job records.
- **Scheduling (Cron)**: Executed twice daily at 11:00 and 19:00 in the host system's local timezone (e.g. `Europe/Warsaw`) via `crontab`. Output logs redirect to `/home/ubuntu/jobetl/logs/crawler.log`:
  ```text
  0 11,19 * * * . $HOME/.bashrc && cd /home/ubuntu/jobetl && npm run dev >> /home/ubuntu/jobetl/logs/crawler.log 2>&1
  ```
  **Log Retention**: To prevent `crawler.log` from growing indefinitely and causing disk exhaustion, configure a `logrotate` entry at `/etc/logrotate.d/jobetl`:
  ```text
  /home/ubuntu/jobetl/logs/crawler.log {
      daily
      rotate 7
      compress
      delaycompress
      missingok
      notifempty
      copytruncate
  }
  ```
- **Continuous Deployment**: Managed by GitHub Actions ([deploy.yml](.github/workflows/deploy.yml)). Pushing to `master` initiates an SSH connection to EC2, resets code, runs migrations, builds both backend and UI bundles, and reloads PM2 processes.
- **Public dashboard**: Served at `https://jobetl.thedotfile.com` with nginx terminating TLS, serving `ui/dist` directly and proxying `/api/*` to the Node process on loopback. Full setup — DNS, certbot, nginx vhost, security headers, and the login throttle — is detailed in [deployment.md](deployment.md).

## Verify & Format

Before pushing changes, run the repository's mandatory pre-flight check:

```bash
npm run check
```

This atomically runs Prettier formatting verification, ESLint static analysis, TypeScript compilation, and the Vitest test suite. Individual task commands:

```bash
npm run format         # Auto-format TypeScript, Svelte, and CSS files
npm run lint           # Run ESLint rules
npm test               # Run Vitest test suite
npm run build          # Compile CLI bundle
```
