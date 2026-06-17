<script lang="ts">
  import type { StoredJob } from "../types";
  import { fly, fade } from "svelte/transition";
  import { cubicOut } from "svelte/easing";
  import { focusTrap } from "../actions/focusTrap";

  let { job, isOpen, onClose, onToggleApply } = $props<{
    job: StoredJob | null;
    isOpen: boolean;
    onClose: () => void;
    onToggleApply: (id: string, isApplied: boolean) => void;
  }>();

  let displayJob = $state<StoredJob | null>(null);

  $effect(() => {
    if (job) displayJob = job;
  });
</script>

{#if isOpen}
  <!-- Backdrop -->
  <div
    class="fixed inset-0 bg-black/50 backdrop-blur-sm z-[999]"
    onclick={onClose}
    aria-hidden="true"
    transition:fade={{ duration: 300 }}
  ></div>

  <!-- Drawer -->
  <div
    use:focusTrap
    tabindex="-1"
    class="fixed top-0 right-0 w-[650px] max-w-[100vw] h-screen bg-[var(--bg-base)] shadow-[-20px_0_50px_rgba(0,0,0,0.3)] z-[1000] flex flex-col border-l border-[var(--border-subtle)] transform-gpu outline-none"
    role="dialog"
    aria-modal="true"
    aria-labelledby="drawTitle"
    transition:fly={{ x: "100%", duration: 400, easing: cubicOut }}
  >
    <div class="p-8 lg:p-10 border-b border-[var(--border-subtle)] relative bg-[var(--bg-surface)]">
      <button
        class="absolute top-6 right-6 bg-[var(--bg-base)] border border-[var(--border-subtle)] text-[var(--text-secondary)] p-2.5 rounded-lg hover:text-[var(--text-primary)] hover:border-[var(--text-primary)] transition-colors duration-200 flex items-center justify-center cursor-pointer"
        onclick={onClose}
        aria-label="Close details panel"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
      <div
        class="text-[0.95rem] font-medium uppercase tracking-wider text-[var(--text-tertiary)] mb-3"
      >
        {displayJob?.company}
      </div>
      <h2
        class="font-serif text-3xl lg:text-4xl text-[var(--text-primary)] mb-6 pr-12 leading-tight tracking-tight"
        id="drawTitle"
      >
        {displayJob?.title}
      </h2>

      <div class="flex flex-wrap gap-2">
        {#if displayJob?.matchScore}
          <div
            class="bg-[var(--bg-base)] border border-[var(--border-subtle)] px-3 py-1.5 rounded-md text-xs font-medium text-[var(--success)]"
          >
            {Math.round(displayJob.matchScore * 100)}%
          </div>
        {/if}
        <div
          class="bg-[var(--bg-base)] border border-[var(--border-subtle)] px-3 py-1.5 rounded-md text-xs font-medium text-[var(--text-secondary)]"
        >
          {displayJob?.source}
        </div>
        {#if displayJob?.location}
          <div
            class="bg-[var(--bg-base)] border border-[var(--border-subtle)] px-3 py-1.5 rounded-md text-xs font-medium text-[var(--text-secondary)]"
          >
            {displayJob.location}
          </div>
        {/if}
        {#if displayJob?.salary}
          <div
            class="bg-[var(--bg-base)] border border-[var(--border-subtle)] px-3 py-1.5 rounded-md text-xs font-medium text-[var(--text-secondary)]"
          >
            {displayJob.salary}
          </div>
        {/if}
      </div>
    </div>

    <div class="p-8 lg:p-10 overflow-y-auto flex-1">
      <div class="flex items-center gap-2 mb-8">
        <input
          type="checkbox"
          id="drawApplied"
          checked={displayJob?.isApplied}
          onchange={(e) => {
            if (displayJob) onToggleApply(displayJob.externalId, e.currentTarget.checked);
          }}
          class="w-5 h-5 accent-[var(--accent)] cursor-pointer rounded"
        />
        <label
          for="drawApplied"
          class="font-medium text-base cursor-pointer text-[var(--text-primary)]"
        >
          CV Sent / Applied
        </label>
      </div>

      <div
        class="text-xs uppercase tracking-wider text-[var(--text-tertiary)] mb-5 font-semibold flex items-center gap-2"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <circle cx="12" cy="12" r="10"></circle><path d="M12 16v-4"></path><path d="M12 8h.01"
          ></path>
        </svg>
        DeepSeek Analysis
      </div>

      <div
        class="font-serif text-lg leading-relaxed text-[var(--text-primary)] mb-12 whitespace-pre-wrap"
      >
        {#if displayJob?.matchReason}
          {displayJob.matchReason}
        {:else}
          No analysis available.
        {/if}
      </div>

      {#if displayJob?.url}
        <a
          href={displayJob.url}
          target="_blank"
          rel="noopener noreferrer"
          class="inline-flex items-center gap-2 bg-[var(--text-primary)] text-[var(--bg-base)] px-6 py-3.5 rounded-lg text-[0.95rem] font-medium hover:opacity-90 transition-opacity duration-200"
        >
          View Original Posting
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
            <polyline points="15 3 21 3 21 9"></polyline>
            <line x1="10" y1="14" x2="21" y2="3"></line>
          </svg>
        </a>
      {/if}
    </div>
  </div>
{/if}
