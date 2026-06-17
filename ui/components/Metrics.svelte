<script lang="ts">
  let { totalEvaluated, totalMatched, avgScore, rejectRate } = $props<{
    totalEvaluated: number;
    totalMatched: number;
    avgScore: string;
    rejectRate: string;
  }>();
</script>

<section aria-label="Key Metrics" class="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 w-full">
  <article
    class="bg-[var(--bg-surface)] p-5 md:p-6 rounded-2xl md:rounded-xl border border-[var(--border-subtle)] flex flex-col gap-1 md:gap-2 shadow-sm md:shadow-none transition-theme"
  >
    <div
      class="text-[0.75rem] text-[var(--text-tertiary)] uppercase tracking-[0.05em] font-semibold"
    >
      Total Evaluated
    </div>
    <div class="text-2xl md:text-3xl font-serif text-[var(--text-primary)]">{totalEvaluated}</div>
  </article>

  <article
    class="bg-[var(--bg-surface)] p-5 md:p-6 rounded-2xl md:rounded-xl border border-[var(--border-subtle)] flex flex-col gap-1 md:gap-2 shadow-sm md:shadow-none transition-theme"
  >
    <div
      class="text-[0.75rem] text-[var(--text-tertiary)] uppercase tracking-[0.05em] font-semibold flex items-center gap-2"
    >
      <span class="w-2 h-2 rounded-full bg-[var(--accent)]"></span>
      Matched
    </div>
    <div class="text-2xl md:text-3xl font-serif text-[var(--accent)]">{totalMatched}</div>
  </article>

  <article
    class="bg-[var(--bg-surface)] p-5 md:p-6 rounded-2xl md:rounded-xl border border-[var(--border-subtle)] flex flex-col gap-1 md:gap-2 shadow-sm md:shadow-none transition-theme"
  >
    <div
      class="text-[0.75rem] text-[var(--text-tertiary)] uppercase tracking-[0.05em] font-semibold"
    >
      Avg Match Score
    </div>
    <div class="text-2xl md:text-3xl font-serif text-[var(--success)]">
      {avgScore}{avgScore !== "-" ? "%" : ""}
    </div>
  </article>

  <article
    class="bg-[var(--bg-surface)] p-5 md:p-6 rounded-2xl md:rounded-xl border border-[var(--border-subtle)] flex flex-col gap-1 md:gap-2 shadow-sm md:shadow-none transition-theme"
  >
    <div
      class="text-[0.75rem] text-[var(--text-tertiary)] uppercase tracking-[0.05em] font-semibold"
    >
      Reject Rate
    </div>
    <div class="text-2xl md:text-3xl font-serif text-[var(--text-primary)]">
      {rejectRate}{rejectRate !== "-" ? "%" : ""}
    </div>
  </article>
</section>
