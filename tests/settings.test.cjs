const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { test } = require("node:test");
const vm = require("node:vm");

const content = readFileSync(join(__dirname, "../scripts/content.js"), "utf8");

function loadContent(initial = {}, storageError = false) {
  const state = { ...initial };
  const pending = [];
  const alerts = [];
  const responses = [];
  const downloads = [];
  const children = new Set();
  let reloads = 0;
  const context = vm.createContext({
    Blob, URL, setTimeout,
    console,
    alert: (message) => alerts.push(message),
    location: { reload: () => reloads++ },
    window: { addEventListener() {} },
    document: {
      createElement: () => ({
        click() {
          downloads.push({ href: this.href, download: this.download });
        },
      }),
      body: {
        appendChild: (element) => children.add(element),
        removeChild(element) {
          assert.ok(children.delete(element), "No se puede eliminar un enlace sin añadirlo");
        },
      },
    },
    chrome: {
      runtime: { onMessage: { addListener() {} } },
      storage: { local: {
        get: (keys, callback) => callback({ ...state }),
        set(values, callback) {
          pending.push(() => {
            if (storageError) {
              context.chrome.runtime.lastError = { message: "Storage unavailable" };
            } else {
              Object.assign(state, values);
            }
            callback?.();
            delete context.chrome.runtime.lastError;
          });
        },
      } },
    },
  });
  vm.runInContext(content, context);
  pending.splice(0).forEach((complete) => complete());
  return {
    context, state, pending, alerts, responses, downloads, children,
    get reloads() { return reloads; },
    run: (code) => vm.runInContext(code, context),
    import(settings) {
      context.settingsText = settings;
      context.importResult = (response) => responses.push(response);
      return vm.runInContext("importSettings(settingsText, importResult)", context);
    },
  };
}

const legacy = JSON.stringify({
  tubemod_version: "1.0.0",
  tubemod_elements: JSON.stringify([
    { id: "video-thumbnails", checked: true, selector: "obsolete" },
  ]),
});

test("la importación espera al guardado antes de recargar", () => {
  const app = loadContent();
  app.import(legacy);
  assert.equal(app.reloads, 0);
  assert.equal(app.responses.length, 0);
  app.pending.splice(0).forEach((complete) => complete());
  assert.equal(app.reloads, 1);
  assert.equal(app.responses.length, 1);
  assert.equal(app.responses[0].success, true);
});

test("la importación conserva preferencias antiguas usando las definiciones actuales", () => {
  const app = loadContent();
  app.import(legacy);
  app.pending.splice(0).forEach((complete) => complete());
  const elements = JSON.parse(app.state.tubemod_elements);
  const thumbnails = elements.find((element) => element.id === "video-thumbnails");
  assert.equal(thumbnails.checked, true);
  assert.notEqual(thumbnails.selector, "obsolete");
  assert.equal(app.state.tubemod_version, app.run("STORAGE.tubemod_version"));
  assert.equal(elements.length, app.run("STORAGE.tubemod_elements.length"));
});

test("un archivo de la misma versión no sustituye los selectores instalados", () => {
  const app = loadContent();
  app.import(JSON.stringify({
    tubemod_version: app.state.tubemod_version,
    tubemod_elements: JSON.stringify([
      { id: "video-thumbnails", checked: true, selector: "obsolete" },
      { id: "removed-option", checked: true },
    ]),
  }));
  app.pending.splice(0).forEach((complete) => complete());
  const elements = JSON.parse(app.state.tubemod_elements);
  assert.notEqual(elements.find((el) => el.id === "video-thumbnails").selector, "obsolete");
  assert.equal(elements.some((el) => el.id === "removed-option"), false);
});

test("la configuración importada se puede cargar tras recargar la página", async () => {
  const app = loadContent();
  app.import(legacy);
  app.pending.splice(0).forEach((complete) => complete());
  const reloaded = loadContent(app.state);
  const elements = await reloaded.run("tubeMod.elementManager.getStoredElements()");
  assert.equal(elements.find((el) => el.id === "video-thumbnails").checked, true);
  assert.ok(elements.length > 1);
});

test("la importación acepta una lista de opciones sin doble serialización", () => {
  const app = loadContent();
  app.import(JSON.stringify({ tubemod_elements: [{ id: "video-thumbnails", checked: true }] }));
  app.pending.splice(0).forEach((complete) => complete());
  assert.equal(typeof app.state.tubemod_elements, "string");
  assert.equal(JSON.parse(app.state.tubemod_elements).find((el) => el.id === "video-thumbnails").checked, true);
});

for (const invalid of ["{", "null", "{}", '{"tubemod_elements":"{}"}', '{"tubemod_elements":[null]}', '{"tubemod_elements":[{"id":"video-thumbnails","checked":"false"}]}', '{"tubemod_elements":[]}', '{"tubemod_elements":[{"id":"unknown-option","checked":true}]}']) {
  test(`un archivo inválido no cambia la configuración: ${invalid}`, () => {
    const app = loadContent();
    const before = JSON.stringify(app.state);
    assert.doesNotThrow(() => app.import(invalid));
    assert.equal(app.pending.length, 0);
    assert.equal(JSON.stringify(app.state), before);
    assert.equal(app.reloads, 0);
    assert.equal(app.responses.length, 1);
    assert.ok(app.responses[0].error);
  });
}

test("un error de almacenamiento no anuncia éxito ni recarga", () => {
  const app = loadContent({}, true);
  app.import(legacy);
  app.pending.splice(0).forEach((complete) => complete());
  assert.equal(app.reloads, 0);
  assert.match(app.responses.at(-1).error, /Storage unavailable/);
});

test("el archivo exportado se puede importar y el enlace temporal se elimina", async () => {
  const app = loadContent();
  app.run('STORAGE.tubemod_elements.find(el => el.id === "video-thumbnails").checked = true');
  app.state.tubemod_elements = app.run("JSON.stringify(STORAGE.tubemod_elements)");
  assert.doesNotThrow(() => app.run("saveSettings()"));
  assert.equal(app.downloads.length, 1);
  assert.equal(app.downloads[0].download, "tubeModSettings.json");
  assert.equal(app.children.size, 0);
  const exported = await (await fetch(app.downloads[0].href)).text();
  const imported = loadContent();
  imported.import(exported);
  imported.pending.splice(0).forEach((complete) => complete());
  assert.equal(imported.state.tubemod_elements, app.state.tubemod_elements);
});

test("el mensaje de importación responde solo cuando termina el guardado", () => {
  const app = loadContent();
  const responses = [];
  app.context.respond = (response) => responses.push(response);
  app.context.settingsText = legacy;
  const keepChannelOpen = app.run('tubeMod.handleMessage({ action: "importSettings", content: settingsText }, {}, respond)');
  assert.equal(keepChannelOpen, true);
  assert.equal(responses.length, 0);
  app.pending.splice(0).forEach((complete) => complete());
  assert.equal(responses.length, 1);
  assert.equal(responses[0].success, true);
  assert.equal(app.alerts.length, 0);
  assert.equal(app.reloads, 1);
});

test("el mensaje de importación devuelve un error si el archivo es inválido", () => {
  const app = loadContent();
  const responses = [];
  app.context.respond = (response) => responses.push(response);
  app.run('tubeMod.handleMessage({ action: "importSettings", content: "{}" }, {}, respond)');
  assert.equal(responses.length, 1);
  assert.match(responses[0].error, /JSON válido/);
  assert.equal(app.pending.length, 0);
  assert.equal(app.alerts.length, 0);
});

