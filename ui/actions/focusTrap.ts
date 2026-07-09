export function focusTrap(node: HTMLElement, active: boolean = true) {
  const focusableSelectors = [
    "a[href]",
    "area[href]",
    "input:not([disabled])",
    "select:not([disabled])",
    "textarea:not([disabled])",
    "button:not([disabled])",
    "iframe",
    "object",
    "embed",
    '[tabindex]:not([tabindex="-1"])',
    "[contenteditable]"
  ].join(",");

  let focusableElements: HTMLElement[] = [];
  let firstFocusable: HTMLElement | null = null;
  let lastFocusable: HTMLElement | null = null;
  let isEnabled = active;

  function updateFocusableElements() {
    focusableElements = Array.from(node.querySelectorAll<HTMLElement>(focusableSelectors));
    if (focusableElements.length > 0) {
      firstFocusable = focusableElements[0];
      lastFocusable = focusableElements[focusableElements.length - 1];
    } else {
      firstFocusable = null;
      lastFocusable = null;
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (!isEnabled || e.key !== "Tab") return;

    updateFocusableElements();

    if (!firstFocusable || !lastFocusable) {
      e.preventDefault();
      return;
    }

    if (e.shiftKey) {
      if (document.activeElement === firstFocusable || document.activeElement === node) {
        lastFocusable.focus();
        e.preventDefault();
      }
    } else {
      if (document.activeElement === lastFocusable || document.activeElement === node) {
        firstFocusable.focus();
        e.preventDefault();
      }
    }
  }

  node.addEventListener("keydown", handleKeydown);

  // Auto-focus first element slightly after mount to ensure rendering is complete
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  if (isEnabled) {
    timeoutId = setTimeout(() => {
      updateFocusableElements();
      if (firstFocusable) firstFocusable.focus();
      else node.focus();
    }, 10);
  }

  return {
    update(newActive: boolean) {
      isEnabled = newActive;
      if (isEnabled) {
        updateFocusableElements();
        if (firstFocusable) firstFocusable.focus();
      }
    },
    destroy() {
      if (timeoutId) clearTimeout(timeoutId);
      node.removeEventListener("keydown", handleKeydown);
    }
  };
}
