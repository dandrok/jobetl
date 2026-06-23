<script lang="ts">
  let {
    totalEvaluated,
    totalMatched,
    totalApplied,
    totalNotInterested,
    avgScore,
    rejectRate,
    currentFilter,
    appliedFilter,
    notInterestedFilter,
    onMetricClick
  } = $props<{
    totalEvaluated: number;
    totalMatched: number;
    totalApplied: number;
    totalNotInterested: number;
    avgScore: string;
    rejectRate: string;
    currentFilter: "matched" | "all" | "rejected" | "applied" | "not-interested";
    appliedFilter: "all" | "only" | "hide";
    notInterestedFilter: "all" | "only" | "hide";
    onMetricClick: (type: "all" | "matched" | "applied" | "not-interested" | "rejected") => void;
  }>();

  const isTotalActive = $derived(
    currentFilter === "all" && appliedFilter === "all" && notInterestedFilter === "hide"
  );
  const isMatchedActive = $derived(
    currentFilter === "matched" && appliedFilter === "all" && notInterestedFilter === "hide"
  );
  const isAppliedActive = $derived(appliedFilter === "only");
  const isNotInterestedActive = $derived(notInterestedFilter === "only");
  const isRejectedActive = $derived(
    currentFilter === "rejected" && appliedFilter === "all" && notInterestedFilter === "hide"
  );

  const cardBaseClass =
    "p-5 md:p-6 rounded-2xl md:rounded-xl border flex flex-col gap-1 md:gap-2 transition-theme text-left w-full shadow-sm md:shadow-none";
</script>

<section
  aria-label="Key Metrics"
  class="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-4 md:gap-6 w-full"
>
  <!-- Total Evaluated -->
  <button
    onclick={() => onMetricClick("all")}
    class="{cardBaseClass} cursor-pointer {isTotalActive
      ? 'border-(--accent) bg-(--accent-light)'
      : 'bg-(--bg-surface) border-(--border-subtle) hover:border-(--border-hover) hover:bg-(--bg-hover)'}"
  >
    <div class="text-[0.75rem] text-(--text-tertiary) uppercase tracking-[0.05em] font-semibold">
      Total Evaluated
    </div>
    <div class="text-2xl md:text-3xl font-serif text-(--text-primary)">{totalEvaluated}</div>
  </button>

  <!-- Matched -->
  <button
    onclick={() => onMetricClick("matched")}
    class="{cardBaseClass} cursor-pointer {isMatchedActive
      ? 'border-(--accent) bg-(--accent-light)'
      : 'bg-(--bg-surface) border-(--border-subtle) hover:border-(--border-hover) hover:bg-(--bg-hover)'}"
  >
    <div
      class="text-[0.75rem] text-(--text-tertiary) uppercase tracking-[0.05em] font-semibold flex items-center gap-2"
    >
      <span class="w-2 h-2 rounded-full bg-(--accent)"></span>
      Matched
    </div>
    <div class="text-2xl md:text-3xl font-serif text-(--accent)">{totalMatched}</div>
  </button>

  <!-- Applied -->
  <button
    onclick={() => onMetricClick("applied")}
    class="{cardBaseClass} cursor-pointer {isAppliedActive
      ? 'border-(--accent) bg-(--accent-light)'
      : 'bg-(--bg-surface) border-(--border-subtle) hover:border-(--border-hover) hover:bg-(--bg-hover)'}"
  >
    <div
      class="text-[0.75rem] text-(--text-tertiary) uppercase tracking-[0.05em] font-semibold flex items-center gap-2"
    >
      <span class="w-2 h-2 rounded-full bg-(--success)"></span>
      Applied
    </div>
    <div class="text-2xl md:text-3xl font-serif text-(--success)">{totalApplied}</div>
  </button>

  <!-- Not Interested -->
  <button
    onclick={() => onMetricClick("not-interested")}
    class="{cardBaseClass} cursor-pointer {isNotInterestedActive
      ? 'border-(--accent) bg-(--accent-light)'
      : 'bg-(--bg-surface) border-(--border-subtle) hover:border-(--border-hover) hover:bg-(--bg-hover)'}"
  >
    <div
      class="text-[0.75rem] text-(--text-tertiary) uppercase tracking-[0.05em] font-semibold flex items-center gap-2"
    >
      <span class="w-2 h-2 rounded-full bg-(--text-tertiary)"></span>
      Not Interested
    </div>
    <div class="text-2xl md:text-3xl font-serif text-(--text-secondary)">{totalNotInterested}</div>
  </button>

  <!-- Avg Match Score -->
  <article class="{cardBaseClass} bg-(--bg-surface) border-(--border-subtle)">
    <div class="text-[0.75rem] text-(--text-tertiary) uppercase tracking-[0.05em] font-semibold">
      Avg Match Score
    </div>
    <div class="text-2xl md:text-3xl font-serif text-(--success)">
      {avgScore}{avgScore !== "-" ? "%" : ""}
    </div>
  </article>

  <!-- Reject Rate / Rejected -->
  <button
    onclick={() => onMetricClick("rejected")}
    class="{cardBaseClass} cursor-pointer {isRejectedActive
      ? 'border-(--accent) bg-(--accent-light)'
      : 'bg-(--bg-surface) border-(--border-subtle) hover:border-(--border-hover) hover:bg-(--bg-hover)'}"
  >
    <div
      class="text-[0.75rem] text-(--text-tertiary) uppercase tracking-[0.05em] font-semibold flex items-center gap-2"
    >
      <span class="w-2 h-2 rounded-full bg-(--danger)"></span>
      Reject Rate
    </div>
    <div class="text-2xl md:text-3xl font-serif text-(--danger)">
      {rejectRate}{rejectRate !== "-" ? "%" : ""}
    </div>
  </button>
</section>
