(() => {
  "use strict";

  const panels = [...document.querySelectorAll("[data-panel]")];
  const navItems = [...document.querySelectorAll("[data-panel-target]")];
  const sidebar = document.getElementById("sidebar");
  const menuButton = document.getElementById("mobile-menu");
  const currentLabel = document.getElementById("current-panel-label");
  const toast = document.getElementById("dashboard-toast");
  const endpointInput = document.getElementById("backend-url");
  const endpointStatus = document.getElementById("endpoint-status");
  const connectionBadge = document.getElementById("connection-badge");
  const storageKey = "pm-dashboard-backend-url";
  let toastTimer;

  function showToast(message) {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add("is-visible");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 3200);
  }

  function openPanel(name, updateHash = true) {
    const panel = panels.find((item) => item.dataset.panel === name);
    if (!panel) return;

    panels.forEach((item) => {
      const active = item === panel;
      item.hidden = !active;
      item.classList.toggle("is-visible", active);
      item.setAttribute("aria-hidden", String(!active));
    });

    navItems.forEach((item) => {
      const active = item.dataset.panelTarget === name;
      item.classList.toggle("is-active", active);
      if (active) item.setAttribute("aria-current", "page");
      else item.removeAttribute("aria-current");
    });

    const activeNav = navItems.find((item) => item.dataset.panelTarget === name);
    if (currentLabel && activeNav) currentLabel.textContent = activeNav.textContent.trim().replace(/\s+—$/, "");
    if (updateHash) history.replaceState(null, "", `#${name}`);
    if (sidebar) sidebar.classList.remove("is-open");
    if (menuButton) {
      menuButton.setAttribute("aria-expanded", "false");
      menuButton.setAttribute("aria-label", "Open dashboard menu");
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  navItems.forEach((item) => item.addEventListener("click", () => openPanel(item.dataset.panelTarget)));
  document.querySelectorAll("[data-open-panel]").forEach((item) => {
    item.addEventListener("click", () => openPanel(item.dataset.openPanel));
  });

  if (menuButton && sidebar) {
    menuButton.addEventListener("click", () => {
      const isOpen = sidebar.classList.toggle("is-open");
      menuButton.setAttribute("aria-expanded", String(isOpen));
      menuButton.setAttribute("aria-label", isOpen ? "Close dashboard menu" : "Open dashboard menu");
    });
    document.addEventListener("click", (event) => {
      if (!sidebar.classList.contains("is-open")) return;
      if (sidebar.contains(event.target) || menuButton.contains(event.target)) return;
      sidebar.classList.remove("is-open");
      menuButton.setAttribute("aria-expanded", "false");
      menuButton.setAttribute("aria-label", "Open dashboard menu");
    });
  }

  const initialPanel = window.location.hash.slice(1).replace(/^panel-/, "");
  if (panels.some((panel) => panel.dataset.panel === initialPanel)) openPanel(initialPanel, false);

  const previewAction = document.getElementById("preview-action");
  if (previewAction) {
    previewAction.addEventListener("click", () => {
      const action = document.getElementById("action-type")?.value || "action";
      const playerId = document.getElementById("action-player-id")?.value.trim() || "";
      const reason = document.getElementById("action-reason")?.value.trim() || "";
      if (!/^\d{1,20}$/.test(playerId)) {
        showToast("Enter a numeric Roblox user ID to preview the action.");
        document.getElementById("action-player-id")?.focus();
        return;
      }
      if (reason.length < 3) {
        showToast("Add a clear reason before previewing the action.");
        document.getElementById("action-reason")?.focus();
        return;
      }
      showToast(`${action[0].toUpperCase()}${action.slice(1)} preview ready for Roblox ID ${playerId}. It has not been sent.`);
    });
  }

  const actionForm = document.getElementById("action-form");
  if (actionForm) actionForm.addEventListener("submit", (event) => {
    event.preventDefault();
    showToast("Live moderation is locked until a secure bot backend is connected.");
  });

  const previewCommand = document.getElementById("preview-server-command");
  if (previewCommand) {
    previewCommand.addEventListener("click", () => {
      const command = document.getElementById("server-command")?.value.trim() || "";
      const output = document.getElementById("command-preview");
      if (!output) return;
      if (!command) {
        showToast("Enter a command to preview.");
        document.getElementById("server-command")?.focus();
        return;
      }
      if (command.length > 200) {
        showToast("Keep the command under 200 characters.");
        return;
      }
      output.textContent = `PREVIEW ONLY — not sent to ER:LC\n\n${command}`;
      output.hidden = false;
    });
  }

  const savedEndpoint = localStorage.getItem(storageKey) || "";
  if (endpointInput && savedEndpoint) endpointInput.value = savedEndpoint;
  if (endpointStatus && savedEndpoint) endpointStatus.textContent = "Endpoint saved on this device. Check the connection to confirm it is reachable.";

  function parseEndpoint() {
    const raw = endpointInput?.value.trim() || "";
    let url;
    try {
      url = new URL(raw);
    } catch {
      throw new Error("Enter a complete backend URL, including https://.");
    }
    if (url.protocol !== "https:") throw new Error("Use an HTTPS endpoint so traffic is encrypted.");
    if (url.username || url.password || url.search || url.hash) throw new Error("Remove credentials, query parameters, and fragments from the endpoint URL.");
    return url.toString().replace(/\/$/, "");
  }

  const saveEndpoint = document.getElementById("save-endpoint");
  if (saveEndpoint) {
    saveEndpoint.addEventListener("click", () => {
      try {
        const url = parseEndpoint();
        localStorage.setItem(storageKey, url);
        if (endpointStatus) endpointStatus.textContent = "Endpoint saved only in this browser. No API key or token was saved.";
        showToast("Backend URL saved on this device.");
      } catch (error) {
        if (endpointStatus) endpointStatus.textContent = error.message;
        showToast(error.message);
      }
    });
  }

  const testEndpoint = document.getElementById("test-endpoint");
  if (testEndpoint) {
    testEndpoint.addEventListener("click", async () => {
      let baseUrl;
      try {
        baseUrl = parseEndpoint();
      } catch (error) {
        if (endpointStatus) endpointStatus.textContent = error.message;
        showToast(error.message);
        return;
      }

      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 7000);
      testEndpoint.disabled = true;
      testEndpoint.textContent = "Checking…";
      if (endpointStatus) endpointStatus.textContent = "Checking the public health endpoint…";
      try {
        const response = await fetch(`${baseUrl}/health`, {
          method: "GET",
          mode: "cors",
          credentials: "omit",
          cache: "no-store",
          headers: { Accept: "application/json" },
          signal: controller.signal
        });
        if (!response.ok) throw new Error(`Health endpoint returned HTTP ${response.status}.`);
        localStorage.setItem(storageKey, baseUrl);
        if (endpointStatus) endpointStatus.textContent = "Health endpoint responded. This confirms reachability only; Discord sign-in, roles, and ER:LC actions still need backend routes.";
        if (connectionBadge) connectionBadge.innerHTML = "<i></i> BACKEND REACHABLE";
        showToast("Backend health check succeeded. Live dashboard data is not enabled yet.");
      } catch (error) {
        const message = error.name === "AbortError"
          ? "Health check timed out after 7 seconds."
          : error instanceof TypeError
            ? "Could not reach the health endpoint. Check the URL, HTTPS certificate, and CORS settings."
            : error.message;
        if (endpointStatus) endpointStatus.textContent = message;
        if (connectionBadge) connectionBadge.innerHTML = "<i></i> API NOT CONNECTED";
        showToast(message);
      } finally {
        window.clearTimeout(timeout);
        testEndpoint.disabled = false;
        testEndpoint.textContent = "Check connection";
      }
    });
  }

  const serverSwitch = document.querySelector(".server-switch");
  if (serverSwitch) serverSwitch.addEventListener("click", () => showToast("Only one ER:LC private server is configured in this dashboard."));
})();
