const CONFIG = window.GARBINET_CONFIG || {};
const BROTHERS = [
  "Alejandro Montaño", "David Gisbert", "Enrique Llorente",
  "Juan Pablo Campoverde", "Dario Stella", "Leonel Muñiz", "Luis Varela",
  "José Luis Villanueva", "Domingo Figueroa", "Werner Kupke",
  "Alonso Martínez", "Rigo Peidró"
];

const state = {
  viewerToken: sessionStorage.getItem("garbinet_viewer") || "",
  adminToken: sessionStorage.getItem("garbinet_admin") || "",
  viewedMonth: monthStart(new Date()),
  editedMonth: monthStart(new Date()),
  assignments: new Map()
};

const $ = (selector) => document.querySelector(selector);
const monthFormatter = new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric" });
const dayFormatter = new Intl.DateTimeFormat("es-ES", { weekday: "long" });

function monthStart(date) { return new Date(date.getFullYear(), date.getMonth(), 1); }
function monthKey(date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`; }
function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function addMonths(date, amount) { return new Date(date.getFullYear(), date.getMonth() + amount, 1); }
function capitalise(text) { return text.charAt(0).toUpperCase() + text.slice(1); }

function meetingDays(date) {
  const days = [];
  const cursor = new Date(date.getFullYear(), date.getMonth(), 1);
  while (cursor.getMonth() === date.getMonth()) {
    if (cursor.getDay() === 0 || cursor.getDay() === 2) days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

async function api(action, payload = {}, token = "") {
  if (!CONFIG.apiUrl || CONFIG.apiUrl.includes("TU-PROYECTO")) {
    throw new Error("El sitio todavía no está conectado a Supabase.");
  }
  const response = await fetch(CONFIG.apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ action, ...payload })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || "No se ha podido completar la operación.");
    error.status = response.status;
    throw error;
  }
  return data;
}

async function login(role, password) {
  return api("login", { role, password });
}

function openApp() {
  $("#login-screen").hidden = true;
  $("#app").hidden = false;
  loadSchedule();
}

async function loadSchedule() {
  const month = monthKey(state.viewedMonth);
  $("#month-title").textContent = monthFormatter.format(state.viewedMonth);
  $("#schedule-list").innerHTML = "";
  $("#empty-state").hidden = true;
  $("#loading").hidden = false;
  try {
    const data = await api("get-program", { month }, state.viewerToken);
    renderSchedule(data.assignments || []);
  } catch (error) {
    if (error.status === 401) {
      sessionStorage.clear();
      location.reload();
      return;
    }
    $("#loading").textContent = error.message;
  }
}

function renderSchedule(assignments) {
  $("#loading").hidden = true;
  const list = $("#schedule-list");
  if (!assignments.length) {
    $("#empty-state").hidden = false;
    return;
  }
  assignments.sort((a, b) => a.service_date.localeCompare(b.service_date));
  for (const item of assignments) {
    const [year, month, day] = item.service_date.split("-").map(Number);
    const date = new Date(year, month - 1, day);
    const row = document.createElement("article");
    row.className = "schedule-item";
    const safeName = document.createElement("span");
    safeName.className = "brother-name";
    safeName.textContent = item.brother_name;
    row.innerHTML = `<div class="date-block"><span class="date-number">${day}</span><span class="date-day">${capitalise(dayFormatter.format(date))}</span></div>`;
    row.appendChild(safeName);
    list.appendChild(row);
  }
}

async function openEditor() {
  state.editedMonth = new Date(state.viewedMonth);
  $("#admin-login-error").textContent = "";
  if (state.adminToken) {
    await showEditor();
  } else {
    $("#admin-login-dialog").showModal();
    setTimeout(() => $("#admin-password").focus(), 50);
  }
}

async function showEditor() {
  $("#admin-login-dialog").close();
  if (!$("#editor-dialog").open) $("#editor-dialog").showModal();
  await loadEditorMonth();
}

async function loadEditorMonth() {
  $("#editor-month-title").textContent = monthFormatter.format(state.editedMonth);
  $("#editor-list").innerHTML = '<p class="status-message">Cargando…</p>';
  $("#save-status").textContent = "";
  try {
    const data = await api("get-program", { month: monthKey(state.editedMonth) }, state.adminToken);
    state.assignments = new Map((data.assignments || []).map(item => [item.service_date, item.brother_name]));
    renderEditor();
  } catch (error) {
    if (error.status === 401) {
      state.adminToken = "";
      sessionStorage.removeItem("garbinet_admin");
      $("#editor-dialog").close();
      $("#admin-login-dialog").showModal();
      return;
    }
    $("#editor-list").innerHTML = `<p class="status-message"></p>`;
    $("#editor-list p").textContent = error.message;
  }
}

function renderEditor() {
  const list = $("#editor-list");
  list.innerHTML = "";
  for (const date of meetingDays(state.editedMonth)) {
    const key = dateKey(date);
    const row = document.createElement("div");
    row.className = "editor-row";
    const dateBlock = document.createElement("div");
    dateBlock.className = "editor-date";
    dateBlock.innerHTML = `${capitalise(dayFormatter.format(date))} ${date.getDate()}<small>${monthFormatter.format(date)}</small>`;
    const select = document.createElement("select");
    select.name = key;
    select.setAttribute("aria-label", `Hermano para ${capitalise(dayFormatter.format(date))} ${date.getDate()}`);
    select.append(new Option("Seleccionar un hermano", ""));
    for (const brother of BROTHERS) select.append(new Option(brother, brother));
    select.value = state.assignments.get(key) || "";
    row.append(dateBlock, select);
    list.appendChild(row);
  }
}

async function saveProgram(event) {
  event.preventDefault();
  const button = $("#save-program");
  const assignments = [...$("#editor-list").querySelectorAll("select")].map(select => ({
    service_date: select.name,
    brother_name: select.value
  }));
  if (assignments.some(item => !item.brother_name)) {
    $("#save-status").textContent = "Completa todos los campos antes de guardar.";
    $("#save-status").style.color = "var(--danger)";
    return;
  }
  button.disabled = true;
  $("#save-status").textContent = "Guardando…";
  $("#save-status").style.color = "var(--muted)";
  try {
    await api("save-program", { month: monthKey(state.editedMonth), assignments }, state.adminToken);
    $("#save-status").textContent = "Programa guardado correctamente.";
    $("#save-status").style.color = "var(--success)";
    if (monthKey(state.editedMonth) === monthKey(state.viewedMonth)) await loadSchedule();
  } catch (error) {
    $("#save-status").textContent = error.message;
    $("#save-status").style.color = "var(--danger)";
  } finally {
    button.disabled = false;
  }
}

$("#login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = event.submitter;
  button.disabled = true;
  $("#login-error").textContent = "";
  try {
    const data = await login("viewer", $("#viewer-password").value);
    state.viewerToken = data.token;
    sessionStorage.setItem("garbinet_viewer", data.token);
    openApp();
  } catch (error) {
    $("#login-error").textContent = error.message;
  } finally { button.disabled = false; }
});

$("#admin-login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = event.submitter;
  button.disabled = true;
  $("#admin-login-error").textContent = "";
  try {
    const data = await login("admin", $("#admin-password").value);
    state.adminToken = data.token;
    sessionStorage.setItem("garbinet_admin", data.token);
    $("#admin-password").value = "";
    await showEditor();
  } catch (error) {
    $("#admin-login-error").textContent = error.message;
  } finally { button.disabled = false; }
});

$("#prev-month").addEventListener("click", () => { state.viewedMonth = addMonths(state.viewedMonth, -1); loadSchedule(); });
$("#next-month").addEventListener("click", () => { state.viewedMonth = addMonths(state.viewedMonth, 1); loadSchedule(); });
$("#editor-prev").addEventListener("click", () => { state.editedMonth = addMonths(state.editedMonth, -1); loadEditorMonth(); });
$("#editor-next").addEventListener("click", () => { state.editedMonth = addMonths(state.editedMonth, 1); loadEditorMonth(); });
$("#open-admin").addEventListener("click", openEditor);
$("#editor-form").addEventListener("submit", saveProgram);
document.querySelectorAll("[data-close]").forEach(button => button.addEventListener("click", () => $(`#${button.dataset.close}`).close()));
document.querySelectorAll("[data-toggle-password]").forEach(button => button.addEventListener("click", () => {
  const input = $(`#${button.dataset.togglePassword}`);
  input.type = input.type === "password" ? "text" : "password";
  button.textContent = input.type === "password" ? "Ver" : "Ocultar";
}));

if (state.viewerToken) openApp();
