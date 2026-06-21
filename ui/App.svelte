<script lang="ts">
  import { onMount } from "svelte";
  import { fade } from "svelte/transition";
  import type { StoredJob } from "./types";
  import JobCard from "./components/JobCard.svelte";
  import Drawer from "./components/Drawer.svelte";
  import "./app.css";

  let allJobs = $state<StoredJob[]>([]);
  let currentFilter = $state<"matched" | "all" | "rejected">("matched");
  let currentSort = $state<"score" | "date">("score");
  let searchQuery = $state("");
  let appliedFilter = $state<"all" | "only" | "hide">("all");
  let notInterestedFilter = $state<"all" | "only" | "hide">("hide");

  let selectedSources = $state<Set<string>>(new Set());
  let allSources = $derived([...new Set(allJobs.map((j) => j.source))].filter(Boolean));

  let isLoading = $state(true);
  let error = $state<string | null>(null);
  let selectedJob = $state<StoredJob | null>(null);

  async function toggleApply(id: string, isApplied: boolean) {
    try {
      const res = await fetch(`/api/jobs/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isApplied })
      });
      if (res.ok) {
        // Update local state instantly
        const jobIndex = allJobs.findIndex((j) => j.externalId === id);
        if (jobIndex !== -1) {
          allJobs[jobIndex].isApplied = isApplied;
          allJobs[jobIndex].appliedAt = isApplied ? new Date().toISOString() : undefined;
        }
      }
    } catch (err) {
      console.error("Failed to update apply status", err);
    }
  }

  async function toggleNotInterested(id: string, isNotInterested: boolean) {
    try {
      const res = await fetch(`/api/jobs/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isNotInterested })
      });
      if (res.ok) {
        // Update local state instantly
        const jobIndex = allJobs.findIndex((j) => j.externalId === id);
        if (jobIndex !== -1) {
          allJobs[jobIndex].isNotInterested = isNotInterested;
        }
      }
    } catch (err) {
      console.error("Failed to update interested status", err);
    }
  }

  // Derived filtered jobs
  const filteredJobs = $derived.by(() => {
    let result = allJobs.filter((job) => {
      // 1. Filter by intelligence status
      if (currentFilter === "matched" && job.status !== "matched") return false;
      if (currentFilter === "rejected" && job.status !== "rejected") return false;

      // 2. Filter by applied status
      if (appliedFilter === "only" && !job.isApplied) return false;
      if (appliedFilter === "hide" && job.isApplied) return false;

      // 3. Filter by not interested status
      if (notInterestedFilter === "only" && !job.isNotInterested) return false;
      if (notInterestedFilter === "hide" && job.isNotInterested) return false;

      // 4. Filter by selected sources
      if (!selectedSources.has(job.source)) return false;

      // 5. Search query
      if (searchQuery.trim() !== "") {
        const q = searchQuery.toLowerCase();
        const t = (job.title || "").toLowerCase();
        const c = (job.company || "").toLowerCase();
        if (!t.includes(q) && !c.includes(q)) return false;
      }

      return true;
    });

    // 4. Sort
    result.sort((a, b) => {
      if (currentSort === "score") {
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
  const totalMatched = $derived(allJobs.filter((j) => j.status === "matched").length);
  const avgScore = $derived.by(() => {
    const scored = allJobs.filter((j) => j.matchScore);
    if (scored.length === 0) return "-";
    const sum = scored.reduce((acc, j) => acc + j.matchScore!, 0);
    return Math.round((sum / scored.length) * 100).toString();
  });
  const rejectRate = $derived.by(() => {
    if (totalEvaluated === 0) return "-";
    const rejected = allJobs.filter((j) => j.status === "rejected").length;
    return Math.round((rejected / totalEvaluated) * 100).toString();
  });

  async function fetchJobs() {
    try {
      const res = await fetch("/api/jobs");
      if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
      allJobs = await res.json();
      // Initialize sources check
      const sources = [...new Set(allJobs.map((j) => j.source))].filter(Boolean);
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
    const savedTheme = localStorage.getItem("jobetl-theme");
    const prefersLight = window.matchMedia("(prefers-color-scheme: light)").matches;
    if (savedTheme) {
      document.documentElement.setAttribute("data-theme", savedTheme);
    } else if (prefersLight) {
      document.documentElement.setAttribute("data-theme", "light");
    } else {
      document.documentElement.setAttribute("data-theme", "dark");
    }
  });

  function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute("data-theme");
    const newTheme = currentTheme === "light" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", newTheme);
    localStorage.setItem("jobetl-theme", newTheme);
  }

  import Sidebar from "./components/Sidebar.svelte";
  import Header from "./components/Header.svelte";
  import Metrics from "./components/Metrics.svelte";

  // Toggle Source
  function toggleSource(source: string) {
    const newSources = new Set(selectedSources);
    if (newSources.has(source)) {
      newSources.delete(source);
    } else {
      newSources.add(source);
    }
    selectedSources = newSources;
  }

  let isSidebarCollapsed = $state(true);

  function handleFilterChange(f: "matched" | "all" | "rejected") {
    currentFilter = f;
    if (window.innerWidth <= 1024) {
      isSidebarCollapsed = true;
    }
  }

  function toggleSidebar() {
    isSidebarCollapsed = !isSidebarCollapsed;
  }
</script>

<div class="flex min-h-screen w-full bg-(--bg-base) transition-theme relative">
  <Sidebar
    {currentFilter}
    onFilterChange={handleFilterChange}
    {allSources}
    {selectedSources}
    onToggleSource={toggleSource}
    onToggleTheme={toggleTheme}
    isCollapsed={isSidebarCollapsed}
    onClose={() => (isSidebarCollapsed = true)}
    {appliedFilter}
    onAppliedFilterChange={(f) => (appliedFilter = f)}
    {notInterestedFilter}
    onNotInterestedFilterChange={(f) => (notInterestedFilter = f)}
  />

  <main class="flex-1 flex flex-col min-w-0 relative bg-(--bg-base) w-full">
    <Header
      {currentFilter}
      {currentSort}
      onSortChange={(s) => (currentSort = s)}
      {searchQuery}
      onSearchChange={(q) => (searchQuery = q)}
      onToggleSidebar={toggleSidebar}
      {isSidebarCollapsed}
    />

    <div class="p-4 md:p-8 xl:px-12 flex flex-col gap-6 md:gap-10 w-full">
      <section aria-label="Dashboard Metrics">
        <Metrics {totalEvaluated} {totalMatched} {avgScore} {rejectRate} />
      </section>

      <section
        aria-label="Job Listings"
        class="bg-transparent md:bg-(--bg-surface) md:border md:border-(--border-subtle) rounded-2xl overflow-visible md:overflow-hidden w-full transition-theme shadow-sm"
      >
        <!-- Desktop Header -->
        <header
          class="hidden md:grid grid-cols-[80px_3fr_2fr_1fr] px-6 py-4 border-b border-(--border-subtle) bg-(--bg-surface) text-[0.75rem] text-(--text-tertiary) font-semibold uppercase tracking-[0.05em] w-full min-w-0"
        >
          <div class="min-w-0">Score</div>
          <div class="min-w-0">Role & Company</div>
          <div class="min-w-0">Key Details</div>
          <div class="text-right min-w-0">Action</div>
        </header>

        <div class="flex flex-col w-full">
          {#if isLoading}
            <div class="py-20 px-4 text-center text-(--text-tertiary) font-serif italic text-xl">
              Loading intelligence...
            </div>
          {:else if error}
            <div class="py-20 px-4 text-center text-(--danger) font-serif italic text-xl">
              {error}
            </div>
          {:else if filteredJobs.length === 0}
            <div class="py-20 px-4 text-center text-(--text-tertiary) font-serif italic text-xl">
              No jobs match your criteria.
            </div>
          {:else}
            {#key currentFilter}
              <div in:fade={{ duration: 150 }} class="flex flex-col w-full">
                {#each filteredJobs as job (job.externalId)}
                  <JobCard {job} onToggleApply={toggleApply} onClick={(j) => (selectedJob = j)} />
                {/each}
              </div>
            {/key}
          {/if}
        </div>
      </section>
    </div>
  </main>
</div>

<Drawer
  job={selectedJob}
  isOpen={selectedJob !== null}
  onClose={() => (selectedJob = null)}
  onToggleApply={toggleApply}
  onToggleNotInterested={toggleNotInterested}
/>
