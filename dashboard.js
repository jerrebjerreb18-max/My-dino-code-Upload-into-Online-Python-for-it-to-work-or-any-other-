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
  const sessionKey = "pm-dashboard-session";
  const DEFAULT_API_URL = ""; // Set the deployed backend's public HTTPS URL here so every moderator gets it automatically.
  let toastTimer;

  function preferencesAllowed() {
    return window.pmCookieConsent?.preferencesAllowed() === true;
  }

  function getSavedEndpoint() {
    try {
      const temporary = sessionStorage.getItem(storageKey);
      if (temporary) return temporary;
      return preferencesAllowed() ? localStorage.getItem(storageKey) || "" : "";
    } catch {
      return "";
    }
  }

  function saveEndpointPreference(value) {
    try {
      if (preferencesAllowed()) {
        localStorage.setItem(storageKey, value);
        sessionStorage.removeItem(storageKey);
      } else {
        sessionStorage.setItem(storageKey, value);
        localStorage.removeItem(storageKey);
      }
    } catch {
      // Keep the endpoint in the current field if browser storage is unavailable.
    }
  }

  window.addEventListener("pm-cookie-choice-changed", (event) => {
    try {
      const saved = localStorage.getItem(storageKey) || sessionStorage.getItem(storageKey);
      if (!saved) return;
      if (event.detail?.preferences) {
        localStorage.setItem(storageKey, saved);
        sessionStorage.removeItem(storageKey);
      } else {
        sessionStorage.setItem(storageKey, saved);
        localStorage.removeItem(storageKey);
      }
    } catch {
      // A storage restriction should not prevent the dashboard from opening.
    }
  });

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

    const panelLabels = { overview: "Overview", join: "Join with code", requests: "Member requests", players: "Players", moderation: "Moderation", server: "Server controls", shifts: "Shifts", logs: "Action logs", roles: "Role access", commands: "Command guide", settings: "Settings", help: "Help" };
    if (currentLabel) currentLabel.textContent = panelLabels[name] || name;
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

  const returnedHash = new URLSearchParams(window.location.hash.slice(1));
  const returnedSession = returnedHash.get("pm_session");
  if (returnedSession) {
    sessionStorage.setItem(sessionKey, returnedSession);
    const destination = returnedHash.get("panel") || "join";
    history.replaceState(null, "", `#${destination}`);
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

  const savedEndpoint = getSavedEndpoint() || DEFAULT_API_URL;
  if (endpointInput && savedEndpoint) endpointInput.value = savedEndpoint;
  if (endpointStatus && savedEndpoint) endpointStatus.textContent = "Saved backend endpoint loaded. Check the connection to confirm it is reachable.";

  function parseEndpoint() {
    const raw = endpointInput?.value.trim() || getSavedEndpoint() || DEFAULT_API_URL;
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

  async function apiRequest(path, options = {}) {
    const baseUrl = parseEndpoint();
    const headers = { Accept: "application/json", ...(options.headers || {}) };
    const session = sessionStorage.getItem(sessionKey);
    if (session) headers.Authorization = `Bearer ${session}`;
    if (options.body !== undefined) headers["Content-Type"] = "application/json";
    const response = await fetch(`${baseUrl}${path}`, {
      method: options.method || "GET",
      mode: "cors",
      credentials: "omit",
      cache: "no-store",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body)
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.message || result.error || `Backend returned HTTP ${response.status}.`);
    return result;
  }

  const joinForm = document.getElementById("join-form");
  const joinCodeInput = document.getElementById("join-code");
  const joinStatus = document.getElementById("join-status");
  if (joinCodeInput) joinCodeInput.addEventListener("input", () => {
    joinCodeInput.value = joinCodeInput.value.toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 20);
  });

  const discordLogin = document.getElementById("discord-login");
  if (discordLogin) discordLogin.addEventListener("click", () => {
    try {
      const baseUrl = parseEndpoint();
      const returnTo = `${window.location.origin}${window.location.pathname}#join`;
      const signInUrl = new URL(`${baseUrl}/auth/discord/start`);
      signInUrl.searchParams.set("return_to", returnTo);
      window.location.assign(signInUrl.toString());
    } catch (error) {
      const message = "Ask the owner to connect the moderator backend in Settings first.";
      const loginStatus = document.getElementById("discord-login-status");
      if (loginStatus) loginStatus.textContent = message;
      showToast(error.message || message);
    }
  });

  if (joinForm) joinForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const code = joinCodeInput?.value.trim() || "";
    if (!/^[A-Z0-9-]{3,20}$/.test(code)) {
      if (joinStatus) joinStatus.textContent = "Use 3–20 letters, numbers, or hyphens.";
      return;
    }
    if (!sessionStorage.getItem(sessionKey)) {
      if (joinStatus) joinStatus.textContent = "Continue with Discord first, then submit your code.";
      showToast("Sign in with Discord before requesting membership.");
      return;
    }
    const submitButton = joinForm.querySelector('[type="submit"]');
    submitButton.disabled = true;
    if (joinStatus) joinStatus.textContent = "Sending your request securely…";
    try {
      const result = await apiRequest("/api/membership/requests", { method: "POST", body: { code } });
      if (joinStatus) joinStatus.textContent = result.message || (result.status === "approved" ? "Approved. Staff access is active." : "Request sent. The owner will review it.");
      showToast(result.status === "approved" ? "Your staff access was approved." : "Membership request sent to the owner.");
    } catch (error) {
      if (joinStatus) joinStatus.textContent = error.message;
      showToast(error.message);
    } finally {
      submitButton.disabled = false;
    }
  });

  async function loadMembershipRequests() {
    const table = document.getElementById("join-requests-table");
    const message = document.getElementById("owner-code-message");
    if (!table) return;
    table.innerHTML = '<tr><td colspan="4"><div class="empty-state table-empty"><b>Loading requests…</b></div></td></tr>';
    try {
      const result = await apiRequest("/api/membership/requests");
      table.replaceChildren();
      const requests = Array.isArray(result.requests) ? result.requests : [];
      if (!requests.length) {
        const row = document.createElement("tr");
        row.innerHTML = '<td colspan="4"><div class="empty-state table-empty"><span class="empty-icon">✉</span><b>No pending requests</b><p>New join-code requests will appear here.</p></div></td>';
        table.append(row);
        return;
      }
      requests.forEach((request) => {
        const row = document.createElement("tr");
        const memberCell = document.createElement("td");
        memberCell.textContent = `${request.discord_name || "Discord member"} · ${request.discord_id || "ID unavailable"}`;
        const codeCell = document.createElement("td");
        codeCell.textContent = request.code_label || "Moderator invite";
        const dateCell = document.createElement("td");
        dateCell.textContent = request.created_at ? new Date(request.created_at).toLocaleString() : "—";
        const actionCell = document.createElement("td");
        actionCell.className = "request-actions";
        ["accept", "deny"].forEach((decision) => {
          const button = document.createElement("button");
          button.type = "button";
          button.className = `button ${decision === "accept" ? "button-primary" : "button-outline"}`;
          button.textContent = decision === "accept" ? "Accept" : "Deny";
          button.addEventListener("click", async () => {
            button.disabled = true;
            try {
              await apiRequest(`/api/membership/requests/${encodeURIComponent(request.id)}`, { method: "POST", body: { decision } });
              showToast(decision === "accept" ? "Member approved." : "Request denied.");
              loadMembershipRequests();
            } catch (error) {
              button.disabled = false;
              showToast(error.message);
            }
          });
          actionCell.append(button);
        });
        row.append(memberCell, codeCell, dateCell, actionCell);
        table.append(row);
      });
      if (message) message.textContent = "Requests are visible only to an owner-authorized Discord session.";
    } catch (error) {
      table.replaceChildren();
      const row = document.createElement("tr");
      const cell = document.createElement("td");
      cell.colSpan = 4;
      const state = document.createElement("div");
      state.className = "empty-state table-empty";
      const heading = document.createElement("b");
      heading.textContent = error.message;
      const detail = document.createElement("p");
      detail.textContent = "Sign in as the owner and check that the backend is configured.";
      state.append(heading, detail);
      cell.append(state);
      row.append(cell);
      table.append(row);
      if (message) message.textContent = "Owner access and backend connection are required to create or revoke codes.";
    }
  }

  const createCodeButton = document.getElementById("create-join-code");
  if (createCodeButton) createCodeButton.addEventListener("click", async () => {
    createCodeButton.disabled = true;
    try {
      const result = await apiRequest("/api/membership/codes", { method: "POST", body: { purpose: "moderator" } });
      const output = document.getElementById("generated-join-code");
      if (output) {
        output.textContent = result.code || "The backend did not return a code.";
        output.hidden = false;
      }
      document.getElementById("copy-join-code").disabled = !result.code;
      document.getElementById("revoke-join-code").disabled = false;
      document.getElementById("join-code-status").textContent = "Active invite";
      document.getElementById("owner-code-message").textContent = "Share this code privately. It is shown once; revoke it if it leaks.";
    } catch (error) {
      document.getElementById("owner-code-message").textContent = error.message;
      showToast(error.message);
    } finally {
      createCodeButton.disabled = false;
    }
  });

  const copyCodeButton = document.getElementById("copy-join-code");
  if (copyCodeButton) copyCodeButton.addEventListener("click", async () => {
    const code = document.getElementById("generated-join-code")?.textContent || "";
    try {
      await navigator.clipboard.writeText(code);
      showToast("Moderator code copied.");
    } catch {
      showToast("Select the code text and copy it manually.");
    }
  });

  const revokeCodeButton = document.getElementById("revoke-join-code");
  if (revokeCodeButton) revokeCodeButton.addEventListener("click", async () => {
    revokeCodeButton.disabled = true;
    try {
      await apiRequest("/api/membership/codes/revoke", { method: "POST", body: {} });
      const output = document.getElementById("generated-join-code");
      if (output) { output.textContent = "Invite revoked"; output.hidden = false; }
      document.getElementById("copy-join-code").disabled = true;
      document.getElementById("join-code-status").textContent = "No active invite";
      document.getElementById("owner-code-message").textContent = "The previous code can no longer be used.";
      showToast("Moderator invite revoked.");
    } catch (error) {
      revokeCodeButton.disabled = false;
      showToast(error.message);
    }
  });

  const refreshRequestsButton = document.getElementById("refresh-join-requests");
  if (refreshRequestsButton) refreshRequestsButton.addEventListener("click", loadMembershipRequests);
  const panelRequestsNav = navItems.find((item) => item.dataset.panelTarget === "requests");
  if (panelRequestsNav) panelRequestsNav.addEventListener("click", loadMembershipRequests);
  const panelJoinNav = navItems.find((item) => item.dataset.panelTarget === "join");
  if (panelJoinNav && sessionStorage.getItem(sessionKey) && joinStatus) joinStatus.textContent = "Discord session found. Enter the owner’s code to request membership.";
  if (initialPanel === "requests") loadMembershipRequests();

  const saveEndpoint = document.getElementById("save-endpoint");
  if (saveEndpoint) {
    saveEndpoint.addEventListener("click", () => {
      try {
        const url = parseEndpoint();
        saveEndpointPreference(url);
        if (endpointStatus) endpointStatus.textContent = preferencesAllowed()
          ? "Endpoint saved in this browser. No API key or token was saved."
          : "Endpoint saved for this browser session only. Accept preferences to keep it for later visits.";
        showToast(preferencesAllowed() ? "Backend preference saved." : "Backend URL saved for this session.");
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
        saveEndpointPreference(baseUrl);
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

