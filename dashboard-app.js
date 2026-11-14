(() => {
  const $ = (selector, root=document) => root.querySelector(selector);
  const $$ = (selector, root=document) => [...root.querySelectorAll(selector)];
  const toast = (message, type="") => {
    const node = $("#toast"); node.textContent = message; node.className = "toast show " + type;
    clearTimeout(toast.timer); toast.timer = setTimeout(() => node.className = "toast", 4200);
  };
  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  let sessionToken = "";
  let currentAccess = null;
  let turnstilePromise = null;
  const captchaTokens = { login: "", join: "", entry: "" };
  const captchaWidgets = { login: null, join: null, entry: null };
  const API_BASE_URL = String(window.PM_API_BASE_URL || "").trim().replace(/\/+$/, "");
  function apiBase() {
    if (!API_BASE_URL) throw new Error("This GitHub Pages dashboard needs a private API backend before Discord sign-in and ER:LC commands can work. GitHub Pages only serves the interface and cannot securely keep bot or server keys.");
    let parsed;
    try { parsed = new URL(API_BASE_URL); } catch { throw new Error("The backend URL in dashboard-config.js is invalid."); }
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash || (parsed.pathname !== "/" && parsed.pathname !== "")) throw new Error("Use the backend HTTPS origin only, without credentials or extra paths.");
    return parsed.origin;
  }
  async function request(path, token = "", method = "GET", body) {
    const headers = { Accept: "application/json" };
    if (token) headers.Authorization = "Bearer " + token;
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const response = await fetch(apiBase() + path, { method, mode: "cors", credentials: "omit", cache: "no-store", headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || result.message || "Backend returned HTTP " + response.status + ".");
    return result;
  }
  function loadTurnstile() {
    if (window.turnstile) return Promise.resolve(window.turnstile);
    if (turnstilePromise) return turnstilePromise;
    turnstilePromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = false;
      script.onload = () => window.turnstile ? resolve(window.turnstile) : reject(new Error("Cloudflare verification did not load."));
      script.onerror = () => {
        script.remove();
        turnstilePromise = null;
        reject(new Error("Cloudflare verification could not load. Check your network or browser extensions."));
      };
      document.head.append(script);
    });
    return turnstilePromise;
  }
  function captchaMount(kind) {
    return $(kind === "login" ? "#loginCaptchaMount" : kind === "join" ? "#joinCaptchaMount" : "#entryCaptchaMount");
  }
  function captchaButton(kind) {
    return $(kind === "login" ? "#discordSignIn" : kind === "join" ? "#submitJoinCode" : "#entryContinueButton");
  }
  function captchaMessage(kind, message, error=false) {
    if (kind === "entry") {
      const node = $("#entryStatus");
      node.textContent = message;
      node.classList.toggle("gate-error", error);
    } else {
      gateMessage(message, error);
    }
  }
  async function renderCaptcha(kind) {
    const mount = captchaMount(kind);
    const button = captchaButton(kind);
    if (!mount || !button) throw new Error("The security check is unavailable on this page.");
    const config = await request("/security/config");
    if (!config.enabled || !config.siteKey) throw new Error("Cloudflare bot verification is not configured yet. The site owner must finish Turnstile setup before new sign-ins or moderator requests can continue.");
    const turnstile = await loadTurnstile();
    mount.hidden = false;
    if (captchaWidgets[kind] !== null) {
      captchaTokens[kind] = "";
      button.disabled = true;
      turnstile.reset(captchaWidgets[kind]);
      return;
    }
    captchaWidgets[kind] = turnstile.render(mount, {
      sitekey: config.siteKey,
      action: kind === "login" ? "dashboard_login" : kind === "join" ? "moderator_join" : "dashboard_entry",
      theme: "dark",
      callback: token => {
        captchaTokens[kind] = token;
        button.disabled = false;
        if (kind === "entry") button.textContent = "Continue to ER:LC dashboard";
        if (kind === "entry") captchaMessage("entry", "Check complete. Continue to the staff dashboard.");
      },
      "expired-callback": () => { captchaTokens[kind] = ""; button.disabled = true; },
      "error-callback": () => {
        captchaTokens[kind] = "";
        button.disabled = true;
        captchaMessage(kind, "Cloudflare verification failed to load. Please retry.", true);
      },
      "timeout-callback": () => { captchaTokens[kind] = ""; button.disabled = true; },
    });
  }
  function resetCaptcha(kind) {
    captchaTokens[kind] = "";
    const button = captchaButton(kind);
    if (button) button.disabled = true;
    if (captchaWidgets[kind] !== null && window.turnstile) window.turnstile.reset(captchaWidgets[kind]);
  }
  const callServer = async (method, ...args) => {
    const token = String(args[0] || "");
    if (method === "getDashboardAccess") return request("/api/access", token);
    if (method === "submitModeratorJoinCode") return request("/api/membership/requests", token, "POST", { code: args[1], turnstile_token: args[2] });
    if (method === "logoutDashboard") return request("/api/logout", token, "POST", {});
    if (method === "listModeratorRequests") return request("/api/membership/requests", token);
    if (method === "createModeratorJoinCode") return request("/api/membership/codes", token, "POST", { purpose: "moderator" });
    if (method === "revokeModeratorJoinCode") return request("/api/membership/codes", token, "DELETE", {});
    if (method === "decideModeratorRequest") return request("/api/membership/requests/" + encodeURIComponent(args[1]), token, "POST", { decision: args[2] });
    if (method === "revokeModeratorAccess") return request("/api/membership/users/" + encodeURIComponent(args[1]), token, "DELETE", {});
    if (method === "connectErlcServer") return request("/api/erlc/key", token, "POST", { server_key: args[1] });
    if (method === "getHealth") return request("/api/health", token);
    if (method === "getPlayers") return request("/api/players", token);
    if (method === "getBans") return request("/api/bans", token);
    if (method === "checkBan") return request("/api/check-ban?roblox_id=" + encodeURIComponent(args[1]), token);
    if (method === "runCommand") return request("/api/command", token, "POST", args[1] || {});
    throw new Error("Unknown dashboard request.");
  };
  const api = async (url, options={}) => {
    if (url === "/api/health") return callServer("getHealth", sessionToken);
    if (url === "/api/players") return callServer("getPlayers", sessionToken);
    if (url === "/api/bans") return callServer("getBans", sessionToken);
    if (url.startsWith("/api/check-ban?")) {
      const id = new URLSearchParams(url.split("?")[1]).get("roblox_id") || "";
      return callServer("checkBan", sessionToken, id);
    }
    if (url === "/api/command" && options.method === "POST") return callServer("runCommand", sessionToken, JSON.parse(options.body || "{}"));
    throw new Error("Unknown dashboard request.");
  };
  const commands = [
    {cmd:"/help",desc:"Open the bot help menu and browse permissions.",group:"General",access:"Everyone",page:"commands"},
    {cmd:"/server connect",desc:"Connect this server's ER:LC private-server API key.",group:"ER:LC",access:"Administrator",page:"overview"},
    {cmd:"/server status",desc:"View ER:LC server status and capacity.",group:"ER:LC",access:"Everyone",page:"server"},
    {cmd:"/server players",desc:"View the current live player roster.",group:"ER:LC",access:"Everyone",page:"server"},
    {cmd:"/server bans",desc:"Load this server's private ban list.",group:"ER:LC",access:"Moderator",page:"bans"},
    {cmd:"/server check roblox_id",desc:"Check a Roblox ID against active server bans.",group:"ER:LC",access:"Moderator",page:"moderation"},
    {cmd:"/server kick roblox_id reason",desc:"Kick an online player after review and confirmation.",group:"ER:LC",access:"Moderator",page:"moderation"},
    {cmd:"/server ban roblox_id reason",desc:"Ban a Roblox user after senior confirmation.",group:"ER:LC",access:"Senior staff",page:"moderation"},
    {cmd:"/server unban roblox_id reason",desc:"Remove a server ban after senior confirmation.",group:"ER:LC",access:"Senior staff",page:"moderation"},
    {cmd:"/shift start",desc:"Start a staff shift timer.",group:"Staff activity",access:"Moderator",page:"shifts"},
    {cmd:"/shift end",desc:"End your active staff shift.",group:"Staff activity",access:"Moderator",page:"shifts"},
    {cmd:"/shift status",desc:"Check the current shift timer.",group:"Staff activity",access:"Moderator",page:"shifts"},
    {cmd:"/shift summary",desc:"Review completed shifts from the last 30 days.",group:"Staff activity",access:"Moderator",page:"shifts"},
    {cmd:"/access add role access",desc:"Give an existing Discord role moderator or senior access.",group:"Permissions",access:"Administrator",page:"access"},
    {cmd:"/access remove role access",desc:"Remove a role from a command access level.",group:"Permissions",access:"Administrator",page:"access"},
    {cmd:"/access list",desc:"Review roles allowed to use staff commands.",group:"Permissions",access:"Administrator",page:"access"},
    {cmd:"/setup community",desc:"Choose the staff role and publish support and verify panels.",group:"Setup",access:"Administrator",page:"setup"},
    {cmd:"/setup applications",desc:"Publish the staff information and application panel.",group:"Setup",access:"Administrator",page:"setup"},
    {cmd:"/roles add role",desc:"Allow members to choose an existing server role.",group:"Roles",access:"Administrator",page:"setup"},
    {cmd:"/roles pick",desc:"Choose your server's enabled self-service roles.",group:"Roles",access:"Everyone",page:"setup"},
  ];
  const state={players:[],bans:[],pending:null};
  const pageTitle=name=>$("#page-"+name)?.dataset.title || name;
  function showPage(name) {
    if (!$("#page-"+name)) name="overview";
    if(currentAccess&&((name==="moderation"||name==="bans")&&!currentAccess.canModerate)){name="overview";toast("This page requires the Discord Staff role.","error");}
    if(currentAccess&&name==="staff-access"&&!currentAccess.isOwner){name="overview";toast("Only the server owner can manage staff access.","error");}
    if(currentAccess&&name==="connection"&&!currentAccess.isOwner){name="overview";toast("Only the Discord server owner can connect the ER:LC API.","error");}
    $$(".page").forEach(node=>node.classList.toggle("active",node.id==="page-"+name));
    $$(".nav-item").forEach(node=>node.classList.toggle("active",node.dataset.page===name));
    $("#crumbName").textContent=pageTitle(name);
    history.replaceState(null,"","#"+(name==="overview"?"dashboard":name));
    $("#sidebar").classList.remove("open");
    if(name==="server") loadServer(); if(name==="bans") loadBans(); if(name==="staff-access") loadOwnerRequests();
  }
  const fmt=value=>Number.isFinite(Number(value))?String(value):"—";
  const now=()=>new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});
  function record(message,ok=true) {
    let rows=[]; try{rows=JSON.parse(sessionStorage.getItem("pm_erlc_activity")||"[]");}catch{}
    rows.unshift({message,at:now(),ok}); sessionStorage.setItem("pm_erlc_activity",JSON.stringify(rows.slice(0,8))); renderActivity();
  }
  function renderActivity() {
    let rows=[]; try{rows=JSON.parse(sessionStorage.getItem("pm_erlc_activity")||"[]");}catch{}
    const host=$("#activityFeed");
    if(!rows.length){host.innerHTML='<div class="empty"><strong>No actions this session</strong>Confirmed web actions will appear here.</div>';return;}
    host.innerHTML=rows.map(r=>'<div class="feed-row"><i class="status-dot '+(r.ok?"ok":"bad")+'"></i><span>'+esc(r.message)+'<small>'+esc(r.at)+' · this browser</small></span></div>').join("");
  }
  function setConnected(connected,label) {
    const pill=$("#connectionPill"); pill.classList.toggle("online",connected); pill.classList.toggle("offline",!connected);
    $("#connectionLabel").textContent=label||(connected?"ER:LC connected":"API unavailable");
    $("#apiState").textContent=connected?"CONNECTED":"OFFLINE"; $("#apiState").classList.toggle("online",connected);
    $("#sideServerState").textContent=connected?"ER:LC connected":"API unavailable";
    $("#statStatus").textContent=connected?"Online":"Offline"; $("#statStatus").className="stat-value status-value "+(connected?"online":"offline");
    $("#serverPageStatus").textContent=connected?"Online":"Offline"; $("#serverPageStatus").className="stat-value status-value "+(connected?"online":"offline");
  }
  async function loadHealth() {
    try {
      const data=await api("/api/health"),server=data.server||{}; setConnected(true,"ER:LC connected");
      $("#overviewServerName").textContent=server.name||"ER:LC private server";
      $("#overviewPlayers").textContent=fmt(server.players); $("#overviewCapacity").textContent=fmt(server.maxPlayers); $("#overviewUpdated").textContent=now();
      $("#statPlayers").textContent=fmt(server.players); $("#serverPageName").textContent=server.name||"ER:LC private server";
      $("#serverPagePlayers").textContent=fmt(server.players); $("#serverPageCapacity").textContent=fmt(server.maxPlayers); $("#serverPageUpdated").textContent=now();
      $("#navPlayers").textContent=fmt(server.players); return true;
    } catch(error) {
      setConnected(false,"ER:LC offline"); $("#overviewServerName").textContent="ER:LC connection unavailable";
      $("#statPlayers").textContent="—"; $("#overviewPlayers").textContent="—"; $("#overviewCapacity").textContent="—";
      $("#sideServerState").textContent=error.message.includes("Sign in")?"Sign in required":"Check server key";
      return false;
    }
  }
  function playersHtml(players,limit) {
    const list=limit?players.slice(0,limit):players;
    if(!list.length)return '<div class="empty"><strong>No players found</strong>The server roster is currently empty.</div>';
    return '<div class="table-wrap"><table><thead><tr><th>Player</th><th>Roblox ID</th><th>Team</th><th>Permission</th></tr></thead><tbody>'+list.map(p=>'<tr><td class="player-name">'+esc(p.name)+'</td><td class="mono">'+esc(p.id)+'</td><td>'+esc(p.team||"—")+'</td><td>'+esc(p.permission||"—")+'</td></tr>').join("")+'</tbody></table></div>';
  }
  async function loadServer() {
    if(!await loadHealth())return;
    try {const data=await api("/api/players");state.players=data.players||[];$("#playersTable").innerHTML=playersHtml(state.players);$("#overviewRoster").innerHTML=playersHtml(state.players,5);$("#rosterCount").textContent=state.players.length+" player"+(state.players.length===1?"":"s");}
    catch(error){$("#playersTable").innerHTML='<div class="empty"><strong>Could not load roster</strong>'+esc(error.message)+'</div>';}
  }
  function bansHtml(bans) {
    if(!bans.length)return '<div class="empty"><strong>No ban entries returned</strong>The API ban list is empty.</div>';
    return '<div class="table-wrap"><table><thead><tr><th>Player</th><th>Roblox ID</th><th>Action</th></tr></thead><tbody>'+bans.map(b=>'<tr><td class="player-name">'+esc(b.name)+'</td><td class="mono">'+esc(b.id)+'</td><td><button class="copy" data-copy="/erlc unban '+esc(b.id)+' reason">Copy unban command</button></td></tr>').join("")+'</tbody></table></div>';
  }
  function applyBanSearch(){const q=$("#banSearch").value.toLowerCase();$$("#bansTable tbody tr").forEach(row=>row.hidden=!row.textContent.toLowerCase().includes(q));}
  async function loadBans() {
    try{const data=await api("/api/bans");state.bans=data.bans||[];$("#bansTable").innerHTML=bansHtml(state.bans);$("#banCount").textContent=state.bans.length+" record"+(state.bans.length===1?"":"s");$("#statBans").textContent=String(state.bans.length);applyBanSearch();}
    catch(error){$("#bansTable").innerHTML='<div class="empty"><strong>Could not load ban list</strong>'+esc(error.message)+'</div>';$("#statBans").textContent="—";}
  }
  function openPageForCommand(cmd) {
    const item=commands.find(c=>c.cmd===cmd); if(!item)return;
    showPage(item.page);
    if(cmd.includes("check-ban"))$("#lookup-id").focus();
    else if(cmd.includes("kick")||cmd.includes("ban")||cmd.includes("unban"))$("[data-action-type='"+cmd.split(" ")[1]+"'] input[name='roblox_id']")?.focus();
    else if(item.group!=="ER:LC")toast("Copy the slash command and run it in Discord; the bot database bridge is not connected yet.");
  }
  function renderLibrary(query="") {
    const filtered=commands.filter(c=>(c.cmd+" "+c.desc+" "+c.group+" "+c.access).toLowerCase().includes(query.toLowerCase()));
    $("#commandLibrary").innerHTML=filtered.map(c=>'<article class="command-card"><div class="command-head"><code class="command-code">'+esc(c.cmd)+'</code><span class="command-group">'+esc(c.group)+'</span></div><p>'+esc(c.desc)+'</p><div class="command-meta"><span class="pill '+(c.group==="ER:LC"?"live":"discord")+'">'+esc(c.access)+'</span><button class="btn small" data-open-command="'+esc(c.cmd)+'">Open</button></div></article>').join("")||'<div class="empty">No command matches that search.</div>';
  }
  const commandTile=(cmd,desc,access)=>'<article class="action-tile"><div class="tile-top"><span class="tile-icon">⌘</span><span class="pill discord">'+esc(access)+'</span></div><div class="tile-title"><code>'+esc(cmd)+'</code></div><div class="tile-desc">'+esc(desc)+'</div><div class="tile-footer"><button class="copy" data-copy="'+esc(cmd)+'">Copy command</button><span class="pill discord">Discord bot</span></div></article>';
  $("#shiftCommands").innerHTML='<article class="card form-card"><h3>Shift timer</h3><p>Choose the Discord member whose shift is being managed.</p><div class="field"><label>Discord user ID</label><input inputmode="numeric" placeholder="Member ID"></div><div class="bridge-actions"><button class="btn" disabled title="Needs the Discord bot bridge">Start shift</button><button class="btn" disabled title="Needs the Discord bot bridge">End shift</button></div></article><article class="card form-card"><h3>Shift reports</h3><p>Check an active timer or completed time for a member.</p><div class="field"><label>Discord user ID</label><input inputmode="numeric" placeholder="Member ID"></div><div class="bridge-actions"><button class="btn" disabled title="Needs the Discord bot bridge">View status</button><button class="btn" disabled title="Needs the Discord bot bridge">View summary</button></div></article>';
  $("#roleCommands").innerHTML='<article class="card form-card"><h3>Add command access</h3><p>Choose an existing Discord role and access tier.</p><div class="form-grid"><div class="field full"><label>Role ID</label><input inputmode="numeric" placeholder="Existing role ID"></div><div class="field full"><label>Access tier</label><select><option>Moderator commands</option><option>Senior moderation (ban/unban)</option></select></div><div class="field full bridge-actions"><button class="btn primary" disabled title="Needs the Discord bot bridge">Add role</button><button class="btn" disabled title="Needs the Discord bot bridge">Remove role</button></div></div></article><article class="card form-card"><h3>Current access</h3><p>View the roles currently allowed to use staff commands.</p><div class="empty"><strong>Live role list needs the bot bridge</strong>The bot’s role configuration remains in its local database.</div><button class="btn" disabled title="Needs the Discord bot bridge">Load roles</button></article>';
  $("#setupCommands").innerHTML='<article class="card form-card"><h3>Community setup</h3><p>Configure the staff role and support/verification panels.</p><div class="form-grid"><div class="field full"><label>Staff role ID</label><input inputmode="numeric" placeholder="Discord role ID"></div><div class="field"><label>Support channel ID</label><input inputmode="numeric" placeholder="Channel ID"></div><div class="field"><label>Verification channel ID</label><input inputmode="numeric" placeholder="Channel ID"></div><div class="field full"><button class="btn" disabled title="Needs the Discord bot bridge">Publish panels</button></div></div></article><article class="card form-card"><h3>Role panels</h3><p>Publish color roles and notification pings.</p><div class="field"><label>Channel ID</label><input inputmode="numeric" placeholder="Discord channel ID"></div><div class="bridge-actions"><button class="btn" disabled title="Needs the Discord bot bridge">Publish role panels</button></div></article><article class="card form-card"><h3>Staff applications</h3><p>Publish the application panel in a selected channel.</p><div class="field"><label>Channel ID <span class="muted">(optional)</span></label><input inputmode="numeric" placeholder="Use configured channel"></div><div class="bridge-actions"><button class="btn" disabled title="Needs the Discord bot bridge">Publish application panel</button></div></article>';
  renderLibrary(); renderActivity();

  let pending=null;
  const modal=$("#actionModal");
  const openModal=data=>{pending=data;$("#modalTitle").textContent="Confirm "+data.action;$("#modalSummary").innerHTML="<b>Action:</b> "+esc(data.action)+"<br><b>Roblox ID:</b> "+esc(data.roblox_id)+"<br><b>Reason:</b> "+esc(data.reason);modal.classList.add("open");$("#confirmAction").focus();};
  const closeModal=()=>{modal.classList.remove("open");pending=null;};
  $("#cancelAction").addEventListener("click",closeModal); modal.addEventListener("click",e=>{if(e.target===modal)closeModal();}); document.addEventListener("keydown",e=>{if(e.key==="Escape")closeModal();});
  $("#confirmAction").addEventListener("click",async()=>{
    if(!pending)return;const data=pending;$("#confirmAction").disabled=true;$("#confirmAction").textContent="Sending…";
    try{const result=await api("/api/command",{method:"POST",body:JSON.stringify({...data,confirmation:true,senior_ack:data.senior_ack===true})});record(result.message,true);toast(result.message,"success");closeModal();if(data.action==="kick")await loadServer();if(data.action==="ban"||data.action==="unban")await loadBans();}
    catch(error){record(data.action+" "+data.roblox_id+" failed: "+error.message,false);toast(error.message,"error");}
    finally{$("#confirmAction").disabled=false;$("#confirmAction").textContent="Confirm and send";}
  });
  $$("[data-page]").forEach(node=>node.addEventListener("click",()=>showPage(node.dataset.page)));
  $("#menuButton").addEventListener("click",()=>$("#sidebar").classList.toggle("open"));
  async function refresh(){const connected=await loadHealth();if(connected){const jobs=[loadServer()];if(currentAccess&&currentAccess.canModerate)jobs.push(loadBans());await Promise.all(jobs);toast("Server data refreshed.","success");}else toast("ER:LC API unavailable. No command was sent.","error");}
  $("#refreshButton").addEventListener("click",refresh);
  $$("[data-action='connect']").forEach(node=>node.addEventListener("click",async()=>{node.disabled=true;try{if(await loadHealth()){toast("ER:LC API connection is active.","success");await loadServer();}else toast("Could not connect. Check the private-server key.","error");}finally{node.disabled=false;}}));
  $$("[data-action='load-bans']").forEach(node=>node.addEventListener("click",loadBans));
  $$("[data-moderation-form]").forEach(form=>form.addEventListener("submit",event=>{event.preventDefault();const values=new FormData(form);const senior=Boolean(values.get("senior_ack"));if((form.dataset.actionType==="ban"||form.dataset.actionType==="unban")&&!senior)return toast("Confirm senior moderation authority before proceeding.","error");openModal({action:form.dataset.actionType,roblox_id:String(values.get("roblox_id")||"").trim(),reason:String(values.get("reason")||"").trim(),senior_ack:senior});}));
  $("[data-lookup-form]").addEventListener("submit",async event=>{event.preventDefault();const id=$("#lookup-id").value.trim(),box=$("#lookupResult");box.innerHTML='<p class="muted result-line">Checking live ban list…</p>';try{const result=await api("/api/check-ban?roblox_id="+encodeURIComponent(id));box.innerHTML='<div class="tag '+(result.banned?"red":"green")+' result-line">'+(result.banned?"BANNED":"NOT BANNED")+'</div><p class="result-copy">'+esc(result.message)+'</p>';record("Checked ban status for "+id,true);}catch(error){box.innerHTML='<p class="result-copy error-text">'+esc(error.message)+'</p>';}});
  $("#banSearch").addEventListener("input",applyBanSearch); $("#commandSearch").addEventListener("input",event=>renderLibrary(event.target.value));
  document.addEventListener("click",async event=>{const opener=event.target.closest("[data-open-command]");if(opener){openPageForCommand(opener.dataset.openCommand);return;}const copy=event.target.closest("[data-copy]");if(copy){try{await navigator.clipboard.writeText(copy.dataset.copy);toast("Copied "+copy.dataset.copy,"success");}catch{toast(copy.dataset.copy);}}});
  function gateMessage(message,error=false){const node=$("#gateStatus");node.textContent=message;node.classList.toggle("gate-error",error);}
  function entryMessage(message,error=false){const node=$("#entryStatus");node.textContent=message;node.classList.toggle("gate-error",error);}
  async function prepareSignIn(){
    const button=$("#discordSignIn");
    button.disabled=true;button.textContent="Loading security check…";
    try{await renderCaptcha("login");button.textContent="Verify to continue with Discord";}
    catch(error){button.textContent="Secure sign-in unavailable";gateMessage(error.message,true);}
  }
  $("#discordSignIn").addEventListener("click",async()=>{
    const button=$("#discordSignIn"),token=captchaTokens.login;
    if(!token){gateMessage("Complete the Cloudflare check before continuing.",true);return;}
    button.disabled=true;button.textContent="Starting secure sign-in…";gateMessage("Verifying the security check…");
    try{
      const returnTo=window.location.origin+window.location.pathname;
      const result=await request("/auth/discord/url","","POST",{return_to:returnTo,turnstile_token:token});
      resetCaptcha("login");
      sessionStorage.setItem("pm_login_flow_started","1");
      window.location.assign(result.url);
    }catch(error){resetCaptcha("login");button.textContent="Verify to continue with Discord";gateMessage(error.message,true);}
  });
  function displayGate(access,errorMessage=""){
    $("#siteEntryGate").hidden=true;$("#dashboardApp").hidden=true;$("#accessGate").hidden=false;
    $("#gateSignOut").hidden=!sessionToken;$("#discordSignIn").hidden=Boolean(sessionToken);
    $("#refreshAccess").hidden=!sessionToken;
    if(errorMessage){$("#gateTitle").textContent="Sign-in needs attention";gateMessage(errorMessage,true);$("#gateJoinForm").hidden=true;return;}
    if(!sessionToken){$("#gateTitle").textContent="Sign in to continue";gateMessage("Sign in with Discord to check your server membership.");$("#gateJoinForm").hidden=true;$("#joinCaptchaMount").hidden=true;$("#loginCaptchaMount").hidden=false;return;}
    if(access.status==="pending"){$("#gateTitle").textContent="Request waiting for review";gateMessage("Your join request is with the server owner. Check again after they review it.");$("#gateJoinForm").hidden=true;$("#joinCaptchaMount").hidden=true;$("#loginCaptchaMount").hidden=true;return;}
    $("#gateTitle").textContent="Enter your moderator code";
    gateMessage("Signed in as "+access.user.name+". Enter the code shared by the server owner; access still needs owner approval.");
    $("#gateJoinForm").hidden=false;$("#loginCaptchaMount").hidden=true;$("#joinCaptchaMount").hidden=false;
    renderCaptcha("join").catch(error=>gateMessage(error.message,true));
  }
  async function loadDashboardAccess(){
    if(!sessionToken){displayGate(null);prepareSignIn();return;}
    try{
      currentAccess=await callServer("getDashboardAccess",sessionToken);
      if(!currentAccess.canView){displayGate(currentAccess);$("#discordSignIn").hidden=true;return;}
      $("#siteEntryGate").hidden=true;$("#accessGate").hidden=true;$("#dashboardApp").hidden=false;
      $("#currentUserName").textContent=currentAccess.user.name;$("#currentUserRole").textContent=currentAccess.isOwner?"Server owner":(currentAccess.canSenior?"HR moderator":(currentAccess.canModerate?"Staff moderator":"Approved · staff role needed"));
      $("#userAvatar").textContent=(currentAccess.user.name||"PM").slice(0,2).toUpperCase();
      $("#staffAccessNav").hidden=!currentAccess.isOwner;
      $("#serverConnectionNav").hidden=!currentAccess.isOwner;
      $("#ownerConnectButton").hidden=!currentAccess.isOwner;
      $$("[data-page='moderation'],[data-page='bans']").forEach(node=>node.hidden=!currentAccess.canModerate);
      $("#page-moderation").querySelectorAll("[data-action-type='ban'],[data-action-type='unban']").forEach(node=>node.hidden=!currentAccess.canSenior);
      if(!currentAccess.canModerate)toast("You have dashboard access. Add the configured Discord Staff role to use moderation tools.","error");
      const wanted=location.hash.replace(/^#\/?/,"");
      const route=wanted===""||wanted==="dashboard"||wanted==="join"?"overview":wanted;
      showPage((route==="staff-access"&&!currentAccess.isOwner)||(route==="connection"&&!currentAccess.isOwner)||(route==="moderation"&&!currentAccess.canModerate)||(route==="bans"&&!currentAccess.canModerate)?"overview":route);
      loadHealth().then(connected=>{if(connected){loadServer();if(currentAccess.canModerate)loadBans();}});
    }catch(error){sessionStorage.removeItem("pm_discord_session");sessionToken="";currentAccess=null;displayGate(null,error.message);prepareSignIn();}
  }
  function showEntryGate(){
    $("#dashboardApp").hidden=true;
    $("#accessGate").hidden=true;
    $("#siteEntryGate").hidden=false;
    const button=$("#entryContinueButton");
    button.disabled=true;
    button.textContent="Preparing security check…";
    entryMessage("Complete the bot check each time you open staff or ER:LC dashboard access.");
    renderCaptcha("entry").then(()=>{
      if(!captchaTokens.entry)button.textContent="Complete the check to continue";
    }).catch(error=>{
      button.textContent="Verification unavailable";
      entryMessage(error.message,true);
    });
  }
  async function initializeAccess(){
    const fragment=new URLSearchParams(location.hash.replace(/^#/, ""));
    const returned=fragment.get("pm_session");
    const loginFlow=Boolean(returned&&sessionStorage.getItem("pm_login_flow_started")==="1");
    sessionStorage.removeItem("pm_login_flow_started");
    if(returned){sessionToken=returned;sessionStorage.setItem("pm_discord_session",sessionToken);history.replaceState(null,"",location.pathname+location.search);}
    else sessionToken=sessionStorage.getItem("pm_discord_session")||"";
    if(sessionToken&&!loginFlow){showEntryGate();return;}
    await loadDashboardAccess();
  }
  $("#entryContinueButton").addEventListener("click",async()=>{
    const button=$("#entryContinueButton"),token=captchaTokens.entry;
    if(!token){entryMessage("Complete the Cloudflare check before continuing.",true);return;}
    button.disabled=true;button.textContent="Checking…";entryMessage("Verifying the security check…");
    try{
      await request("/security/entry","","POST",{turnstile_token:token});
      resetCaptcha("entry");
      $("#siteEntryGate").hidden=true;
      await loadDashboardAccess();
    }catch(error){
      resetCaptcha("entry");
      button.textContent="Complete the check to continue";
      entryMessage(error.message,true);
    }
  });
  $("#submitJoinCode").addEventListener("click",async()=>{
    const button=$("#submitJoinCode"),code=$("#joinCodeInput").value.trim(),captcha=captchaTokens.join;if(!code)return gateMessage("Enter the join code from the server owner.",true);if(!captcha)return gateMessage("Complete the Cloudflare check before requesting access.",true);
    button.disabled=true;gateMessage("Sending your request…");
    try{const result=await callServer("submitModeratorJoinCode",sessionToken,code,captcha);resetCaptcha("join");gateMessage(result.message);$("#gateTitle").textContent=result.status==="approved"?"Access approved":"Request waiting for review";$("#gateJoinForm").hidden=true;}
    catch(error){resetCaptcha("join");gateMessage(error.message,true);}
  });
  $("#joinCodeInput").addEventListener("keydown",event=>{if(event.key==="Enter")$("#submitJoinCode").click();});
  $("#refreshAccess").addEventListener("click",loadDashboardAccess);
  async function signOut(){const token=sessionToken;sessionStorage.removeItem("pm_login_flow_started");sessionStorage.removeItem("pm_discord_session");sessionToken="";currentAccess=null;try{if(token)await callServer("logoutDashboard",token);}catch{}location.hash="";location.reload();}
  $("#gateSignOut").addEventListener("click",signOut);$("#signOutButton").addEventListener("click",signOut);
  async function loadOwnerRequests(){
    if(!currentAccess||!currentAccess.isOwner)return;
    $("#pendingRequests").innerHTML='<div class="empty">Loading requests…</div>';$("#approvedMembers").innerHTML='<div class="empty">Loading approved moderators…</div>';
    try{
      const data=await callServer("listModeratorRequests",sessionToken),requests=data.requests||[],approved=data.approved||[];
      $("#requestCount").textContent=String(requests.length)+" waiting";
      $("#pendingRequests").innerHTML=requests.length?requests.map(row=>'<div class="member-row"><span><b>'+esc(row.name)+'</b><small>Discord ID '+esc(row.userId)+' · requested '+new Date(row.requestedAt).toLocaleString()+'</small></span><span class="member-buttons"><button class="btn primary small" data-review="approve" data-user="'+esc(row.userId)+'">Approve</button><button class="btn small" data-review="deny" data-user="'+esc(row.userId)+'">Deny</button></span></div>').join(""):'<div class="empty"><strong>No pending requests</strong>New code requests will appear here.</div>';
      $("#approvedMembers").innerHTML=approved.length?approved.map(row=>'<div class="member-row"><span><b>'+esc(row.name)+'</b><small>Discord ID '+esc(row.userId)+' · approved '+new Date(row.approvedAt).toLocaleDateString()+'</small></span><button class="btn danger small" data-revoke-user="'+esc(row.userId)+'">Revoke access</button></div>').join(""):'<div class="empty"><strong>No approved moderators</strong>Approving a pending request adds them here.</div>';
    }catch(error){$("#pendingRequests").innerHTML='<div class="empty gate-error">'+esc(error.message)+'</div>';$("#approvedMembers").innerHTML='';}
  }
  $("#refreshRequests").addEventListener("click",loadOwnerRequests);
  $("#createJoinCode").addEventListener("click",async event=>{
    const button=event.currentTarget;button.disabled=true;
    try{const data=await callServer("createModeratorJoinCode",sessionToken);$("#activeCode").innerHTML='<div class="owner-code">'+esc(data.code)+'</div><small>Expires '+new Date(data.expiresAt).toLocaleString()+'. Copy it now; it will not be shown again.</small><div class="gate-actions"><button class="btn small" id="copyNewCode" type="button">Copy code</button></div>';$("#copyNewCode").addEventListener("click",async()=>{try{await navigator.clipboard.writeText(data.code);toast("Join code copied.","success");}catch{toast("Join code: "+data.code);}});toast("Join code created. Share it privately.","success");}
    catch(error){toast(error.message,"error");}finally{button.disabled=false;}
  });
  $("#revokeJoinCode").addEventListener("click",async()=>{try{await callServer("revokeModeratorJoinCode",sessionToken);$("#activeCode").textContent="Join code revoked.";toast("Join code revoked.","success");}catch(error){toast(error.message,"error");}});
  document.addEventListener("click",async event=>{
    const review=event.target.closest("[data-review]");
    if(review){review.disabled=true;try{await callServer("decideModeratorRequest",sessionToken,review.dataset.user,review.dataset.review);toast("Request "+review.dataset.review+"d.","success");await loadOwnerRequests();}catch(error){toast(error.message,"error");review.disabled=false;}return;}
    const revoke=event.target.closest("[data-revoke-user]");
    if(revoke){revoke.disabled=true;try{await callServer("revokeModeratorAccess",sessionToken,revoke.dataset.revokeUser);toast("Moderator access revoked.","success");await loadOwnerRequests();}catch(error){toast(error.message,"error");revoke.disabled=false;}}
  });
  $("#connectErlcButton").addEventListener("click",async()=>{
    const input=$("#apiServerKey"),button=$("#connectErlcButton"),status=$("#apiConnectionStatus");
    if(!currentAccess||!currentAccess.isOwner){status.textContent="Only the Discord server owner can connect this API key.";status.className="api-connect-status error";return;}
    const key=input.value.trim();
    if(!key){status.textContent="Paste your ER:LC private-server API key first.";status.className="api-connect-status error";input.focus();return;}
    input.value="";button.disabled=true;button.textContent="Testing…";status.textContent="Checking the key with your ER:LC server…";status.className="api-connect-status";
    try{
      const result=await callServer("connectErlcServer",sessionToken,key),server=result.server||{};
      status.textContent="Connected to "+(server.name||"your ER:LC server")+". The key was saved securely.";status.className="api-connect-status success";
      await loadHealth();toast("ER:LC API connected.","success");
    }catch(error){status.textContent=error.message||"Could not connect. Check the key and try again.";status.className="api-connect-status error";}
    finally{input.value="";button.disabled=false;button.textContent="Connect & test";}
  });
  window.addEventListener("pageshow", event => { if (event.persisted) showEntryGate(); });
  initializeAccess();
})();
