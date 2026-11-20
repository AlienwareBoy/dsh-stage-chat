/**
 * rc.5 elects a single view per id but its header reads the raw registration
 * ledger. Chat is fixed at the front; remove only repeated Chat labels from
 * that header, including rows shortened by its responsive width budget.
 */
export function installChatTabDedup(): () => void {
  const update = () => {
    document.querySelectorAll("[data-conversation-tabs]").forEach(row => {
      const tabs = Array.from(row.querySelectorAll<HTMLElement>(":scope > [role=tab]"));
      const first = tabs[0]?.textContent?.trim();
      tabs.forEach((tab, i) => {
        tab.toggleAttribute("data-dsh-stage-chat-duplicate-tab", first === "对话" && i > 0 && tab.textContent?.trim() === first);
      });
    });
  };
  const observer = new MutationObserver(update);
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  update();
  return () => {
    observer.disconnect();
    document.querySelectorAll("[data-dsh-stage-chat-duplicate-tab]").forEach(tab =>
      tab.removeAttribute("data-dsh-stage-chat-duplicate-tab"));
  };
}
