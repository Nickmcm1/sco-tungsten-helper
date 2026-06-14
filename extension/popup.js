"use strict";

const CACHE_KEY = "tungsten_po_names";
const OPTS_KEY = "tungsten_po_options";

const autoRun = document.getElementById("autoRun");
const showProgram = document.getElementById("showProgram");
const showBuyerContact = document.getElementById("showBuyerContact");
const countEl = document.getElementById("count");

function load() {
  chrome.storage.local.get([CACHE_KEY, OPTS_KEY], (res) => {
    const opts =
      res[OPTS_KEY] || { autoRun: true, showProgram: false, showBuyerContact: false };
    autoRun.checked = opts.autoRun !== false;
    showProgram.checked = !!opts.showProgram;
    showBuyerContact.checked = !!opts.showBuyerContact;
    const cache = res[CACHE_KEY] || {};
    const named = Object.values(cache).filter((e) => e && e.name).length;
    countEl.textContent = named;
  });
}

function saveOpts() {
  chrome.storage.local.set({
    [OPTS_KEY]: {
      autoRun: autoRun.checked,
      showProgram: showProgram.checked,
      showBuyerContact: showBuyerContact.checked,
    },
  });
}

autoRun.addEventListener("change", saveOpts);
showProgram.addEventListener("change", saveOpts);
showBuyerContact.addEventListener("change", saveOpts);

document.getElementById("clear").addEventListener("click", () => {
  chrome.storage.local.set({ [CACHE_KEY]: {} }, load);
});

document.getElementById("donate").addEventListener("click", () => {
  chrome.tabs.create({ url: "https://buymeacoffee.com/nmcmillen27" });
  window.close();
});

document.getElementById("privacy").addEventListener("click", (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: chrome.runtime.getURL("privacy.html") });
  window.close();
});

document.getElementById("rescan").addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab && tab.id != null) {
    chrome.tabs.sendMessage(tab.id, { type: "rescan" }, () => void chrome.runtime.lastError);
  }
  window.close();
});

load();
