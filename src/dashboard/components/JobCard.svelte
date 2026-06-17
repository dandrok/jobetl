<script lang="ts">
  import type { StoredJob } from '../types.js';

  let { job, onToggleApply, onClick } = $props<{
    job: StoredJob;
    onToggleApply: (id: string, isApplied: boolean) => void;
    onClick: (job: StoredJob) => void;
  }>();

  // Helper to determine freshness
  const diffDays = $derived.by(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const createdDate = new Date(job.createdAt);
    createdDate.setHours(0, 0, 0, 0);
    return Math.floor((now.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24));
  });

  const formattedDate = $derived(new Date(job.createdAt).toLocaleDateString());
  const isHot = $derived(diffDays >= 0 && diffDays <= 1);
  const isNew = $derived(diffDays > 1 && diffDays <= 3);
</script>

<div 
  class="flex flex-col gap-3 relative p-5 bg-[var(--bg-surface)] md:bg-transparent rounded-2xl md:rounded-none md:grid md:grid-cols-[80px_3fr_2fr_1fr] md:p-5 md:px-6 border border-[var(--border-subtle)] md:border-0 md:border-b mb-4 md:mb-0 items-start md:items-center cursor-pointer hover:bg-[var(--bg-hover)] transition-colors duration-200 w-full text-left outline-none shadow-sm md:shadow-none {job.isApplied ? 'bg-[var(--accent-light)] opacity-85' : ''}" 
  role="button"
  tabindex="0"
  aria-label="View details for {job.title} at {job.company}"
  onclick={() => onClick(job)}
  onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(job); } }}
>
  <!-- Score -->
  <div class="absolute top-5 right-5 bg-[var(--bg-base)] px-2.5 py-1 rounded-md border border-[var(--border-subtle)] md:static md:bg-transparent md:px-0 md:py-0 md:border-none font-mono text-[0.95rem] text-[var(--text-secondary)] {job.matchScore && job.matchScore >= 0.78 ? 'text-[var(--success)] font-semibold' : ''} min-w-0">
    {job.matchScore ? `${Math.round(job.matchScore * 100)}%` : 'N/A'}
  </div>

  <!-- Main Info -->
  <div class="flex flex-col min-w-0 pr-2 w-full">
    <div class="flex items-center gap-2 mb-1.5 md:mb-1 min-w-0 w-full">
      <span class="text-xs font-semibold px-2 py-0.5 rounded bg-black/5 dark:bg-white/10 text-[var(--text-secondary)] tracking-wide border border-[var(--border-subtle)] truncate">{job.source}</span>
      {#if isNew}
        <span class="text-[0.65rem] font-bold px-1.5 py-0.5 rounded bg-[var(--accent-light)] text-[var(--accent)] tracking-wider uppercase shrink-0">New</span>
      {/if}
    </div>
    <h3 class="text-lg font-semibold text-[var(--text-primary)] leading-snug pr-12 md:pr-0 line-clamp-2 md:line-clamp-1 w-full">{job.title}</h3>
    <div class="text-[0.9rem] text-[var(--text-secondary)] font-medium mt-1 md:mt-0.5 truncate w-full">{job.company}</div>
  </div>

  <!-- Details -->
  <div class="flex flex-col gap-1.5 text-[0.85rem] text-[var(--text-secondary)] mt-2 md:mt-0 min-w-0 w-full">
    {#if job.location}
      <div class="flex items-center gap-2 min-w-0 w-full">
        <svg class="shrink-0" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
        <span class="truncate">{job.location}</span>
      </div>
    {/if}
    <div class="flex items-center gap-2 min-w-0 w-full">
      <svg class="shrink-0" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
      <span class="truncate">{formattedDate}</span>
    </div>
  </div>

  <!-- Action -->
  <div class="mt-4 md:mt-0 flex justify-start md:justify-end w-full min-w-0">
    <button class="px-5 py-2 bg-[var(--bg-surface)] md:bg-transparent rounded-lg text-[0.85rem] text-[var(--text-secondary)] border border-[var(--border-subtle)] md:border-transparent font-medium hover:text-[var(--text-primary)] hover:border-[var(--border-subtle)] transition-colors duration-200 cursor-pointer pointer-events-auto" onclick={(e) => { e.stopPropagation(); onClick(job); }}>
      View Details
    </button>
  </div>
</div>
