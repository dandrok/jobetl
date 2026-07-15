<script lang="ts">
  let { onLoginSuccess } = $props<{
    onLoginSuccess: () => void;
  }>();

  let password = $state("");
  let errorMessage = $state("");
  let isLoading = $state(false);

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    if (!password.trim()) return;

    isLoading = true;
    errorMessage = "";

    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ password }),
        // credentials: "include" tells the browser to store/send the cookie cross-origin
        credentials: "include"
      });

      let data: any;
      try {
        data = await res.json();
      } catch {
        errorMessage = `Server error (${res.status}): Invalid response format.`;
        return;
      }

      if (res.ok && data.success) {
        onLoginSuccess();
      } else {
        const remaining = data.remainingAttempts;
        if (remaining !== undefined && res.status === 401) {
          if (remaining === 0) {
            errorMessage = "Invalid password. No attempts remaining. Please try again in 1 hour.";
          } else if (remaining <= 3) {
            errorMessage = `Invalid password. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining before lockout.`;
          } else {
            errorMessage = data.error || "Login failed. Please check your password.";
          }
        } else {
          errorMessage = data.error || "Login failed. Please check your password.";
        }
      }
    } catch (err: unknown) {
      errorMessage = "Network error. Make sure the backend server is running.";
      console.error(err);
    } finally {
      isLoading = false;
    }
  }
</script>

<div
  class="fixed inset-0 flex items-center justify-center bg-(--bg-base) transition-theme p-4 z-[9999]"
>
  <!-- Subtle ambient decorative glow -->
  <div
    class="absolute w-[400px] h-[400px] rounded-full bg-(--accent) opacity-[0.03] blur-3xl pointer-events-none"
  ></div>

  <div
    class="w-full max-w-[420px] bg-(--bg-surface) border border-(--border-subtle) rounded-2xl shadow-xl p-8 md:p-10 transition-theme relative overflow-hidden"
  >
    <div class="flex flex-col items-center text-center mb-8">
      <div
        class="w-12 h-12 rounded-xl bg-(--accent-light) text-(--accent) flex items-center justify-center border border-(--accent)/10 mb-4"
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
        </svg>
      </div>
      <h1 class="font-serif text-3xl text-(--text-primary) font-semibold tracking-tight">
        JobETL Intelligence
      </h1>
      <p class="text-sm text-(--text-secondary) mt-2">
        Enter credentials to unlock your pipeline dashboard.
      </p>
    </div>

    <form onsubmit={handleSubmit} class="flex flex-col gap-5">
      <div class="flex flex-col gap-2">
        <label
          for="pwd"
          class="text-xs font-semibold uppercase tracking-wider text-(--text-tertiary)"
          >Password</label
        >
        <input
          id="pwd"
          type="password"
          bind:value={password}
          disabled={isLoading}
          placeholder="••••••••••••"
          class="w-full px-4 py-3.5 bg-(--bg-base) border border-(--border-subtle) rounded-xl text-(--text-primary) placeholder-(--text-tertiary) hover:border-(--border-hover) focus:border-(--accent) focus:outline-none transition-theme duration-200"
          required
        />
      </div>

      {#if errorMessage}
        <div
          class="p-4 bg-(--danger)/10 border border-(--danger)/20 rounded-xl text-sm text-(--danger) leading-relaxed"
        >
          {errorMessage}
        </div>
      {/if}

      <button
        type="submit"
        disabled={isLoading || !password.trim()}
        class="w-full py-4 bg-(--accent) hover:opacity-95 disabled:opacity-50 text-(--bg-base) font-semibold rounded-xl text-[0.95rem] transition-all duration-200 cursor-pointer shadow-sm disabled:cursor-not-allowed outline-none flex items-center justify-center gap-2"
      >
        {#if isLoading}
          <svg
            class="animate-spin h-5 w-5 text-(--bg-base)"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"
            ></circle>
            <path
              class="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            ></path>
          </svg>
          Authenticating...
        {:else}
          Access Dashboard
        {/if}
      </button>
    </form>
  </div>
</div>
