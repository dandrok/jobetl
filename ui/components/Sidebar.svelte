<script lang="ts">
  import { fly, fade } from "svelte/transition";
  import { cubicOut } from "svelte/easing";
  import { focusTrap } from "../actions/focusTrap";
  import RangeSlider from "./RangeSlider.svelte";

  let {
    currentFilter,
    onFilterChange,
    allSources,
    selectedSources,
    onToggleSource,
    onToggleTheme,
    isCollapsed,
    onClose,
    appliedFilter,
    onAppliedFilterChange,
    notInterestedFilter,
    onNotInterestedFilterChange,
    minScore = $bindable(0),
    maxScore = $bindable(100),
    sourceCounts = {},
    onLogout
  } = $props<{
    currentFilter: "matched" | "all" | "rejected" | "applied" | "not-interested";
    onFilterChange: (f: "matched" | "all" | "rejected" | "applied" | "not-interested") => void;
    allSources: string[];
    selectedSources: Set<string>;
    onToggleSource: (s: string) => void;
    onToggleTheme: () => void;
    isCollapsed: boolean;
    onClose: () => void;
    appliedFilter: "all" | "only" | "hide";
    onAppliedFilterChange: (f: "all" | "only" | "hide") => void;
    notInterestedFilter: "all" | "only" | "hide";
    onNotInterestedFilterChange: (f: "all" | "only" | "hide") => void;
    minScore?: number;
    maxScore?: number;
    sourceCounts?: Record<string, number>;
    onLogout?: () => void;
  }>();

  let windowWidth = $state(0);
  let isMobile = $derived(windowWidth < 1024);

  function clampMinScore() {
    minScore = Math.max(0, Math.min(minScore ?? 0, (maxScore ?? 100) - 1));
  }

  function clampMaxScore() {
    maxScore = Math.max((minScore ?? 0) + 1, Math.min(maxScore ?? 100, 100));
  }

  const intelligenceFilters = [
    { id: "matched", label: "Matched" },
    { id: "all", label: "All Evaluated" },
    { id: "applied", label: "Applied" },
    { id: "not-interested", label: "Not Interested" },
    { id: "rejected", label: "Rejected" }
  ] as const;
</script>

{#snippet filterIcon(id: "matched" | "all" | "applied" | "not-interested" | "rejected")}
  {#if id === "matched"}
    <polyline points="20 6 9 17 4 12"></polyline>
  {:else if id === "all"}
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
  {:else if id === "applied"}
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
    <polyline points="22 4 12 14.01 9 11.01"></polyline>
  {:else if id === "not-interested"}
    <circle cx="12" cy="12" r="10"></circle>
    <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line>
  {:else if id === "rejected"}
    <line x1="18" y1="6" x2="6" y2="18"></line>
    <line x1="6" y1="6" x2="18" y2="18"></line>
  {/if}
{/snippet}

{#snippet triStateFilter(
  label: string,
  value: "all" | "only" | "hide",
  onchange: (f: "all" | "only" | "hide") => void
)}
  <div class="flex flex-col gap-1">
    <span class="text-xs text-(--text-tertiary) font-semibold">{label}</span>
    <div
      class="grid grid-cols-3 gap-1 bg-(--bg-base) p-1 rounded-lg border border-(--border-subtle)"
    >
      {#each ["all", "only", "hide"] as opt}
        <button
          class="px-2 py-1.5 text-xs rounded font-medium transition-colors cursor-pointer {value ===
          opt
            ? 'bg-(--bg-surface) text-(--text-primary) shadow-sm'
            : 'text-(--text-secondary) hover:text-(--text-primary)'}"
          onclick={() => onchange(opt as "all" | "only" | "hide")}
        >
          {opt.charAt(0).toUpperCase() + opt.slice(1)}
        </button>
      {/each}
    </div>
  </div>
{/snippet}

<svelte:window bind:innerWidth={windowWidth} />

{#if !isCollapsed}
  <div
    class="fixed inset-0 bg-black/50 backdrop-blur-sm z-[90] lg:hidden"
    onclick={onClose}
    aria-hidden="true"
    transition:fade={{ duration: 300 }}
  ></div>

  <nav
    use:focusTrap={isMobile}
    tabindex="-1"
    class="fixed top-0 left-0 w-[280px] bg-(--bg-surface) border-r border-(--border-subtle) flex flex-col shrink-0 z-[100] h-screen transform-gpu outline-none"
    transition:fly={{ x: -280, duration: 400, easing: cubicOut }}
  >
    <div class="p-6 flex justify-between items-center">
      <span class="font-serif text-2xl font-medium text-(--text-primary) tracking-tight"
        >JobETL</span
      >
      <div class="flex gap-1">
        <button
          onclick={onToggleTheme}
          class="w-9 h-9 rounded-lg flex items-center justify-center text-(--text-secondary) hover:text-(--text-primary) hover:bg-(--bg-active) transition-colors duration-200"
          aria-label="Toggle Theme"
        >
          <svg
            id="themeIcon"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line
              x1="12"
              y1="21"
              x2="12"
              y2="23"
            ></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line
              x1="18.36"
              y1="18.36"
              x2="19.78"
              y2="19.78"
            ></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"
            ></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line
              x1="18.36"
              y1="5.64"
              x2="19.78"
              y2="4.22"
            ></line>
          </svg>
        </button>
        <button
          onclick={onClose}
          class="w-9 h-9 rounded-lg flex items-center justify-center text-(--text-secondary) hover:text-(--text-primary) hover:bg-(--bg-active) transition-colors duration-200"
          aria-label="Close Sidebar"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            ><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line
              x1="9"
              y1="3"
              x2="9"
              y2="21"
            ></line></svg
          >
        </button>
      </div>
    </div>

    <div class="p-4 px-6 flex-1 flex flex-col gap-10 overflow-y-auto">
      <div class="flex flex-col gap-1.5">
        <div
          class="text-[0.75rem] text-(--text-tertiary) mb-3 pl-3 uppercase tracking-[0.05em] font-semibold"
        >
          Intelligence
        </div>

        {#each intelligenceFilters as filter}
          <button
            class="flex items-center gap-3 px-3 py-2.5 rounded-lg text-[0.95rem] transition-colors duration-200 w-full text-left {currentFilter ===
            filter.id
              ? 'bg-(--accent-light) text-(--accent) font-medium'
              : 'text-(--text-secondary) hover:bg-(--bg-hover) hover:text-(--text-primary)'}"
            onclick={() => onFilterChange(filter.id)}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              {@render filterIcon(filter.id)}
            </svg>
            {filter.label}
          </button>
        {/each}
      </div>

      <div class="flex flex-col gap-1.5">
        <div
          class="text-[0.75rem] text-(--text-tertiary) mb-3 pl-3 uppercase tracking-[0.05em] font-semibold"
        >
          Status Filters
        </div>

        <div class="flex flex-col gap-4 px-3">
          {@render triStateFilter("Applied", appliedFilter, onAppliedFilterChange)}
          {@render triStateFilter(
            "Not Interested",
            notInterestedFilter,
            onNotInterestedFilterChange
          )}
        </div>
      </div>

      <!-- Match Score Filter -->
      <div class="flex flex-col gap-1.5">
        <div
          class="text-[0.75rem] text-(--text-tertiary) mb-1 pl-3 uppercase tracking-[0.05em] font-semibold"
        >
          Match Score ({minScore}% - {maxScore}%)
        </div>
        <div class="px-3 flex flex-col gap-3">
          <RangeSlider bind:min={minScore} bind:max={maxScore} />

          <div class="flex items-center gap-3">
            <div class="flex-1 flex flex-col gap-1">
              <label
                for="min-score-input"
                class="text-[0.7rem] text-(--text-tertiary) font-semibold">Min %</label
              >
              <input
                id="min-score-input"
                type="number"
                min="0"
                max={maxScore - 1}
                bind:value={minScore}
                onchange={clampMinScore}
                onblur={clampMinScore}
                class="w-full bg-(--bg-base) border border-(--border-subtle) rounded px-2 py-1.5 text-xs text-(--text-primary) font-mono outline-none focus:border-(--accent) transition-colors"
              />
            </div>
            <div class="text-(--text-tertiary) self-end pb-1.5 font-semibold">-</div>
            <div class="flex-1 flex flex-col gap-1">
              <label
                for="max-score-input"
                class="text-[0.7rem] text-(--text-tertiary) font-semibold">Max %</label
              >
              <input
                id="max-score-input"
                type="number"
                min={minScore + 1}
                max="100"
                bind:value={maxScore}
                onchange={clampMaxScore}
                onblur={clampMaxScore}
                class="w-full bg-(--bg-base) border border-(--border-subtle) rounded px-2 py-1.5 text-xs text-(--text-primary) font-mono outline-none focus:border-(--accent) transition-colors"
              />
            </div>
          </div>
        </div>
      </div>

      <div class="flex flex-col gap-1.5">
        <div
          class="text-[0.75rem] text-(--text-tertiary) mb-3 pl-3 uppercase tracking-[0.05em] font-semibold"
        >
          Sources
        </div>
        <div class="flex flex-col gap-1">
          {#each allSources as source}
            <label
              class="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-(--text-secondary) hover:text-(--text-primary) hover:bg-(--bg-hover) cursor-pointer transition-colors duration-200"
            >
              <input
                type="checkbox"
                class="accent-(--accent) w-4 h-4 rounded cursor-pointer"
                checked={selectedSources.has(source)}
                onchange={() => onToggleSource(source)}
              />
              <span class="flex-1 truncate">{source}</span>
              <span
                class="text-[0.7rem] font-mono font-semibold bg-(--bg-hover) px-2 py-0.5 rounded border border-(--border-subtle) text-(--text-tertiary)"
              >
                {sourceCounts[source] || 0}
              </span>
            </label>
          {/each}
        </div>
      </div>
    </div>

    {#if onLogout}
      <div class="p-6 border-t border-(--border-subtle) bg-(--bg-surface) flex items-center">
        <button
          onclick={onLogout}
          class="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-(--text-secondary) hover:text-(--danger) transition-colors cursor-pointer w-full text-left"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
            <polyline points="16 17 21 12 16 7"></polyline>
            <line x1="21" y1="12" x2="9" y2="12"></line>
          </svg>
          Log Out
        </button>
      </div>
    {/if}
  </nav>
{/if}
