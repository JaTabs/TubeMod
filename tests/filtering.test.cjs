const assert = require("node:assert/strict");
const { spawn, spawnSync } = require("node:child_process");
const { readFileSync, mkdtempSync, rmSync, existsSync } = require("node:fs");
const { createServer } = require("node:http");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { test } = require("node:test");

const root = join(__dirname, "..");
const diagnosticsPath = join(root, "scripts/diagnostics.js");

async function smoke() {
  const manager = tubeMod.elementManager;
  const fixture = document.getElementById("fixture");
  if (window.__startupActivation !== false) throw new Error("Una activación pendiente sobrevivió a la desactivación");
  tubeModDiagnostics.setEnabled(true);
  getCurrentPageType = () => "downloads";
  await manager.ready;
  manager.observer?.disconnect();
  fixture.innerHTML = "<div id='pending'></div><ytd-thumbnail><yt-image></yt-image></ytd-thumbnail>";
  manager.elements = STORAGE.tubemod_elements.map((element) => new YouTubeElement({
    ...element, checked: element.id === "download-badge" || element.id === "video-thumbnails",
  }));
  await manager.applyAllElements("downloads");
  manager.setupObserver();
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  assert(getComputedStyle(fixture.querySelector("yt-image")).display === "none", "Miniatura no filtrada");
  fixture.querySelector("#pending").innerHTML = "<p>Downloaded</p>";
  await Promise.resolve();
  await manager.handleAction({ target: "logo", hide: true });
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert(getComputedStyle(fixture.querySelector("p")).display === "none", "Filtro pendiente no aplicado");
  await manager.handleAction({ target: "download-badge", hide: false });
  assert(getComputedStyle(fixture.querySelector("p")).display !== "none", "Filtro no restaurado");

  const host = document.getElementById("tubemod-diagnostics");
  assert(host?.shadowRoot, "El panel de diagnóstico no se abrió");
  host.shadowRoot.querySelector("[data-action='measure']").click();
  await new Promise((resolve) => setTimeout(resolve, 1100));
  const report = tubeModDiagnostics.getReport();
  assert(report.enabled && report.samples.length > 0, "No se registraron muestras");
  assert(report.counters.xpathQueries > 0 && report.counters.jsMs >= 0, "Faltan métricas reales del filtrado");
  assert(report.variant === document.body.dataset.variant, "El informe no identifica el motor");
  assert(host.shadowRoot.querySelectorAll("canvas").length === 3, "Faltan gráficas");
  assert(!JSON.stringify(report).includes(location.href), "El informe incluye la URL de la página");
  host.shadowRoot.querySelector("[data-action='stop']").click();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert(!document.getElementById("tubemod-diagnostics"), "El diagnóstico no se desactivó");
  assert(!tubeModDiagnostics.getReport().enabled, "La instrumentación sigue activa");
  manager.observer?.disconnect();
}

async function runBrowser(browser, variant, diagnostics) {
  const content = readFileSync(join(root, variant === "original"
    ? "variants/original/content.js" : "scripts/content.js"), "utf8");
  const profile = mkdtempSync(join(tmpdir(), `tubemod-${browser}-`));
  let child;
  let timeout;
  let settle;
  const completed = new Promise((resolve, reject) => { settle = { resolve, reject }; });
  const server = createServer((request, response) => {
    if (request.url === "/result" && request.method === "POST") {
      let body = "";
      request.on("data", (chunk) => { body += chunk; });
      request.on("end", () => {
        response.end("ok");
        try { settle.resolve(JSON.parse(body)); } catch (error) { settle.reject(error); }
      });
      return;
    }
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.end(`<!doctype html><html><head>
      <script>const changes = []; const state = {tubemod_debug_enabled:true};
        window.chrome = {
          runtime: { onMessage: { addListener() {} }, getManifest() { return {name:'TubeMod (${variant})',version:'1.15.0'}; } },
          storage: { onChanged: {addListener(listener) {changes.push(listener);}}, local: {
            get(keys, callback) {callback({...state});},
            set(values, callback) {const diff={};for(const key in values){diff[key]={oldValue:state[key],newValue:values[key]};}Object.assign(state,values);changes.forEach(listener=>listener(diff,'local'));callback?.();return Promise.resolve();}
          } }
        };
      </script><script>${content}</script><script>${diagnostics}</script>
      <script>tubeModDiagnostics.setEnabled(false);document.addEventListener('DOMContentLoaded',()=>{window.__startupActivation=tubeModDiagnostics.enabled;});</script>
      </head><body data-variant="${variant}"><div id="fixture"></div>
      <script>window.addEventListener('load', () => setTimeout(async () => {
        let result;
        try {await (${smoke.toString()})();result={success:true};}
        catch(error){result={success:false,error:error.stack || error.message};}
        await fetch('/result',{method:'POST',body:JSON.stringify(result)});
      },0));</script></body></html>`);
  });
  try {
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const url = `http://127.0.0.1:${server.address().port}/`;
    const args = browser === "firefox"
      ? ["--headless", "--no-remote", "--profile", profile, url]
      : ["--headless", `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check", url];
    let stderr = "";
    child = spawn(browser, args, { stdio: ["ignore", "ignore", "pipe"] });
    child.stderr.on("data", (chunk) => { stderr = (stderr + chunk).slice(-4000); });
    child.on("error", settle.reject);
    child.on("exit", (code, signal) => settle.reject(new Error(`El navegador terminó sin resultados (${code}, ${signal}): ${stderr}`)));
    timeout = setTimeout(() => settle.reject(new Error(`El navegador no envió resultados: ${stderr}`)), 25000);
    const result = await completed;
    assert.equal(result.success, true, `${browser} / ${variant}: ${result.error || ""}`);
  } finally {
    clearTimeout(timeout);
    if (child && child.exitCode === null && child.signalCode === null) {
      const exited = new Promise((resolve) => child.once("exit", resolve));
      child.kill("SIGTERM");
      await exited;
    }
    await new Promise((resolve) => server.close(resolve));
    rmSync(profile, { recursive: true, force: true });
  }
}

test("filtrado y diagnóstico de ambos motores en navegadores reales", { timeout: 120000 }, async (t) => {
  const diagnostics = existsSync(diagnosticsPath) ? readFileSync(diagnosticsPath, "utf8") : "";
  const browsers = process.env.TUBEMOD_BROWSERS?.split(",") || ["chromium", "firefox"];
  let runs = 0;
  for (const browser of browsers) {
    if (spawnSync(browser, ["--version"], { stdio: "ignore" }).status !== 0) {
      t.diagnostic(`${browser} no está instalado; no se ejecuta`);
      continue;
    }
    for (const variant of ["original", "optimized"]) {
      await runBrowser(browser, variant, diagnostics);
      runs++;
    }
  }
  if (!runs) t.skip("No hay un navegador compatible instalado");
});
