<script lang="ts">
  import { onMount } from "svelte";
  import { fade } from "svelte/transition";
  import { flip } from "svelte/animate";
  import type { StoredJob } from "./types";
  import JobCard from "./components/JobCard.svelte";
  import Drawer from "./components/Drawer.svelte";
  import Login from "./components/Login.svelte";
  import "./app.css";

  let isAuthenticated = $state<boolean | null>(null);

  let allJobs = $state<StoredJob[]>([]);
  let currentFilter = $state<"matched" | "all" | "rejected" | "applied" | "not-interested">(
    "matched"
  );
  let currentSort = $state<"score" | "date">("score");
  let searchQuery = $state("");
  let appliedFilter = $state<"all" | "only" | "hide">("all");
  let notInterestedFilter = $state<"all" | "only" | "hide">("hide");
  let minScore = $state(0);
  let maxScore = $state(100);

  let selectedSources = $state<Set<string>>(new Set());
  let allSources = $derived([...new Set(allJobs.map((j) => j.source))].filter(Boolean));

  let sourceCounts = $derived.by(() => {
    const counts: Record<string, number> = {};
    for (const job of allJobs) {
      if (job.source) {
        counts[job.source] = (counts[job.source] || 0) + 1;
      }
    }
    return counts;
  });

  function resetScoreRange() {
    minScore = 0;
    maxScore = 100;
  }

  function resetAllFilters() {
    searchQuery = "";
    resetScoreRange();
    appliedFilter = "all";
    notInterestedFilter = "hide";
    selectedSources = new Set(allSources);
  }

  let isLoading = $state(true);
  let error = $state<string | null>(null);
  let selectedJob = $state<StoredJob | null>(null);

  function clearSession() {
    isAuthenticated = false;
    allJobs = [];
    selectedJob = null;
  }

  async function authFetch(url: string, init?: RequestInit): Promise<Response | null> {
    try {
      const res = await fetch(url, {
        ...init,
        credentials: "include"
      });
      if (res.status === 401) {
        clearSession();
        return null;
      }
      return res;
    } catch (err) {
      console.error(`Request to ${url} failed:`, err);
      throw err;
    }
  }

  async function toggleApply(id: string, isApplied: boolean) {
    try {
      const res = await authFetch(`/api/jobs/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isApplied })
      });
      if (!res) return;
      if (res.ok) {
        // Update local state instantly
        const jobIndex = allJobs.findIndex((j) => j.externalId === id);
        if (jobIndex !== -1) {
          allJobs[jobIndex].isApplied = isApplied;
          allJobs[jobIndex].appliedAt = isApplied ? new Date().toISOString() : undefined;
        }
        if (selectedJob && selectedJob.externalId === id) {
          selectedJob.isApplied = isApplied;
          selectedJob.appliedAt = isApplied ? new Date().toISOString() : undefined;
        }
      }
    } catch (err) {
      console.error("Failed to update apply status", err);
    }
  }

  async function toggleNotInterested(id: string, isNotInterested: boolean) {
    try {
      const res = await authFetch(`/api/jobs/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isNotInterested })
      });
      if (!res) return;
      if (res.ok) {
        // Update local state instantly
        const jobIndex = allJobs.findIndex((j) => j.externalId === id);
        if (jobIndex !== -1) {
          allJobs[jobIndex].isNotInterested = isNotInterested;
        }
        if (selectedJob && selectedJob.externalId === id) {
          selectedJob.isNotInterested = isNotInterested;
        }
      }
    } catch (err) {
      console.error("Failed to update interested status", err);
    }
  }

  // Derived filtered jobs
  const filteredJobs = $derived.by(() => {
    let result = allJobs.filter((job) => {
      // 1. Filter by intelligence/main status selection
      if (currentFilter === "matched" && job.status !== "matched") return false;
      if (currentFilter === "rejected" && job.status !== "rejected") return false;
      if (currentFilter === "applied" && !job.isApplied) return false;
      if (currentFilter === "not-interested" && !job.isNotInterested) return false;

      // 2. Filter by status filters (segmented controls)
      if (currentFilter !== "applied") {
        if (appliedFilter === "only" && !job.isApplied) return false;
        if (appliedFilter === "hide" && job.isApplied) return false;
      }

      if (currentFilter !== "not-interested") {
        if (notInterestedFilter === "only" && !job.isNotInterested) return false;
        if (notInterestedFilter === "hide" && job.isNotInterested) return false;
      }

      // 3. Filter by match score range
      if (job.matchScore != null) {
        const scorePct = Math.round(job.matchScore * 100);
        if (scorePct < minScore || scorePct > maxScore) return false;
      } else if (minScore > 0 || maxScore < 100) {
        return false;
      }

      // 4. Filter by selected sources
      if (!selectedSources.has(job.source)) return false;

      // 4. Search query
      if (searchQuery.trim() !== "") {
        const q = searchQuery.toLowerCase();
        const t = (job.title || "").toLowerCase();
        const c = (job.company || "").toLowerCase();
        if (!t.includes(q) && !c.includes(q)) return false;
      }

      return true;
    });

    // 5. Sort
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
  const totalApplied = $derived(allJobs.filter((j) => j.isApplied).length);
  const totalNotInterested = $derived(allJobs.filter((j) => j.isNotInterested).length);
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
    isLoading = true;
    error = null;
    try {
      const res = await authFetch("/api/jobs");
      if (!res) return;
      if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
      allJobs = await res.json();
      // Initialize sources check
      const sources = [...new Set(allJobs.map((j) => j.source))].filter(Boolean);
      selectedSources = new Set(sources);
      isAuthenticated = true;
    } catch (err: any) {
      error = err.message;
      if (isAuthenticated === null) {
        isAuthenticated = false;
      }
    } finally {
      isLoading = false;
    }
  }

  async function handleLogout() {
    try {
      await fetch("/api/logout", { method: "POST", credentials: "include" });
    } catch (err) {
      console.error("Failed to log out:", err);
    } finally {
      clearSession();
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

  function handleFilterChange(f: "matched" | "all" | "rejected" | "applied" | "not-interested") {
    currentFilter = f;
    if (f === "applied") {
      appliedFilter = "only";
      notInterestedFilter = "hide";
    } else if (f === "not-interested") {
      notInterestedFilter = "only";
      appliedFilter = "all";
    } else {
      appliedFilter = "all";
      notInterestedFilter = "hide";
    }
    if (window.innerWidth <= 1024) {
      isSidebarCollapsed = true;
    }
  }

  function handleAppliedFilterChange(f: "all" | "only" | "hide") {
    appliedFilter = f;
    if (f === "only") {
      currentFilter = "applied";
      if (notInterestedFilter === "only") {
        notInterestedFilter = "hide";
      }
    } else if (currentFilter === "applied") {
      currentFilter = "all";
    }
  }

  function handleNotInterestedFilterChange(f: "all" | "only" | "hide") {
    notInterestedFilter = f;
    if (f === "only") {
      currentFilter = "not-interested";
      if (appliedFilter === "only") {
        appliedFilter = "all";
      }
    } else if (currentFilter === "not-interested") {
      currentFilter = "all";
    }
  }

  function toggleSidebar() {
    isSidebarCollapsed = !isSidebarCollapsed;
  }
</script>

{#if isAuthenticated === null}
  <div class="fixed inset-0 flex items-center justify-center bg-(--bg-base) transition-theme">
    <div class="text-center text-(--text-tertiary) font-serif italic text-xl">
      Verifying session...
    </div>
  </div>
{:else if isAuthenticated === false}
  <Login
    onLoginSuccess={() => {
      isAuthenticated = true;
      fetchJobs();
    }}
  />
{:else}
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
      onAppliedFilterChange={handleAppliedFilterChange}
      {notInterestedFilter}
      onNotInterestedFilterChange={handleNotInterestedFilterChange}
      bind:minScore
      bind:maxScore
      {sourceCounts}
      onLogout={handleLogout}
    />

    <main
      class="flex-1 flex flex-col min-w-0 relative bg-(--bg-base) w-full transition-panel {!isSidebarCollapsed
        ? 'lg:ml-[280px]'
        : ''}"
    >
      <Header
        {currentFilter}
        {currentSort}
        onSortChange={(s) => (currentSort = s)}
        {searchQuery}
        onSearchChange={(q) => (searchQuery = q)}
        onToggleSidebar={toggleSidebar}
        {isSidebarCollapsed}
        {minScore}
        {maxScore}
        onResetScoreRange={resetScoreRange}
      />

      <div class="p-4 md:p-8 xl:px-12 flex flex-col gap-6 md:gap-10 w-full">
        <section aria-label="Dashboard Metrics">
          <Metrics
            {totalEvaluated}
            {totalMatched}
            {totalApplied}
            {totalNotInterested}
            {avgScore}
            {rejectRate}
            {currentFilter}
            {appliedFilter}
            {notInterestedFilter}
            onMetricClick={handleFilterChange}
          />
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
              <div
                class="py-16 px-6 text-center flex flex-col items-center justify-center gap-4 max-w-md mx-auto w-full"
              >
                <div
                  class="w-12 h-12 rounded-full bg-(--accent-light) text-(--accent) flex items-center justify-center border border-(--accent)/10"
                >
                  <svg
                    width="22"
                    height="22"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <circle cx="11" cy="11" r="8"></circle>
                    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                  </svg>
                </div>
                <div class="flex flex-col gap-1.5">
                  <h3 class="text-lg font-semibold text-(--text-primary)">No Matching Jobs</h3>
                  <p class="text-sm text-(--text-secondary) leading-relaxed">
                    Try adjusting your filters, score range, or search query to find matching job
                    opportunities.
                  </p>
                </div>
                <button
                  onclick={resetAllFilters}
                  class="mt-2 px-5 py-2.5 bg-(--accent) hover:opacity-95 text-(--bg-base) font-semibold rounded-lg text-sm transition-all duration-200 shadow-sm cursor-pointer outline-none"
                >
                  Reset Filters
                </button>
              </div>
            {:else}
              {#key currentFilter}
                <div in:fade={{ duration: 150 }} class="flex flex-col w-full">
                  {#each filteredJobs as job (job.externalId)}
                    <div
                      animate:flip={{ duration: 300 }}
                      transition:fade={{ duration: 150 }}
                      class="w-full"
                    >
                      <JobCard
                        {job}
                        onToggleApply={toggleApply}
                        onClick={(j) => (selectedJob = j)}
                      />
                    </div>
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
{/if}
