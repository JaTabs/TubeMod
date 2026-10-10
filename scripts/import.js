const fileInput = document.getElementById("import-settings");
const status = document.getElementById("import-status");
const targetTab = new URLSearchParams(window.location.search).get("tabId");
const tabId = Number(targetTab);

fileInput.addEventListener("change", async (event) => {
  const file = event.target.files.item(0);
  if (!file) return;

  if (targetTab === null || !Number.isInteger(tabId) || tabId < 0) {
    status.textContent = "Abre la importación desde el panel de TubeMod en una pestaña de YouTube.";
    fileInput.value = "";
    return;
  }

  fileInput.disabled = true;
  status.textContent = "Importando configuración…";
  try {
    const text = await file.text();
    chrome.tabs.sendMessage(tabId, {
      action: "importSettings",
      content: text,
    }, (response) => {
      fileInput.disabled = false;
      if (chrome.runtime.lastError) {
        status.textContent = "No se pudo conectar con TubeMod en YouTube. Recarga la pestaña de YouTube y vuelve a abrir la importación desde el panel.";
      } else if (response?.error) {
        status.textContent = response.error;
      } else if (response?.success) {
        status.textContent = "Configuración importada. YouTube se recargará para aplicarla. Ya puedes cerrar esta página.";
      } else {
        status.textContent = "No se recibió confirmación. Recarga la extensión y la pestaña de YouTube y vuelve a intentarlo.";
      }
    });
  } catch (error) {
    fileInput.disabled = false;
    status.textContent = "No se pudo leer el archivo de configuración. Vuelve a seleccionarlo.";
  } finally {
    fileInput.value = "";
  }
});
