// Popup: solo interfaz. Toda la lógica de cookies vive en background.js.

const $ = (selector) => document.querySelector(selector);

async function send(type, payload = {}) {
  const response = await chrome.runtime.sendMessage({ type, ...payload });
  if (!response?.ok) throw new Error(response?.error ?? "Error desconocido.");
  return response;
}

function setStatus(text, isError = false) {
  const el = $("#status");
  el.textContent = text;
  el.classList.toggle("error", isError);
}

// Ejecuta una acción, muestra errores y vuelve a pintar la lista.
async function run(action) {
  setStatus("");
  try {
    await action();
    await render();
  } catch (error) {
    setStatus(error.message, true);
  }
}

async function switchAccount(id) {
  setStatus("");
  try {
    const { failed } = await send("switch", { id });
    if (failed > 0) {
      setStatus(`Cuenta cambiada, pero ${failed} cookie(s) no se restauraron.`, true);
      await render();
      return;
    }
    window.close(); // la pestaña de claude.ai ya se está recargando
  } catch (error) {
    setStatus(error.message, true);
  }
}

function iconButton(text, title) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "icon";
  button.textContent = text;
  button.title = title;
  return button;
}

function startRename(li, profile) {
  const input = document.createElement("input");
  input.value = profile.name;
  input.maxLength = 24;
  li.replaceChildren(input);
  input.focus();
  input.select();
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") run(() => send("rename", { id: profile.id, name: input.value }));
    if (event.key === "Escape") render();
  });
}

function buildRow(profile, isActive) {
  const li = document.createElement("li");
  li.classList.toggle("active", isActive);

  const switchButton = document.createElement("button");
  switchButton.type = "button";
  switchButton.className = "switch";
  switchButton.disabled = isActive;
  const label = document.createElement("span");
  label.textContent = profile.name;
  switchButton.append(label);
  if (isActive) {
    const tag = document.createElement("small");
    tag.textContent = "activa";
    switchButton.append(tag);
  }
  switchButton.addEventListener("click", () => switchAccount(profile.id));

  const renameButton = iconButton("✎", "Renombrar");
  renameButton.addEventListener("click", () => startRename(li, profile));

  const removeButton = iconButton("✕", "Eliminar");
  let resetTimer = null;
  removeButton.addEventListener("click", () => {
    if (resetTimer === null) {
      removeButton.textContent = "¿Borrar?";
      removeButton.classList.add("confirm");
      resetTimer = setTimeout(() => {
        removeButton.textContent = "✕";
        removeButton.classList.remove("confirm");
        resetTimer = null;
      }, 3000);
      return;
    }
    clearTimeout(resetTimer);
    run(() => send("remove", { id: profile.id }));
  });

  li.append(switchButton, renameButton, removeButton);
  return li;
}

function describeState({ profiles, activeId, loggedIn }) {
  if (activeId !== null) return "Haz clic en una cuenta para cambiar a ella.";
  if (loggedIn) return "Sesión sin guardar: ponle un nombre y guárdala.";
  if (profiles.length === 0) return "Inicia sesión en claude.ai y guarda tu primera cuenta.";
  return "Sin sesión: elige una cuenta o inicia sesión con otra.";
}

async function render() {
  const state = await send("list");
  const list = $("#profiles");
  list.replaceChildren(...state.profiles.map((p) => buildRow(p, p.id === state.activeId)));
  $("#hint").textContent = describeState(state);

  // Guardar solo aplica cuando hay una sesión sin asignar; "Añadir" cuando ya hay una cuenta activa.
  $("#add-form").hidden = !(state.activeId === null && state.loggedIn);
  $("#new-login").hidden = state.activeId === null;
}

$("#add-form").addEventListener("submit", (event) => {
  event.preventDefault();
  run(async () => {
    await send("add", { name: $("#name").value });
    $("#name").value = "";
  });
});

$("#new-login").addEventListener("click", async () => {
  setStatus("");
  try {
    await send("newLogin");
    window.close(); // claude.ai queda sin sesión: inicia con la otra cuenta y guárdala
  } catch (error) {
    setStatus(error.message, true);
  }
});

render().catch((error) => setStatus(error.message, true));
