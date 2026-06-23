<script lang="ts">
  let {
    currentFilter,
    currentSort,
    onSortChange,
    searchQuery,
    onSearchChange,
    onToggleSidebar,
    isSidebarCollapsed
  } = $props<{
    currentFilter: "matched" | "all" | "rejected" | "applied" | "not-interested";
    currentSort: "score" | "date";
    onSortChange: (s: "score" | "date") => void;
    searchQuery: string;
    onSearchChange: (q: string) => void;
    onToggleSidebar: () => void;
    isSidebarCollapsed: boolean;
  }>();

  function getTitle(f: "matched" | "all" | "rejected" | "applied" | "not-interested") {
    if (f === "matched") return "Matched";
    if (f === "all") return "All Evaluated";
    if (f === "applied") return "Applied";
    if (f === "not-interested") return "Not Interested";
    return "Rejected";
  }
</script>

<header
  class="sticky top-0 bg-(--bg-base) z-[40] p-4 md:p-6 lg:px-12 flex flex-col md:flex-row justify-between md:items-center border-b border-(--border-subtle) gap-4 md:gap-5 transition-theme"
>
  <div class="flex items-center gap-4 justify-between md:justify-start w-full md:w-auto shrink-0">
    <div class="flex items-center gap-4">
      <button
        class="w-10 h-10 flex items-center justify-center text-(--text-secondary) hover:bg-(--bg-hover) hover:text-(--text-primary) rounded-lg transition-colors"
        onclick={onToggleSidebar}
        aria-label="Toggle Sidebar"
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
      <h1
        class="font-serif text-2xl lg:text-4xl text-(--text-primary) tracking-tight whitespace-nowrap"
      >
        {getTitle(currentFilter)}
      </h1>
    </div>
  </div>

  <div class="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
    <div class="relative w-full sm:flex-1 md:w-48 lg:w-64">
      <svg
        class="absolute left-3 top-1/2 -translate-y-1/2 text-(--text-tertiary) w-4 h-4 pointer-events-none"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        aria-hidden="true"
        ><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"
        ></line></svg
      >
      <input
        type="search"
        aria-label="Search jobs"
        value={searchQuery}
        oninput={(e) => onSearchChange(e.currentTarget.value)}
        placeholder="Search jobs..."
        class="w-full bg-(--bg-surface) border border-(--border-subtle) text-(--text-primary) pl-9 pr-4 py-2.5 rounded-lg text-sm outline-none focus:border-(--text-primary) transition-all duration-200"
      />
    </div>

    <div class="relative w-full sm:w-auto md:w-40 lg:w-48">
      <select
        aria-label="Sort jobs"
        value={currentSort}
        onchange={(e) => onSortChange(e.currentTarget.value as "score" | "date")}
        class="w-full bg-(--bg-surface) border border-(--border-subtle) text-(--text-primary) pl-4 pr-10 py-2.5 rounded-lg text-sm outline-none cursor-pointer appearance-none transition-all duration-200 focus:border-(--text-primary)"
      >
        <option value="score">Sort by Score</option>
        <option value="date">Sort by Latest</option>
      </select>
      <svg
        class="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-(--text-tertiary)"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg
      >
    </div>
  </div>
</header>
