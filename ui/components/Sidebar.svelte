<script lang="ts">
  import { fly, fade } from "svelte/transition";
  import { cubicOut } from "svelte/easing";
  import { focusTrap } from "../actions/focusTrap";

  let {
    currentFilter,
    onFilterChange,
    allSources,
    selectedSources,
    onToggleSource,
    onToggleTheme,
    isCollapsed,
    onClose
  } = $props<{
    currentFilter: "matched" | "all" | "rejected";
    onFilterChange: (f: "matched" | "all" | "rejected") => void;
    allSources: string[];
    selectedSources: Set<string>;
    onToggleSource: (s: string) => void;
    onToggleTheme: () => void;
    isCollapsed: boolean;
    onClose: () => void;
  }>();
</script>

{#if !isCollapsed}
  <div
    class="fixed inset-0 bg-black/50 backdrop-blur-sm z-[90]"
    onclick={onClose}
    aria-hidden="true"
    transition:fade={{ duration: 300 }}
  ></div>

  <nav
    use:focusTrap
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

        <button
          class="flex items-center gap-3 px-3 py-2.5 rounded-lg text-[0.95rem] transition-colors duration-200 w-full text-left {currentFilter ===
          'matched'
            ? 'bg-(--accent-light) text-(--accent) font-medium'
            : 'text-(--text-secondary) hover:bg-(--bg-hover) hover:text-(--text-primary)'}"
          onclick={() => onFilterChange("matched")}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg
          >
          Matched
        </button>

        <button
          class="flex items-center gap-3 px-3 py-2.5 rounded-lg text-[0.95rem] transition-colors duration-200 w-full text-left {currentFilter ===
          'all'
            ? 'bg-(--accent-light) text-(--accent) font-medium'
            : 'text-(--text-secondary) hover:bg-(--bg-hover) hover:text-(--text-primary)'}"
          onclick={() => onFilterChange("all")}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            ><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path
              d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"
            ></path></svg
          >
          All Evaluated
        </button>

        <button
          class="flex items-center gap-3 px-3 py-2.5 rounded-lg text-[0.95rem] transition-colors duration-200 w-full text-left {currentFilter ===
          'rejected'
            ? 'bg-(--accent-light) text-(--accent) font-medium'
            : 'text-(--text-secondary) hover:bg-(--bg-hover) hover:text-(--text-primary)'}"
          onclick={() => onFilterChange("rejected")}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            ><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"
            ></line></svg
          >
          Rejected
        </button>
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
              {source}
            </label>
          {/each}
        </div>
      </div>
    </div>
  </nav>
{/if}
