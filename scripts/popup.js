let inputs = document.querySelectorAll('input[type="checkbox"]:not(#tubemod-debug)');
let collapsibleElements = document.getElementsByClassName("collapsible");

document.addEventListener("DOMContentLoaded", () => {
  chrome.storage.local.get(["tubemod_elements", "tubemod_debug_enabled"], (result) => {
    const debugInput = document.getElementById("tubemod-debug");
    if (chrome.runtime.lastError) {
      document.getElementById("diagnostics-error").textContent = "No se pudo leer la configuración. Cierra y vuelve a abrir el panel.";
      return;
    }
    debugInput.checked = result.tubemod_debug_enabled === true;
    debugInput.disabled = false;
    const elements = result.tubemod_elements
      ? JSON.parse(result.tubemod_elements)
      : null;

    if (elements !== null) {
      elements.forEach((element) => {
        if (document.getElementById(element.id)) {
          document.getElementById(element.id).checked = element.checked;
        }
      });
    }

    for (i = 0; i < collapsibleElements.length; i++) {
      collapsibleElements[i].addEventListener("click", function () {
        this.classList.toggle("active");
        var content = this.nextElementSibling;
        if (content.style.display === "block") {
          content.style.display = "none";
        } else {
          content.style.display = "block";
        }
      });
    }

    inputs.forEach((element) => {
      element.addEventListener("change", () => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          chrome.tabs.sendMessage(tabs[0].id, {
            action: {
              target: element.id,
              hide: element.checked,
            },
          });
        });
      });
    });
  });
});

chrome.runtime.onMessage.addListener(function (message) {
  if (message.type === "popup") {
    chrome.storage.local.set({ elements: JSON.stringify(message.data) });
  }
});

document.getElementById("reset-settings").addEventListener("click", () => {
  chrome.storage.local.clear(() => {
    console.info("Settings cleared.");
  });
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    chrome.tabs.sendMessage(tabs[0].id, {
      action: "clearLocalStorage",
    });
  });
  window.close();
});

document.getElementById("save-settings").addEventListener("click", () => {
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    chrome.tabs.sendMessage(tabs[0].id, {
      action: "saveSettings",
    });
  });
});

document.getElementById("import-settings").addEventListener("click", () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.tabs.create({
      url: chrome.runtime.getURL(`public/import.html?tabId=${tabs[0].id}`),
    });
  });
});

document.getElementById("tubemod-debug").addEventListener("change", (event) => {
  const enabled = event.target.checked;
  const status = document.getElementById("diagnostics-error");
  chrome.storage.local.set({ tubemod_debug_enabled: enabled }, () => {
    if (chrome.runtime.lastError) {
      event.target.checked = !enabled;
      status.textContent = "No se pudo guardar el ajuste de diagnóstico. Vuelve a intentarlo.";
    } else {
      status.textContent = enabled ? "Diagnóstico activado en las pestañas de YouTube." : "Diagnóstico desactivado.";
    }
  });
});
