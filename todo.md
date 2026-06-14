# JobETL - TODOs

## High Priority
- [ ] **Fix `JustJoinIt` Scraper Adapter:** The `justjoinit` source currently returns 0 results due to recent site architecture changes (React SPA / Next.js). The HTML parser is broken. We must reverse-engineer their hidden backend API or intercept the Next.js hydration state to extract the raw job JSON.

## DevOps / Infrastructure
- [ ] **Automated ETL Pipeline:** Replace the manual `npm run discover` and `npm run score` executions with an automated background process (e.g., Node cron job, PM2, or GitHub Actions). The system should scrape and score jobs overnight to provide a fresh batch of matches automatically every morning.
