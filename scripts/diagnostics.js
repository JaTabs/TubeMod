const tubeModDiagnostics = {
  enabled: false,
  desiredEnabled: false,
  paused: false,
  variant: "original",
  samples: [],
  logs: [],
  durations: [],
  restores: [],
  depth: 0,
  range: 60,
  counters: { jsMs: 0, operations: 0, xpathQueries: 0, globalQueries: 0, scopedQueries: 0, matchedNodes: 0, errors: 0 },
  interval: null,
  longTaskObserver: null,
  longTasks: 0,
  longTaskMs: 0,
  uiMs: 0,
  host: null,
  plots: [],

  setEnabled(enabled) {
    chrome.storage.local.set({ tubemod_debug_enabled: enabled }, () => {
      if (chrome.runtime.lastError) {
        if (this.status) this.status.textContent = `No se pudo guardar: ${chrome.runtime.lastError.message}`;
        return;
      }
      this.setActive(enabled);
    });
  },

  setActive(enabled) {
    this.desiredEnabled = enabled;
    if (this.enabled === enabled) return;
    if (enabled && !document.body) {
      document.addEventListener("DOMContentLoaded", () => {
        if (this.desiredEnabled) this.setActive(true);
      }, { once: true });
      return;
    }
    if (!enabled) {
      this.enabled = false;
      clearInterval(this.interval);
      this.interval = null;
      this.longTaskObserver?.disconnect();
      this.longTaskObserver = null;
      this.restores.splice(0).reverse().forEach((restore) => restore());
      this.host?.remove();
      this.host = null;
      this.plots = [];
      this.samples = [];
      this.logs = [];
      this.durations = [];
      this.status = null;
      this.fields = null;
      this.tableBody = null;
      this.logView = null;
      return;
    }
    if (document.getElementById("tubemod-diagnostics")) {
      console.warn("TubeMod: activa solo un paquete para comparar el rendimiento.");
      return;
    }
    this.enabled = true;
    this.paused = false;
    this.reset();
    const manager = tubeMod.elementManager;
    for (const method of ["applyAllElements", "handleMutations", "setupObserver"]) {
      this.instrument(manager, method);
    }
    this.instrument(YouTubeElement.prototype, "toggle");
    const evaluate = document.evaluate;
    const diagnostics = this;
    const measuredEvaluate = function (...args) {
      const result = evaluate.apply(this, args);
      if (diagnostics.enabled && !diagnostics.paused) {
        diagnostics.counters.xpathQueries++;
        diagnostics.counters[args[1] === document ? "globalQueries" : "scopedQueries"]++;
        if (result.resultType === XPathResult.UNORDERED_NODE_SNAPSHOT_TYPE) {
          diagnostics.counters.matchedNodes += result.snapshotLength;
        }
      }
      return result;
    };
    document.evaluate = measuredEvaluate;
    this.restores.push(() => {
      if (document.evaluate === measuredEvaluate) document.evaluate = evaluate;
    });
    this.longTasksSupported = typeof PerformanceObserver !== "undefined" &&
      PerformanceObserver.supportedEntryTypes?.includes("longtask");
    if (this.longTasksSupported) {
      this.longTaskObserver = new PerformanceObserver((list) => {
        if (this.paused || !this.enabled) return;
        for (const entry of list.getEntries()) {
          this.longTasks++;
          this.longTaskMs += entry.duration;
        }
      });
      this.longTaskObserver.observe({ type: "longtask" });
    }
    this.buildPanel();
    this.interval = setInterval(() => {
      if (!this.paused && !document.hidden) this.sample();
    }, 1000);
    this.render();
  },

  instrument(target, method) {
    const original = target[method];
    if (typeof original !== "function") return;
    const diagnostics = this;
    const measured = function (...args) {
      if (!diagnostics.enabled || diagnostics.paused) return original.apply(this, args);
      const outer = diagnostics.depth++ === 0;
      const start = outer ? performance.now() : 0;
      let errorName = null;
      try {
        // Se mide la ejecución síncrona, no las esperas de storage ni las promesas.
        return original.apply(this, args);
      } catch (error) {
        errorName = error.name;
        throw error;
      } finally {
        diagnostics.depth--;
        if (outer) {
          const duration = performance.now() - start;
          diagnostics.counters.jsMs += duration;
          diagnostics.counters.operations++;
          if (method === "applyAllElements") diagnostics.lastApplicationMs = duration;
          if (method === "handleMutations") diagnostics.lastBatchMs = duration;
          if (errorName) diagnostics.counters.errors++;
          diagnostics.durations.push(duration);
          if (diagnostics.durations.length > 300) diagnostics.durations.shift();
          diagnostics.logs.push({ elapsedMs: start - diagnostics.startedAt, operation: method, durationMs: duration, error: errorName });
          if (diagnostics.logs.length > 100) diagnostics.logs.shift();
        }
      }
    };
    target[method] = measured;
    this.restores.push(() => {
      if (target[method] === measured) target[method] = original;
    });
  },

  reset() {
    this.startedAt = performance.now();
    this.lastSampleAt = this.startedAt;
    this.lastJsMs = 0;
    this.lastLongTasks = 0;
    this.lastApplicationMs = null;
    this.lastBatchMs = null;
    this.longTasks = 0;
    this.longTaskMs = 0;
    this.samples = [];
    this.logs = [];
    this.durations = [];
    this.counters = { jsMs: 0, operations: 0, xpathQueries: 0, globalQueries: 0, scopedQueries: 0, matchedNodes: 0, errors: 0 };
  },

  sample() {
    const now = performance.now();
    const jsMs = this.counters.jsMs - this.lastJsMs;
    const heap = performance.memory?.usedJSHeapSize;
    this.samples.push({
      elapsedMs: now - this.startedAt,
      jsMs,
      activityPercent: jsMs / (now - this.lastSampleAt) * 100,
      lastOperationMs: this.durations.at(-1) ?? null,
      heapMiB: typeof heap === "number" ? heap / 1048576 : null,
      longTasks: this.longTasksSupported ? this.longTasks - this.lastLongTasks : null,
    });
    if (this.samples.length > 120) this.samples.shift();
    this.lastSampleAt = now;
    this.lastJsMs = this.counters.jsMs;
    this.lastLongTasks = this.longTasks;
    const start = performance.now();
    this.render();
    this.uiMs = performance.now() - start;
  },

  getReport() {
    return {
      schemaVersion: 1,
      variant: this.variant,
      extensionVersion: chrome.runtime.getManifest().version,
      enabled: this.enabled,
      paused: this.paused,
      pageType: getCurrentPageType(),
      elapsedMs: this.startedAt ? performance.now() - this.startedAt : 0,
      counters: { ...this.counters },
      longTasks: this.longTasksSupported ? { count: this.longTasks, durationMs: this.longTaskMs } : null,
      lastPanelRefreshMs: this.uiMs,
      lastFullApplicationMs: this.lastApplicationMs,
      lastMutationBatchMs: this.lastBatchMs,
      limits: {
        cpu: "La ocupación es tiempo de JS instrumentado / tiempo transcurrido; no es uso de CPU del proceso.",
        memory: "performance.memory, si existe, informa del heap JS del navegador; no mide la RAM de TubeMod ni toda la pestaña.",
        filtering: "Los tiempos excluyen el trabajo CSS nativo, layout, pintura y esperas asíncronas.",
        longTasks: "Las tareas largas pertenecen a la página y no se atribuyen a TubeMod.",
        overhead: "Activar este panel añade instrumentación y refrescos; compáralos con la misma configuración.",
      },
      samples: this.samples.map((sample) => ({ ...sample })),
      logs: this.logs.map((log) => ({ ...log })),
    };
  },

  buildPanel() {
    const add = (tag, parent, text = "", attrs = {}) => {
      const node = document.createElement(tag);
      node.textContent = text;
      for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
      parent.appendChild(node);
      return node;
    };
    this.host = document.createElement("div");
    this.host.id = "tubemod-diagnostics";
    this.host.style.cssText = "position:fixed;top:16px;right:16px;z-index:2147483647;width:min(390px,calc(100vw - 32px));";
    const shadow = this.host.attachShadow({ mode: "open" });
    add("style", shadow, `
      :host { color-scheme:dark; }
      .panel { --surface:#1a1a19; --ink:#ffffff; --secondary:#c3c2b7; --grid:#383835; --series:#3987e5;
        background:rgba(26,26,25,.96);color:var(--ink);border:1px solid var(--grid);border-radius:2px;
        font:12px/1.5 ui-monospace,"Cascadia Mono","DejaVu Sans Mono",monospace;
        max-height:calc(100vh - 32px);overflow:auto;box-sizing:border-box;padding:14px; }
      * { box-sizing:border-box; } header { display:flex;align-items:start;justify-content:space-between;gap:12px; }
      h2 { font:700 15px/1.3 Tahoma,sans-serif;margin:0 0 3px; } p { margin:0; }
      .muted,small { color:var(--secondary); } .variant { font-weight:bold; } .controls { display:flex;flex-wrap:wrap;gap:6px;margin:12px 0; }
      button,select { font:11px/1.4 Tahoma,sans-serif;border:1px solid #565650;border-radius:2px;background:#282827;color:var(--ink);padding:6px 8px;cursor:pointer; }
      button:hover,select:hover { background:#3b3b38; } button:disabled { opacity:.5;cursor:not-allowed; } :focus-visible { outline:2px solid var(--series);outline-offset:2px; }
      dl { display:grid;grid-template-columns:minmax(0,1fr) auto;gap:3px 12px;margin:10px 0; }
      dt { color:var(--secondary); } dd { margin:0;text-align:right;font-variant-numeric:tabular-nums; }
      figure { margin:10px 0 0;border-top:1px solid var(--grid);padding-top:8px; }
      figcaption { display:flex;justify-content:space-between;gap:8px; } figcaption > span:last-child { white-space:nowrap; } canvas { display:block;width:100%;height:62px;background:var(--surface); }
      .readout { min-height:16px;color:var(--secondary);font-size:10px; } details { border-top:1px solid var(--grid);margin-top:12px;padding-top:8px; }
      summary { cursor:pointer; } table { width:100%;border-collapse:collapse;font-size:10px;margin-top:8px; } th,td { text-align:right;padding:3px 4px;border-bottom:1px solid var(--grid); }
      th { color:var(--secondary);font-weight:normal; } td:first-child,th:first-child { text-align:left; } .table { max-height:160px;overflow:auto; }
      .notes { margin-top:8px;font-size:11px;color:var(--secondary); } .notes p+p { margin-top:6px; }
      .status { margin-top:8px;font-size:11px;color:var(--secondary); }
      @media (forced-colors:active) { .panel { background:Canvas;color:CanvasText; } button,select { color:ButtonText;background:ButtonFace; } }
    `);
    const panel = add("section", shadow, "", { class: "panel", "aria-label": "Diagnóstico de TubeMod" });
    const header = add("header", panel);
    const title = add("div", header);
    add("h2", title, "TubeMod / diagnóstico");
    add("p", title, "Motor original", { class: "variant" });
    add("small", title, "F3 · datos desde la activación");
    const stop = add("button", header, "Cerrar", { "data-action": "stop", title: "Desactivar el diagnóstico y liberar sus registros" });
    stop.addEventListener("click", () => this.setEnabled(false));
    const controls = add("div", panel, "", { class: "controls" });
    const measure = add("button", controls, "Medir filtros", { "data-action": "measure", title: "Aplicar una vez todas las opciones de esta página y registrar su tiempo JavaScript" });
    measure.addEventListener("click", () => {
      try {
        Promise.resolve(tubeMod.elementManager.applyAllElements(getCurrentPageType()))
          .then(() => {
            if (!this.enabled) return;
            this.sample();
            this.status.textContent = "Aplicación registrada. El tiempo no incluye pintura ni trabajo CSS nativo.";
          })
          .catch((error) => { if (this.enabled) this.status.textContent = `El motor no pudo aplicar los filtros: ${error.name}.`; });
      } catch (error) {
        this.status.textContent = `El motor no pudo aplicar los filtros: ${error.name}.`;
      }
    });
    const pause = add("button", controls, "Pausar", { title: "Pausar la recogida de métricas; los filtros siguen funcionando" });
    pause.addEventListener("click", () => {
      this.paused = !this.paused;
      pause.textContent = this.paused ? "Continuar" : "Pausar";
      measure.disabled = this.paused;
      if (!this.paused) { this.lastSampleAt = performance.now(); this.lastJsMs = this.counters.jsMs; this.lastLongTasks = this.longTasks; }
    });
    const range = add("select", controls, "", { "aria-label": "Ventana de las gráficas" });
    for (const seconds of [30, 60, 120]) add("option", range, `${seconds} s`, { value: seconds });
    range.value = String(this.range);
    range.addEventListener("change", () => { this.range = Number(range.value); this.render(); });
    const reset = add("button", controls, "Reiniciar", { title: "Borrar los datos de esta medición" });
    reset.addEventListener("click", () => { this.reset(); this.render(); });
    const download = add("button", controls, "Exportar JSON", { title: "Descargar métricas y registros sin títulos, búsquedas ni URL de la página" });
    download.addEventListener("click", () => {
      const url = URL.createObjectURL(new Blob([JSON.stringify(this.getReport(), null, 2)], { type: "application/json" }));
      const link = add("a", shadow, "", { href: url, download: `tubemod-${this.variant}-diagnostico.json` });
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
    const stats = add("dl", panel);
    this.fields = {};
    for (const [key, label] of [
      ["rules", "Reglas CSS / XPath"], ["observer", "Observador DOM"],
      ["apply", "Aplicación completa · JS"], ["batch", "Último lote DOM · JS"],
      ["time", "JS últ / media / p95"], ["queries", "XPath global / por rama"],
      ["nodes", "Coincidencias acumuladas"], ["longTasks", "Tareas largas · página"],
      ["ui", "Refresco del panel · JS"], ["errors", "Errores síncronos"],
    ]) {
      add("dt", stats, label);
      this.fields[key] = add("dd", stats, "—");
    }
    this.plots = [];
    for (const [key, label, unit] of [
      ["jsMs", "Trabajo JS / intervalo", "ms"],
      ["activityPercent", "Ocupación JS · no CPU del proceso", "%"],
      ["heapMiB", "Heap navegador · no RAM de TubeMod", "MiB"],
    ]) {
      const figure = add("figure", panel);
      const caption = add("figcaption", figure);
      add("span", caption, label);
      const value = add("span", caption, "—");
      const canvas = add("canvas", figure, "", { tabindex: "0", role: "img", "aria-label": `${label}. Usa las flechas para consultar las muestras.` });
      const readout = add("div", figure, "Sin muestras. Pulsa Medir filtros o navega por YouTube.", { class: "readout" });
      const plot = { key, unit, canvas, value, readout, hoverIndex: null };
      canvas.addEventListener("pointermove", (event) => {
        const bounds = canvas.getBoundingClientRect();
        const samples = this.visibleSamples();
        plot.hoverIndex = Math.max(0, Math.min(samples.length - 1, Math.round((event.clientX - bounds.left - 32) / (bounds.width - 40) * (samples.length - 1))));
        this.drawPlot(plot, samples);
      });
      canvas.addEventListener("pointerleave", () => { plot.hoverIndex = null; this.drawPlot(plot, this.visibleSamples()); });
      canvas.addEventListener("keydown", (event) => {
        if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
        event.preventDefault();
        const samples = this.visibleSamples();
        plot.hoverIndex = Math.max(0, Math.min(samples.length - 1, (plot.hoverIndex ?? samples.length - 1) + (event.key === "ArrowLeft" ? -1 : 1)));
        this.drawPlot(plot, samples);
      });
      this.plots.push(plot);
    }
    const data = add("details", panel);
    add("summary", data, "Muestras y registros");
    const tableBox = add("div", data, "", { class: "table" });
    const table = add("table", tableBox);
    const row = add("tr", add("thead", table));
    for (const label of ["s", "JS ms", "% JS", "Heap MiB"]) add("th", row, label);
    this.tableBody = add("tbody", table);
    this.logView = add("pre", data, "Sin operaciones registradas.", { class: "notes" });
    const notes = add("details", panel);
    add("summary", notes, "Qué mide y cómo comparar");
    const explanation = add("div", notes, "", { class: "notes" });
    for (const text of [
      "No actives otra copia de TubeMod al mismo tiempo. Si comparas versiones, importa la misma configuración y repite el mismo recorrido de navegación y scroll. Reinicia la medición antes de cada recorrido.",
      "JS: ejecución síncrona de los métodos instrumentados, sin sumar llamadas anidadas. Excluye esperas, pintura, layout y filtrado CSS nativo. Un tiempo bajo de JS no demuestra que el coste total del navegador sea cero.",
      "Ocupación: JS medido dividido por el tiempo del intervalo. No es un porcentaje de CPU del proceso ni de toda la extensión.",
      "Heap: API orientativa de Chromium, posiblemente compartida con otros contextos. No mide RAM de TubeMod. Si Firefox u otro navegador no lo expone, aparece N/D.",
      "Las tareas largas pertenecen a la página, no necesariamente a TubeMod. El panel añade trabajo: se muestra el coste de su último refresco. Con el diagnóstico apagado no hay instrumentación ni muestreo.",
      "Se guardan como máximo 120 muestras, 100 registros y 300 tiempos en esta pestaña. Nada se envía a un servidor. La exportación no incluye la URL, títulos ni términos de búsqueda.",
    ]) add("p", explanation, text);
    this.status = add("p", panel, "Muestreo cada segundo; se suspende en pestañas ocultas.", { class: "status", role: "status" });
    document.body.appendChild(this.host);
  },

  visibleSamples() {
    const latest = this.samples.at(-1)?.elapsedMs || 0;
    return this.samples.filter((sample) => sample.elapsedMs >= latest - this.range * 1000);
  },

  format(value, unit = "") {
    return typeof value === "number" && Number.isFinite(value) ? `${value.toFixed(2)}${unit ? ` ${unit}` : ""}` : "N/D";
  },

  drawPlot(plot, samples) {
    const { canvas, key, unit } = plot;
    const width = canvas.clientWidth || 360;
    const height = 62;
    const ratio = devicePixelRatio || 1;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    const context = canvas.getContext("2d");
    context.scale(ratio, ratio);
    const colors = getComputedStyle(canvas.closest(".panel"));
    const ink = colors.getPropertyValue("--secondary").trim();
    const series = matchMedia("(forced-colors: active)").matches ? "CanvasText" : colors.getPropertyValue("--series").trim();
    const values = samples.map((sample) => sample[key]).filter((value) => typeof value === "number");
    const maximum = Math.max(key === "heapMiB" ? 1 : 0.1, ...values) * 1.1;
    context.font = "10px monospace";
    context.fillStyle = ink;
    context.fillText(values.length ? maximum.toFixed(maximum >= 10 ? 0 : 1) : "—", 0, 12);
    context.fillText("0", 0, height - 6);
    context.strokeStyle = colors.getPropertyValue("--grid").trim();
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(32, height - 10);
    context.lineTo(width - 8, height - 10);
    context.stroke();
    const first = samples[0]?.elapsedMs || 0;
    const span = Math.max(1000, (samples.at(-1)?.elapsedMs || 0) - first);
    const x = (sample) => 32 + (sample.elapsedMs - first) / span * (width - 40);
    const y = (value) => height - 10 - value / maximum * (height - 22);
    context.strokeStyle = series;
    context.lineWidth = 2;
    context.lineJoin = "round";
    context.beginPath();
    let connected = false;
    for (const sample of samples) {
      if (sample[key] === null) { connected = false; continue; }
      if (connected) context.lineTo(x(sample), y(sample[key]));
      else context.moveTo(x(sample), y(sample[key]));
      connected = true;
    }
    context.stroke();
    const last = samples.at(-1);
    plot.value.textContent = this.format(last?.[key], unit);
    const selected = samples[plot.hoverIndex ?? samples.length - 1];
    if (selected && typeof selected[key] === "number") {
      context.strokeStyle = ink;
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(x(selected), 10);
      context.lineTo(x(selected), height - 10);
      context.stroke();
      context.fillStyle = series;
      context.beginPath();
      context.arc(x(selected), y(selected[key]), 4, 0, Math.PI * 2);
      context.fill();
      plot.readout.textContent = `${(selected.elapsedMs / 1000).toFixed(1)} s · ${this.format(selected[key], unit)} · eje desde 0`;
    } else {
      plot.readout.textContent = samples.length ? "El navegador no expone este dato." : "Sin muestras. Pulsa Medir filtros o navega por YouTube.";
    }
  },

  render() {
    if (!this.host) return;
    const manager = tubeMod.elementManager;
    const active = manager.elements.filter((element) => element.checked &&
      (!element.pageTypes.length || element.pageTypes.includes(getCurrentPageType())));
    const css = active.filter((element) => element.cssSelector).length;
    this.fields.rules.textContent = `${css} / ${active.length - css}`;
    this.fields.observer.textContent = manager.observer ? "conectado" : "desconectado";
    const sorted = [...this.durations].sort((a, b) => a - b);
    const average = sorted.length ? sorted.reduce((sum, value) => sum + value, 0) / sorted.length : null;
    const p95 = sorted.length ? sorted[Math.ceil(sorted.length * 0.95) - 1] : null;
    this.fields.apply.textContent = this.format(this.lastApplicationMs, "ms");
    this.fields.batch.textContent = this.format(this.lastBatchMs, "ms");
    this.fields.time.textContent = `${this.format(this.durations.at(-1))} / ${this.format(average)} / ${this.format(p95)} ms`;
    this.fields.queries.textContent = `${this.counters.globalQueries} / ${this.counters.scopedQueries}`;
    this.fields.nodes.textContent = String(this.counters.matchedNodes);
    this.fields.longTasks.textContent = this.longTasksSupported ? `${this.longTasks} · ${this.format(this.longTaskMs, "ms")}` : "N/D";
    this.fields.ui.textContent = this.format(this.uiMs, "ms");
    this.fields.errors.textContent = String(this.counters.errors);
    const samples = this.visibleSamples();
    this.plots.forEach((plot) => this.drawPlot(plot, samples));
    if (this.tableBody.parentElement.closest("details").open) {
      this.tableBody.replaceChildren();
      for (const sample of samples.slice(-30).reverse()) {
        const row = document.createElement("tr");
        for (const value of [sample.elapsedMs / 1000, sample.jsMs, sample.activityPercent, sample.heapMiB]) {
          const cell = document.createElement("td");
          cell.textContent = this.format(value);
          row.appendChild(cell);
        }
        this.tableBody.appendChild(row);
      }
    }
    this.logView.textContent = this.logs.slice(-8).reverse().map((log) =>
      `${(log.elapsedMs / 1000).toFixed(1)}s ${log.operation} ${log.durationMs.toFixed(2)}ms${log.error ? ` ${log.error}` : ""}`).join("\n") || "Sin operaciones registradas.";
  },
};

chrome.storage.local.get(["tubemod_debug_enabled"], (result) => {
  if (!chrome.runtime.lastError) tubeModDiagnostics.setActive(result.tubemod_debug_enabled === true);
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.tubemod_debug_enabled) {
    tubeModDiagnostics.setActive(changes.tubemod_debug_enabled.newValue === true);
  }
});
window.addEventListener("keydown", (event) => {
  if (event.key === "F3" && !event.repeat && !event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey) {
    event.preventDefault();
    tubeModDiagnostics.setEnabled(!tubeModDiagnostics.desiredEnabled);
  }
}, true);
window.addEventListener("pagehide", () => tubeModDiagnostics.setActive(false));
window.addEventListener("pageshow", () => {
  chrome.storage.local.get(["tubemod_debug_enabled"], (result) => {
    if (!chrome.runtime.lastError) tubeModDiagnostics.setActive(result.tubemod_debug_enabled === true);
  });
});
