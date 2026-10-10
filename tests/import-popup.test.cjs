const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { test } = require("node:test");
const vm = require("node:vm");

const popup = readFileSync(join(__dirname, "../scripts/popup.js"), "utf8");

test("Import Settings abre una página persistente ligada a la pestaña de YouTube", () => {
  const listeners = {};
  const opened = [];
  const button = { addEventListener: (event, listener) => { listeners[event] = listener; } };
  const context = vm.createContext({
    window: { close() {} },
    document: {
      querySelectorAll: () => [],
      getElementsByClassName: () => [],
      getElementById: (id) => id === "import-settings" ? button : { addEventListener() {} },
      addEventListener: (event, listener) => listener(),
    },
    chrome: {
      storage: { local: { get: (keys, callback) => callback({}) } },
      runtime: {
        onMessage: { addListener() {} },
        getURL: (path) => `chrome-extension://tubemod/${path}`,
      },
      tabs: {
        query: (query, callback) => callback([{ id: 41 }]),
        create: (options) => opened.push(options),
      },
    },
  });
  vm.runInContext(popup, context);
  assert.equal(typeof listeners.click, "function", "La importación no debe abrir el selector desde el popup");
  listeners.click();
  assert.equal(opened.length, 1);
  const url = new URL(opened[0].url);
  assert.equal(url.pathname, "/public/import.html");
  assert.equal(url.searchParams.get("tabId"), "41");
});

function loadImportPage({ tabId = "41", response = { success: true }, connectionError = false } = {}) {
  const events = {};
  const messages = [];
  const status = { textContent: "" };
  const fileInput = { value: "selected.json", addEventListener: (event, listener) => { events[event] = listener; } };
  const context = vm.createContext({
    URLSearchParams,
    window: { location: { search: tabId === null ? "" : `?tabId=${tabId}` } },
    document: { getElementById: (id) => id === "import-settings" ? fileInput : status },
    chrome: {
      runtime: {},
      tabs: {
        sendMessage(id, message, callback) {
          messages.push({ id, message });
          if (connectionError) context.chrome.runtime.lastError = { message: "Receiving end does not exist" };
          callback(response);
          delete context.chrome.runtime.lastError;
        },
      },
    },
  });
  vm.runInContext(readFileSync(join(__dirname, "../scripts/import.js"), "utf8"), context);
  return { events, fileInput, messages, status };
}

test("la página de importación envía el archivo a YouTube, no a su propia pestaña", async () => {
  const app = loadImportPage();
  app.fileInput.files = { item: () => ({ text: async () => '{"tubemod_elements":[]}' }) };
  await app.events.change({ target: app.fileInput });
  assert.equal(app.messages.length, 1);
  assert.equal(app.messages[0].id, 41);
  assert.equal(app.messages[0].message.action, "importSettings");
  assert.equal(app.messages[0].message.content, '{"tubemod_elements":[]}');
  assert.match(app.status.textContent, /importada/);
  assert.equal(app.fileInput.value, "");
});

test("la página muestra el error de validación recibido sin anunciar éxito", async () => {
  const app = loadImportPage({ response: { error: "Archivo inválido" } });
  app.fileInput.files = { item: () => ({ text: async () => "{}" }) };
  await app.events.change({ target: app.fileInput });
  assert.equal(app.status.textContent, "Archivo inválido");
});

test("si YouTube no recibe el mensaje se indica cómo continuar", async () => {
  const app = loadImportPage({ connectionError: true, response: undefined });
  app.fileInput.files = { item: () => ({ text: async () => "{}" }) };
  await app.events.change({ target: app.fileInput });
  assert.match(app.status.textContent, /YouTube/);
  assert.match(app.status.textContent, /recarga/i);
  assert.doesNotMatch(app.status.textContent, /importada/);
});

test("abrir la página sin pestaña de destino no importa en otra pestaña", async () => {
  const app = loadImportPage({ tabId: null });
  app.fileInput.files = { item: () => ({ text: async () => "{}" }) };
  await app.events.change({ target: app.fileInput });
  assert.equal(app.messages.length, 0);
  assert.match(app.status.textContent, /panel de TubeMod/);
});

test("cancelar el selector de archivo no intenta leer ni importar", async () => {
  const app = loadImportPage();
  await app.events.change({ target: { files: { item: () => null } } });
  assert.equal(app.messages.length, 0);
});

test("un error al leer el archivo se comunica sin importar", async () => {
  const app = loadImportPage();
  app.fileInput.files = { item: () => ({ text: async () => { throw new Error("Read failed"); } }) };
  await app.events.change({ target: app.fileInput });
  assert.equal(app.messages.length, 0);
  assert.match(app.status.textContent, /No se pudo leer/);
  assert.equal(app.fileInput.value, "");
  assert.equal(app.fileInput.disabled, false);
});
