/** Copy controls are emitted by the markdown renderer, then sanitized before mounting. */
export function copyCode(node: HTMLElement) {
  function labelButtons() {
    node.querySelectorAll<HTMLButtonElement>('button.copy:not([aria-label])').forEach(button => {
      button.type = "button";
      button.setAttribute("aria-label", "Copy code");
      button.title = "Copy code";
    });
  }
  labelButtons();
  const observer = new MutationObserver(labelButtons);
  observer.observe(node, { childList: true, subtree: true });

  async function handleClick(event: MouseEvent) {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button.copy");
    const code = button?.closest("pre")?.querySelector("code");
    if (!button || !code) return;
    try {
      await navigator.clipboard.writeText(code.innerText);
      button.classList.add("copied");
      button.setAttribute("aria-label", "Code copied");
      setTimeout(() => {
        button.classList.remove("copied");
        button.setAttribute("aria-label", "Copy code");
      }, 2000);
    } catch {
      button.setAttribute("aria-label", "Copy failed. Select and copy the code manually.");
    }
  }
  node.addEventListener("click", handleClick);
  return { destroy() { observer.disconnect(); node.removeEventListener("click", handleClick); } };
}
