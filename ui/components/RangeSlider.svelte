<script lang="ts">
  let {
    min = $bindable(0),
    max = $bindable(100),
    rangeMin = 0,
    rangeMax = 100,
    step = 1
  } = $props<{
    min?: number;
    max?: number;
    rangeMin?: number;
    rangeMax?: number;
    step?: number;
  }>();

  let activeInput = $state<"min" | "max">("min");
  let container = $state<HTMLDivElement | null>(null);

  function handleMinInput(e: Event) {
    const target = e.target as HTMLInputElement;
    const val = Number(target.value);
    min = Math.min(val, max - step);
  }

  function handleMaxInput(e: Event) {
    const target = e.target as HTMLInputElement;
    const val = Number(target.value);
    max = Math.max(val, min + step);
  }

  function handleTrackClick(e: MouseEvent) {
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, clickX / rect.width));
    const value = Math.round(rangeMin + percentage * (rangeMax - rangeMin));

    const distMin = Math.abs(value - min);
    const distMax = Math.abs(value - max);

    if (distMin < distMax) {
      min = Math.min(value, max - step);
      activeInput = "min";
    } else {
      max = Math.max(value, min + step);
      activeInput = "max";
    }
  }
</script>

<div class="flex flex-col gap-2 w-full">
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_noninteractive_element_to_interactive_role -->
  <div
    bind:this={container}
    onclick={handleTrackClick}
    role="slider"
    aria-valuemin={rangeMin}
    aria-valuemax={rangeMax}
    aria-valuenow={min}
    aria-label="Score range slider"
    tabindex="-1"
    class="relative w-full h-6 flex items-center cursor-pointer select-none"
  >
    <!-- Background Track -->
    <div class="absolute left-0 right-0 h-1.5 bg-(--border-subtle) rounded-full"></div>

    <!-- Active Fill Track -->
    <div
      class="absolute h-1.5 bg-(--accent) rounded-full"
      style:left="{((min - rangeMin) / (rangeMax - rangeMin)) * 100}%"
      style:right="{100 - ((max - rangeMin) / (rangeMax - rangeMin)) * 100}%"
    ></div>

    <!-- Minimum Range Input -->
    <input
      type="range"
      min={rangeMin}
      max={rangeMax}
      {step}
      value={min}
      oninput={handleMinInput}
      onfocus={() => (activeInput = "min")}
      onmousedown={() => (activeInput = "min")}
      ontouchstart={() => (activeInput = "min")}
      class="absolute w-full h-1.5 appearance-none bg-transparent pointer-events-none outline-none"
      style="z-index: {activeInput === 'min' ? 10 : 5};"
      aria-label="Minimum match score"
    />

    <!-- Maximum Range Input -->
    <input
      type="range"
      min={rangeMin}
      max={rangeMax}
      {step}
      value={max}
      oninput={handleMaxInput}
      onfocus={() => (activeInput = "max")}
      onmousedown={() => (activeInput = "max")}
      ontouchstart={() => (activeInput = "max")}
      class="absolute w-full h-1.5 appearance-none bg-transparent pointer-events-none outline-none"
      style="z-index: {activeInput === 'max' ? 10 : 5};"
      aria-label="Maximum match score"
    />
  </div>
</div>

<style>
  input[type="range"]::-webkit-slider-runnable-track {
    background: transparent;
    border: none;
  }
  input[type="range"]::-moz-range-track {
    background: transparent;
    border: none;
  }

  input[type="range"]::-webkit-slider-thumb {
    pointer-events: auto;
    appearance: none;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--accent);
    border: 2px solid var(--bg-surface);
    cursor: pointer;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
    transition:
      transform 0.1s ease,
      background-color 0.2s ease;
  }
  input[type="range"]::-webkit-slider-thumb:hover {
    transform: scale(1.15);
  }
  input[type="range"]::-webkit-slider-thumb:active {
    transform: scale(0.95);
    background: var(--text-primary);
  }

  input[type="range"]::-moz-range-thumb {
    pointer-events: auto;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--accent);
    border: 2px solid var(--bg-surface);
    cursor: pointer;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
    transition:
      transform 0.1s ease,
      background-color 0.2s ease;
  }
  input[type="range"]::-moz-range-thumb:hover {
    transform: scale(1.15);
  }
  input[type="range"]::-moz-range-thumb:active {
    transform: scale(0.95);
    background: var(--text-primary);
  }
</style>
