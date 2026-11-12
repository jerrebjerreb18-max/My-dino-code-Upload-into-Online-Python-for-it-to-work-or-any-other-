(() => {
  const choiceKey = "pm-cookie-choice-v1";
  const choiceLifetimeMs = 180 * 24 * 60 * 60 * 1000;
  const notice = document.getElementById("cookie-notice");
  const acceptButtons = document.querySelectorAll('[data-cookie-choice="preferences"]');
  const essentialButtons = document.querySelectorAll('[data-cookie-choice="essential"]');
  const settingsButtons = document.querySelectorAll("[data-open-cookie-notice]");

  function readChoice() {
    try {
      const raw = localStorage.getItem(choiceKey);
      if (!raw) return null;
      const choice = JSON.parse(raw);
      if (!choice || !Number.isFinite(choice.savedAt) || Date.now() - choice.savedAt > choiceLifetimeMs) {
        localStorage.removeItem(choiceKey);
        return null;
      }
      return choice;
    } catch {
      return null;
    }
  }

  function saveChoice(preferences) {
    const choice = { necessary: true, preferences, savedAt: Date.now() };
    try { localStorage.setItem(choiceKey, JSON.stringify(choice)); } catch {}
    window.dispatchEvent(new CustomEvent("pm-cookie-choice-changed", { detail: choice }));
    if (notice) notice.hidden = true;
  }

  window.pmCookieConsent = {
    preferencesAllowed: () => readChoice()?.preferences === true
  };

  if (notice && !readChoice()) notice.hidden = false;
  acceptButtons.forEach((button) => button.addEventListener("click", () => saveChoice(true)));
  essentialButtons.forEach((button) => button.addEventListener("click", () => saveChoice(false)));
  settingsButtons.forEach((button) => button.addEventListener("click", () => {
    if (!notice) return;
    notice.hidden = false;
    notice.querySelector('[data-cookie-choice="preferences"]')?.focus();
  }));
})();

