// Claude Account Switcher - service worker (MV3)
// Estrategia: cada cuenta es una "foto" (snapshot) de las cookies de claude.ai.
// Cambiar de cuenta = guardar la foto activa, borrar cookies, restaurar la foto destino y recargar pestañas.

const STORAGE_KEY = "state";
const COOKIE_DOMAIN = "claude.ai";
const TAB_URL_PATTERN = "https://claude.ai/*";
// Heurística para detectar una sesión iniciada (cookie "sessionKey" de claude.ai).
const SESSION_COOKIE_REGEX = /session/i;
const BADGE_COLOR = "#CC785C";

// Cola serial: evita que dos operaciones modifiquen las cookies al mismo tiempo.
let queue = Promise.resolve();

function enqueue(task) {
  const run = queue.then(task);
  queue = run.catch(() => {});
  return run;
}

async function loadState() {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  return data[STORAGE_KEY] ?? { activeId: null, profiles: [] };
}

function saveState(state) {
  return chrome.storage.local.set({ [STORAGE_KEY]: state });
}

function cookieUrl(cookie) {
  const host = cookie.domain.replace(/^\./, "");
  return `https://${host}${cookie.path}`;
}

function hasSessionCookie(cookies) {
  return cookies.some((cookie) => SESSION_COOKIE_REGEX.test(cookie.name));
}

async function readCookies() {
  const cookies = await chrome.cookies.getAll({ domain: COOKIE_DOMAIN });
  return cookies.map((cookie) => ({
    name: cookie.name,
    value: cookie.value,
    domain: cookie.domain,
    hostOnly: cookie.hostOnly,
    path: cookie.path,
    secure: cookie.secure,
    httpOnly: cookie.httpOnly,
    sameSite: cookie.sameSite,
    session: cookie.session,
    expirationDate: cookie.expirationDate,
  }));
}

async function clearCookies() {
  const cookies = await chrome.cookies.getAll({ domain: COOKIE_DOMAIN });
  await Promise.all(
    cookies.map((cookie) => chrome.cookies.remove({ url: cookieUrl(cookie), name: cookie.name }))
  );
}

// Devuelve la cantidad de cookies que no se pudieron restaurar.
async function restoreCookies(cookies) {
  const now = Date.now() / 1000;
  let failed = 0;
  for (const cookie of cookies) {
    if (!cookie.session && cookie.expirationDate && cookie.expirationDate < now) continue;
    const details = {
      url: cookieUrl(cookie),
      name: cookie.name,
      value: cookie.value,
      path: cookie.path,
      secure: cookie.secure,
      httpOnly: cookie.httpOnly,
      sameSite: cookie.sameSite,
    };
    // Las cookies "host-only" (y las __Host-) no deben llevar el atributo domain.
    if (!cookie.hostOnly) details.domain = cookie.domain;
    if (!cookie.session && cookie.expirationDate) details.expirationDate = cookie.expirationDate;
    try {
      const result = await chrome.cookies.set(details);
      if (!result) failed += 1;
    } catch {
      failed += 1;
    }
  }
  return failed;
}

async function reloadClaudeTabs() {
  const tabs = await chrome.tabs.query({ url: TAB_URL_PATTERN });
  await Promise.all(tabs.map((tab) => chrome.tabs.reload(tab.id)));
}

function initials(name) {
  return name.trim().slice(0, 2).toUpperCase();
}

async function updateBadge() {
  const state = await loadState();
  const active = state.profiles.find((profile) => profile.id === state.activeId);
  await chrome.action.setBadgeText({ text: active ? initials(active.name) : "" });
  await chrome.action.setBadgeBackgroundColor({ color: BADGE_COLOR });
}

function validateName(name, profiles, ignoreId = null) {
  const clean = (name ?? "").trim();
  if (!clean) throw new Error("Escribe un nombre para la cuenta.");
  const duplicated = profiles.some(
    (profile) => profile.id !== ignoreId && profile.name.toLowerCase() === clean.toLowerCase()
  );
  if (duplicated) throw new Error("Ya existe una cuenta con ese nombre.");
  return clean;
}

// Actualiza la foto de la cuenta activa con las cookies actuales (conserva tokens rotados).
function refreshActiveSnapshot(state, currentCookies) {
  const active = state.profiles.find((profile) => profile.id === state.activeId);
  if (active && hasSessionCookie(currentCookies)) {
    active.cookies = currentCookies;
    active.updatedAt = Date.now();
  }
  return active;
}

async function listProfiles() {
  const state = await loadState();
  const current = await readCookies();
  return {
    activeId: state.activeId,
    loggedIn: hasSessionCookie(current),
    profiles: state.profiles.map((profile) => ({
      id: profile.id,
      name: profile.name,
      updatedAt: profile.updatedAt,
    })),
  };
}

async function addProfile(name) {
  const state = await loadState();
  const cleanName = validateName(name, state.profiles);
  const cookies = await readCookies();
  if (!hasSessionCookie(cookies)) {
    throw new Error("No hay sesión activa en claude.ai. Inicia sesión primero.");
  }
  const profile = { id: crypto.randomUUID(), name: cleanName, cookies, updatedAt: Date.now() };
  state.profiles.push(profile);
  state.activeId = profile.id;
  await saveState(state);
  await updateBadge();
  return {};
}

async function switchTo(id) {
  const state = await loadState();
  const target = state.profiles.find((profile) => profile.id === id);
  if (!target) throw new Error("La cuenta no existe.");
  if (state.activeId === id) return { unchanged: true, failed: 0 };

  const current = await readCookies();
  if (state.activeId === null && hasSessionCookie(current)) {
    throw new Error("Hay una sesión sin guardar. Guárdala primero para no perderla.");
  }
  refreshActiveSnapshot(state, current);

  await clearCookies();
  const failed = await restoreCookies(target.cookies);
  state.activeId = target.id;
  await saveState(state);
  await updateBadge();
  await reloadClaudeTabs();
  return { failed };
}

// Guarda la cuenta activa, limpia las cookies y deja claude.ai listo para iniciar sesión con otra cuenta.
async function startNewLogin() {
  const state = await loadState();
  const current = await readCookies();
  if (state.activeId === null && hasSessionCookie(current)) {
    throw new Error("Hay una sesión sin guardar. Guárdala primero.");
  }
  refreshActiveSnapshot(state, current);
  await clearCookies();
  state.activeId = null;
  await saveState(state);
  await updateBadge();
  await reloadClaudeTabs();
  return {};
}

async function renameProfile(id, name) {
  const state = await loadState();
  const profile = state.profiles.find((item) => item.id === id);
  if (!profile) throw new Error("La cuenta no existe.");
  profile.name = validateName(name, state.profiles, id);
  await saveState(state);
  await updateBadge();
  return {};
}

async function removeProfile(id) {
  const state = await loadState();
  state.profiles = state.profiles.filter((profile) => profile.id !== id);
  if (state.activeId === id) state.activeId = null;
  await saveState(state);
  await updateBadge();
  return {};
}

async function cycleAccount() {
  const state = await loadState();
  if (state.profiles.length < 2) return;
  const index = state.profiles.findIndex((profile) => profile.id === state.activeId);
  const next = state.profiles[(index + 1) % state.profiles.length];
  await switchTo(next.id);
}

const handlers = {
  list: () => listProfiles(),
  add: ({ name }) => addProfile(name),
  switch: ({ id }) => switchTo(id),
  rename: ({ id, name }) => renameProfile(id, name),
  remove: ({ id }) => removeProfile(id),
  newLogin: () => startNewLogin(),
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return false;
  const handler = handlers[message?.type];
  if (!handler) {
    sendResponse({ ok: false, error: "Acción desconocida." });
    return false;
  }
  enqueue(() => handler(message)).then(
    (result) => sendResponse({ ok: true, ...result }),
    (error) => sendResponse({ ok: false, error: error.message })
  );
  return true; // respuesta asíncrona
});

chrome.commands.onCommand.addListener((command) => {
  if (command !== "cycle-account") return;
  enqueue(cycleAccount).catch(() => chrome.action.setBadgeText({ text: "!" }));
});

chrome.runtime.onInstalled.addListener(() => enqueue(updateBadge));
chrome.runtime.onStartup.addListener(() => enqueue(updateBadge));
