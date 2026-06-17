<script lang="ts">
  import { onMount } from 'svelte';
  import { flip } from 'svelte/animate';
  import { fly, fade } from 'svelte/transition';
  import { quintOut } from 'svelte/easing';
  import type { StoredJob } from './types.js';
  import JobCard from './components/JobCard.svelte';
  import Drawer from './components/Drawer.svelte';
  import './app.css';

  let allJobs = $state<StoredJob[]>([]);
  let currentFilter = $state<'matched' | 'all' | 'rejected'>('matched');
  let currentSort = $state<'score' | 'date'>('score');
  let searchQuery = $state('');
  
  let selectedSources = $state<Set<string>>(new Set());
  let allSources = $derived([...new Set(allJobs.map(j => j.source))].filter(Boolean));

  let isLoading = $state(true);
  let error = $state<string | null>(null);
  let selectedJob = $state<StoredJob | null>(null);

  async function toggleApply(id: string, isApplied: boolean) {
    try {
      const res = await fetch(`/api/jobs/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isApplied })
      });
      if (res.ok) {
        // Update local state instantly
        const jobIndex = allJobs.findIndex(j => j.externalId === id);
        if (jobIndex !== -1) {
          allJobs[jobIndex].isApplied = isApplied;
        }
      }
    } catch (err) {
      console.error('Failed to update apply status', err);
    }
  }

  // Derived filtered jobs
  const filteredJobs = $derived.by(() => {
    let result = allJobs.filter(job => {
      // 1. Filter by intelligence status
      if (currentFilter === 'matched' && job.status !== 'matched') return false;
      if (currentFilter === 'rejected' && job.status !== 'rejected') return false;
      
      // 2. Filter by selected sources
      if (!selectedSources.has(job.source)) return false;

      // 3. Search query
      if (searchQuery.trim() !== '') {
        const q = searchQuery.toLowerCase();
        const t = (job.title || '').toLowerCase();
        const c = (job.company || '').toLowerCase();
        if (!t.includes(q) && !c.includes(q)) return false;
      }

      return true;
    });

    // 4. Sort
    result.sort((a, b) => {
      if (currentSort === 'score') {
        const sa = a.matchScore || 0;
        const sb = b.matchScore || 0;
        if (sa !== sb) return sb - sa;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      } else {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
    });

    return result;
  });

  // Derived metrics
  const totalEvaluated = $derived(allJobs.length);
  const totalMatched = $derived(allJobs.filter(j => j.status === 'matched').length);
  const avgScore = $derived.by(() => {
    const scored = allJobs.filter(j => j.matchScore);
    if (scored.length === 0) return '-';
    const sum = scored.reduce((acc, j) => acc + j.matchScore!, 0);
    return Math.round((sum / scored.length) * 100).toString();
  });
  const rejectRate = $derived.by(() => {
    if (totalEvaluated === 0) return '-';
    const rejected = allJobs.filter(j => j.status === 'rejected').length;
    return Math.round((rejected / totalEvaluated) * 100).toString();
  });

  async function fetchJobs() {
    try {
      const res = await fetch('/api/jobs');
      if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
      allJobs = await res.json();
      // Initialize sources check
      const sources = [...new Set(allJobs.map(j => j.source))].filter(Boolean);
      selectedSources = new Set(sources);
    } catch (err: any) {
      error = err.message;
    } finally {
      isLoading = false;
    }
  }

  onMount(() => {
    fetchJobs();
    
    // Theme logic
    const savedTheme = localStorage.getItem('jobetl-theme');
    const prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;
    if (savedTheme) {
      document.documentElement.setAttribute('data-theme', savedTheme);
    } else if (prefersLight) {
      document.documentElement.setAttribute('data-theme', 'light');
    } else {
      document.documentElement.setAttribute('data-theme', 'dark');
    }
  });

  function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('jobetl-theme', newTheme);
  }

  import Sidebar from './components/Sidebar.svelte';
  import Header from './components/Header.svelte';
  import Metrics from './components/Metrics.svelte';

  // Toggle Source
  function toggleSource(source: string) {
    const update = () => {
      const newSources = new Set(selectedSources);
      if (newSources.has(source)) {
        newSources.delete(source);
      } else {
        newSources.add(source);
      }
      selectedSources = newSources;
    };

    // Defer heavy update on mobile to allow sidebar to slide out smoothly
    if (window.innerWidth <= 1024 && !isSidebarCollapsed) {
      isSidebarCollapsed = true;
      setTimeout(update, 300);
    } else {
      update();
    }
  }

  let isSidebarCollapsed = $state(true);

  function handleFilterChange(f: 'matched' | 'all' | 'rejected') {
    if (window.innerWidth <= 1024) {
      isSidebarCollapsed = true;
      setTimeout(() => currentFilter = f, 300);
    } else {
      currentFilter = f;
    }
  }

  function toggleSidebar() {
    isSidebarCollapsed = !isSidebarCollapsed;
  }
</script>

<div class="flex min-h-screen w-full bg-[var(--bg-base)] transition-theme relative">
  <Sidebar 
    currentFilter={currentFilter}
    onFilterChange={handleFilterChange}
    allSources={allSources}
    selectedSources={selectedSources}
    onToggleSource={toggleSource}
    onToggleTheme={toggleTheme}
    isCollapsed={isSidebarCollapsed}
    onClose={() => isSidebarCollapsed = true}
  />

  <main class="flex-1 flex flex-col min-w-0 relative bg-[var(--bg-base)] w-full">
    <Header 
      currentFilter={currentFilter}
      onFilterChange={(f) => currentFilter = f}
      currentSort={currentSort}
      onSortChange={(s) => currentSort = s}
      searchQuery={searchQuery}
      onSearchChange={(q) => searchQuery = q}
      onToggleSidebar={toggleSidebar}
      isSidebarCollapsed={isSidebarCollapsed}
    />

    <div class="p-4 md:p-8 xl:px-12 flex flex-col gap-6 md:gap-10 w-full">
      <section aria-label="Dashboard Metrics">
        <Metrics 
          totalEvaluated={totalEvaluated}
          totalMatched={totalMatched}
          avgScore={avgScore}
          rejectRate={rejectRate}
        />
      </section>

      <section aria-label="Job Listings" class="bg-transparent md:bg-[var(--bg-surface)] md:border md:border-[var(--border-subtle)] rounded-2xl overflow-visible md:overflow-hidden w-full transition-theme shadow-sm">
        <!-- Desktop Header -->
        <header class="hidden md:grid grid-cols-[80px_3fr_2fr_1fr] px-6 py-4 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[0.75rem] text-[var(--text-tertiary)] font-semibold uppercase tracking-[0.05em] w-full min-w-0">
          <div class="min-w-0">Score</div>
          <div class="min-w-0">Role & Company</div>
          <div class="min-w-0">Key Details</div>
          <div class="text-right min-w-0">Action</div>
        </header>

        <div class="flex flex-col w-full">
          {#if isLoading}
            <div class="py-20 px-4 text-center text-[var(--text-tertiary)] font-serif italic text-xl">Loading intelligence...</div>
          {:else if error}
            <div class="py-20 px-4 text-center text-[var(--danger)] font-serif italic text-xl">{error}</div>
          {:else if filteredJobs.length === 0}
            <div class="py-20 px-4 text-center text-[var(--text-tertiary)] font-serif italic text-xl">No jobs match your criteria.</div>
          {:else}
            {#each filteredJobs as job (job.externalId)}
              <div
                animate:flip={{ duration: 400, easing: quintOut }}
                in:fly={{ y: 20, duration: 300, delay: 150, easing: quintOut }}
                out:fade={{ duration: 150 }}
              >
                <JobCard 
                  job={job} 
                  onToggleApply={toggleApply}
                  onClick={(j) => selectedJob = j}
                />
              </div>
            {/each}
          {/if}
        </div>
      </section>
    </div>
  </main>
</div>

<Drawer 
  job={selectedJob} 
  isOpen={selectedJob !== null} 
  onClose={() => selectedJob = null}
  onToggleApply={toggleApply}
/>
