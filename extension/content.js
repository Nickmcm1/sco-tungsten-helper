/*
 * Tungsten PO Student Names — content script
 *
 * Adds the student (Participant) name under each PO number in the
 * "Active purchase orders" grid. For each PO it opens a fresh, independent
 * session (same-origin, cookies included), replays the user's search, opens
 * the one PO to obtain its POFlip.aspx URL, fetches that PO page's HTML, and
 * parses out the Participant name (plus optional program / buyer contact).
 * The visible page is never navigated, so the user's filters are preserved.
 */
(function () {
  "use strict";

  const GRID_ID = "mp_mc_rgPO_ctl00";
  const CACHE_KEY = "tungsten_po_names";
  const OPTS_KEY = "tungsten_po_options";
  const LOG = "[Tungsten PO Names]";
  const FETCH_GAP_MS = 250; // politeness delay between PO lookups

  // Lines that are NOT a participant name (appear in every PO PDF).
  const NAME_BLACKLIST = [
    "THE DISTRICT BOARD OF TRUSTEES",
    "INVOICES MUST BE SUBMITTED",
    "DO NOT MAIL OR FAX",
    "VA FSC VBA VRE",
    "ADDITIONAL INFORMATION",
    "PO HEADER TEXT",
    "ELECTRONICALLY",
    "FINANCIAL SERVICE CENTER",
    "UNITED STATES",
  ];

  if (window.__tungstenPoNamesLoaded) return; // guard against double-injection

  // The legacy PO grid usually loads AFTER this script runs: the new portal
  // embeds PoHome.aspx in an iframe that populates asynchronously, and even on
  // the standalone legacy page the RadGrid can render after document_idle. So
  // `grid` is resolved lazily in boot(), which retries until the grid appears
  // (see waitForGrid at the bottom). Capturing it once at top-level was the bug
  // that made the extension silently do nothing.
  let grid = null;
  let options = { autoRun: true, showProgram: false, showBuyerContact: false };
  let cache = {};
  let running = false;

  /* ---------------- storage helpers ---------------- */

  function loadState() {
    return new Promise((resolve) => {
      chrome.storage.local.get([CACHE_KEY, OPTS_KEY], (res) => {
        cache = res[CACHE_KEY] || {};
        options = Object.assign(options, res[OPTS_KEY] || {});
        resolve();
      });
    });
  }

  function saveCache() {
    chrome.storage.local.set({ [CACHE_KEY]: cache });
  }

  // React live to popup changes (clear cache, toggle options, re-scan).
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes[CACHE_KEY]) {
      cache = changes[CACHE_KEY].newValue || {};
      renderAll();
    }
    if (changes[OPTS_KEY]) {
      options = Object.assign(options, changes[OPTS_KEY].newValue || {});
      renderAll();
    }
  });

  chrome.runtime.onMessage?.addListener((msg) => {
    if (msg && msg.type === "rescan") run(true);
  });

  /* ---------------- DOM helpers ---------------- */

  function dataRows() {
    if (!grid) return [];
    return Array.from(
      grid.querySelectorAll('tr[id^="' + GRID_ID + '__"]')
    );
  }

  function poNumberOf(row) {
    const a = row.querySelector('a[aria-label^="PO number"]');
    if (!a) return null;
    const m = a.getAttribute("aria-label").match(/PO number\s+(\S+)/);
    return m ? m[1] : (a.textContent || "").trim() || null;
  }

  function poCellOf(row) {
    const a = row.querySelector('a[aria-label^="PO number"]');
    return a ? a.closest("td") : null;
  }

  // The ScriptManager unique id is needed for the async-postback body. It is
  // registered in a page script via PageRequestManager._initialize('<id>', …).
  let _smName = null;
  function scriptManagerName() {
    if (_smName) return _smName;
    for (const s of document.querySelectorAll("script")) {
      const m = (s.textContent || "").match(
        /PageRequestManager\._initialize\(\s*'([^']+)'/
      );
      if (m) {
        _smName = m[1];
        return _smName;
      }
    }
    _smName = "mp$sm1"; // observed default on this portal
    return _smName;
  }

  function ensureSlot(row) {
    const cell = poCellOf(row);
    if (!cell) return null;
    let slot = cell.querySelector(".tpn-name");
    if (!slot) {
      slot = document.createElement("div");
      slot.className = "tpn-name";
      cell.appendChild(slot);
    }
    return slot;
  }

  function renderRow(row) {
    const slot = ensureSlot(row);
    if (!slot) return;
    const po = poNumberOf(row);
    const entry = po && cache[po];
    if (entry && entry.name) {
      slot.classList.remove("tpn-pending", "tpn-error");
      slot.classList.add("tpn-ready");
      slot.textContent = entry.name;
      if (options.showProgram && entry.program) {
        const p = document.createElement("span");
        p.className = "tpn-program";
        p.textContent = entry.program;
        slot.appendChild(p);
      }
      if (options.showBuyerContact && entry.buyerContact) {
        const c = document.createElement("span");
        c.className = "tpn-contact";
        c.textContent = entry.buyerContact;
        slot.appendChild(c);
      }
      slot.title = [entry.name, entry.program, entry.buyerContact]
        .filter(Boolean)
        .join(" — ");
    } else if (entry && entry.error) {
      slot.className = "tpn-name tpn-error";
      slot.textContent = "?";
      slot.title =
        "Could not read the name automatically.\nRaw text sample:\n" +
        (entry.sample || "");
    } else if (!slot.textContent) {
      slot.classList.add("tpn-idle");
    }
  }

  function renderAll() {
    dataRows().forEach(renderRow);
  }

  /* ---------------- toolbar / progress ---------------- */

  let bar, status, btn;

  function buildToolbar() {
    if (bar && bar.isConnected) return; // self-heal if a postback detached it
    bar = document.createElement("div");
    bar.className = "tpn-bar";

    btn = document.createElement("button");
    btn.type = "button";
    btn.className = "tpn-btn";
    btn.textContent = "Load student names";
    btn.addEventListener("click", () => {
      console.log(LOG, "Load button clicked");
      run(false).catch((e) => {
        console.error(LOG, "run failed", e);
        setStatus("Error: " + (e && e.message ? e.message : e), false);
        running = false;
      });
    });

    const rescan = document.createElement("button");
    rescan.type = "button";
    rescan.className = "tpn-btn tpn-btn-secondary";
    rescan.textContent = "Re-scan";
    rescan.title = "Ignore cache and re-read every PO on this page";
    rescan.addEventListener("click", () => run(true));

    status = document.createElement("span");
    status.className = "tpn-status";

    bar.appendChild(btn);
    bar.appendChild(rescan);
    bar.appendChild(status);

    const anchor =
      document.getElementById("mp_mc_divContent") ||
      grid.parentElement ||
      grid;
    anchor.parentElement.insertBefore(bar, anchor);
  }

  function setStatus(text, busy) {
    if (status) status.textContent = text || "";
    if (btn) btn.disabled = !!busy;
  }

  /* ---------------- PO fetch + parse ---------------- */

  // Opening a PO is a single-use action: the server consumes the page's
  // view-state and responds with a terminal redirect to POFlip.aspx (the PO
  // page). A second open from the same view-state is rejected. So we cannot
  // loop opens against the live page. Instead, for EACH PO we start a fresh,
  // independent session: GET PoHome (fresh view-state) -> replay the user's
  // search to load the filtered grid -> open that one PO -> GET the POFlip
  // HTML. This never touches or navigates the visible page.

  const FILTER_TARGET = "mp$mc$btnRunFilter";
  // The fields that carry the user's current search (customer, dates, status).
  const FILTER_FIELD_NAMES = [
    "mp$mc$ddlFilterCustomer",
    "mp$mc$hdnFilterCustomer",
    "mp$mc$txtPoNumber",
    "mp$mc$ddlFilterStatus",
    "mp$mc$ddlPOConvertStatus",
    "mp$mc$ddlDateRange",
    "mp$mc$ucDateRange$jqStartDate",
    "mp$mc$ucDateRange$jqEndDate",
    "mp$mc$ucPOFilter$ddlCountry",
    "mp$mc$ucPOFilter$ddlState",
    "mp$mc$ucPOFilter$txtVatReg",
  ];

  function parseHtml(s) {
    return new DOMParser().parseFromString(s, "text/html");
  }

  // Collect submittable name/value pairs from a form/doc, excluding buttons
  // (a real __doPostBack submits no button values).
  function fieldsFromDoc(root) {
    const out = [];
    root
      .querySelectorAll("input[name], select[name], textarea[name]")
      .forEach((el) => {
        if ((el.type === "checkbox" || el.type === "radio") && !el.checked)
          return;
        if (
          el.type === "submit" ||
          el.type === "button" ||
          el.type === "image" ||
          el.type === "reset"
        )
          return;
        out.push([el.name, el.value]);
      });
    return out;
  }

  // The user's current search selections, read from the live form.
  function captureFilterVals() {
    const form = document.getElementById("aspnetForm");
    const vals = {};
    FILTER_FIELD_NAMES.forEach((n) => {
      const el = form.querySelector('[name="' + CSS.escape(n) + '"]');
      if (el) vals[n] = el.value;
    });
    return vals;
  }

  // Parse an MS-Ajax delta (length-prefixed `len|type|id|content|` tuples) into
  // its hidden fields and update-panel HTML.
  function parseDelta(text) {
    const hidden = {};
    const panels = {};
    let i = 0;
    while (i < text.length) {
      const j = text.indexOf("|", i);
      if (j < 0) break;
      const len = parseInt(text.slice(i, j), 10);
      if (isNaN(len)) break;
      const k = text.indexOf("|", j + 1);
      if (k < 0) break;
      const type = text.slice(j + 1, k);
      const l = text.indexOf("|", k + 1);
      if (l < 0) break;
      const id = text.slice(k + 1, l);
      const content = text.substr(l + 1, len);
      if (type === "hiddenField") hidden[id] = content;
      else if (type === "updatePanel") panels[id] = content;
      i = l + 1 + len + 1;
    }
    return { hidden, panels };
  }

  function buildBody(fields, overrides, target) {
    const ov = Object.assign({}, overrides || {});
    const params = new URLSearchParams();
    for (const [k, v] of fields) {
      if (k in ov) {
        params.append(k, ov[k]);
        delete ov[k];
      } else {
        params.append(k, v);
      }
    }
    for (const k in ov) params.append(k, ov[k]);
    const sm = scriptManagerName();
    params.set(sm, sm + "|" + target);
    params.set("__EVENTTARGET", target);
    params.set("__EVENTARGUMENT", "");
    params.set("__ASYNCPOST", "true");
    return params.toString();
  }

  function postBack(action, body) {
    return fetch(action, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "X-MicrosoftAjax": "Delta=true",
        "X-Requested-With": "XMLHttpRequest",
      },
      body,
    });
  }

  function poTargetFromDoc(doc, po) {
    const link = Array.from(
      doc.querySelectorAll('a[aria-label^="PO number"]')
    ).find((a) => (a.textContent || "").trim() === String(po));
    if (!link) return null;
    const m = (link.getAttribute("href") || "").match(
      /__doPostBack\('([^']+)'/
    );
    return m ? m[1] : null;
  }

  function poFlipUrlFromDelta(text, action) {
    const enc = text.match(/POFlip\.aspx(?:%3f|\?)[^|"'<>\s]+/i);
    if (enc) return new URL(decodeURIComponent(enc[0]), action).href;
    const plain = text.match(/POFlip\.aspx\?[^|"'<>\s]+/i);
    if (plain) return new URL(plain[0].replace(/&amp;/g, "&"), action).href;
    return null;
  }

  // Fetch the POFlip HTML for one PO via a fresh, independent session.
  async function fetchPoHtml(po) {
    const action = document.getElementById("aspnetForm").action;
    const filterVals = captureFilterVals();

    // 1) fresh GET → unused view-state
    const getDoc = parseHtml(
      await (await fetch(action, { credentials: "include" })).text()
    );
    const baseFields = fieldsFromDoc(getDoc);

    // 2) replay the user's search to populate the grid
    const searchText = await (
      await postBack(action, buildBody(baseFields, filterVals, FILTER_TARGET))
    ).text();
    const searchDelta = parseDelta(searchText);
    const gridDoc = parseHtml(Object.values(searchDelta.panels).join("\n"));
    const target = poTargetFromDoc(gridDoc, po);
    if (!target) throw new Error("PO " + po + " not found after search");

    // carry the refreshed view-state from the search delta into the open
    const openFields = baseFields.map(([k, v]) => [
      k,
      k in searchDelta.hidden ? searchDelta.hidden[k] : v,
    ]);

    // 3) open the PO → POFlip URL (with server-minted Hash) in the delta
    const openText = await (
      await postBack(action, buildBody(openFields, filterVals, target))
    ).text();
    const url = poFlipUrlFromDelta(openText, action);
    if (!url) throw new Error("No POFlip redirect for PO " + po);

    // 4) fetch the PO page itself
    return await (await fetch(url, { credentials: "include" })).text();
  }

  // Accepts multi-word names including single-letter initials (e.g. "ALEXANDER
  // M HEDGECOCK") and accented letters (e.g. "JOSÉ NÚÑEZ").
  function looksLikeName(s) {
    return /^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ.'-]*(?:\s+[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ.'-]*){1,4}$/.test(
      s
    );
  }

  // The portal hides email addresses with Cloudflare email-protection: the real
  // address is hex in a <a class="__cf_email__" data-cfemail="…"> and shown as
  // "[email protected]". First hex byte is the XOR key for the rest.
  function cfDecodeEmail(hex) {
    try {
      const key = parseInt(hex.substr(0, 2), 16);
      let out = "";
      for (let i = 2; i < hex.length; i += 2) {
        out += String.fromCharCode(parseInt(hex.substr(i, 2), 16) ^ key);
      }
      return out;
    } catch (e) {
      return "";
    }
  }

  // Text of a cell with any Cloudflare-protected emails decoded in place.
  function cellTextDecoded(td) {
    if (!td) return "";
    const clone = td.cloneNode(true);
    clone.querySelectorAll("a.__cf_email__[data-cfemail]").forEach((a) => {
      const dec = cfDecodeEmail(a.getAttribute("data-cfemail"));
      a.replaceWith(clone.ownerDocument.createTextNode(dec));
    });
    return clone.textContent.replace(/\s+/g, " ").trim();
  }

  // Parse the participant name + approved program out of the POFlip PO page.
  // The page shows the name two ways: a prominent "Participant" header block,
  // and a "Name" row in the ADDITIONAL INFORMATION table. We try both.
  function extractFromHtml(html) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const tds = Array.from(doc.querySelectorAll("td"));
    const txt = (el) => (el ? el.textContent.replace(/\s+/g, " ").trim() : "");
    const isBad = (s) =>
      !s ||
      NAME_BLACKLIST.some((b) => s.toUpperCase().includes(b)) ||
      /\d/.test(s) ||
      /[@~]/.test(s);

    let name = null;

    // Strategy 1: the "Participant" header, value in a following cell.
    const partIdx = tds.findIndex((td) => txt(td) === "Participant");
    if (partIdx !== -1) {
      for (let i = partIdx + 1; i < Math.min(tds.length, partIdx + 6); i++) {
        const s = txt(tds[i]);
        if (looksLikeName(s) && !isBad(s)) {
          name = s;
          break;
        }
      }
    }

    // Strategy 2: the "Name" label row -> the adjacent value cell.
    if (!name) {
      const label = tds.find((td) => txt(td) === "Name");
      if (label) {
        const s = txt(label.nextElementSibling);
        if (looksLikeName(s) && !isBad(s)) name = s;
      }
    }

    // Program: "Veteran approved for <program>".
    let program = null;
    const full = doc.body ? doc.body.textContent : html;
    const pm = full.match(/Veteran approved for\s+([^\n<]+)/i);
    if (pm) program = pm[1].replace(/\s+/g, " ").trim();

    // BuyerContacts: the VA contact. The cell is like "VA FSC VBA <email>" with
    // the email Cloudflare-obfuscated; decode it and keep just the address
    // (the decoded text also carries separator artifacts we don't want).
    let buyerContact = null;
    const bcLabel = tds.find((td) => txt(td) === "BuyerContacts");
    if (bcLabel) {
      const decoded = cellTextDecoded(bcLabel.nextElementSibling);
      const em = decoded.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
      if (em) buyerContact = em[0];
      else if (decoded)
        buyerContact = decoded.replace(/[~]+/g, " ").replace(/\s+/g, " ").trim();
    }

    const sample = (full || "").replace(/\s+/g, " ").trim().slice(0, 200);
    return { name, program, buyerContact, sample };
  }

  /* ---------------- orchestration ---------------- */

  async function run(force) {
    if (!grid || running) return;
    running = true;
    buildToolbar();

    const rows = dataRows();
    console.log(LOG, "run(force=" + !!force + ") — data rows:", rows.length);
    if (rows.length === 0) {
      setStatus("No PO rows found on this page.", false);
      running = false;
      return;
    }
    const todo = rows.filter((row) => {
      const po = poNumberOf(row);
      if (!po) return false;
      if (force) return true;
      const e = cache[po];
      return !(e && (e.name || e.error));
    });

    if (todo.length === 0) {
      setStatus("All names loaded.", false);
      running = false;
      return;
    }

    let done = 0;
    for (const row of todo) {
      const po = poNumberOf(row);
      const slot = ensureSlot(row);
      if (slot) {
        slot.className = "tpn-name tpn-pending";
        slot.textContent = "…";
      }
      setStatus("Loading names… " + (done + 1) + " of " + todo.length, true);

      try {
        const html = await fetchPoHtml(po);
        const { name, program, buyerContact, sample } = extractFromHtml(html);
        if (name) {
          cache[po] = {
            name,
            program: program || null,
            buyerContact: buyerContact || null,
          };
        } else {
          cache[po] = { error: true, sample };
        }
      } catch (err) {
        console.warn(LOG, "PO", po, "failed:", err);
        cache[po] = { error: true, sample: String(err && err.message || err) };
      }
      saveCache();
      renderRow(row);
      done++;
      if (done < todo.length) await sleep(FETCH_GAP_MS);
    }

    setStatus("Done — " + done + " of " + todo.length + " loaded.", false);
    running = false;
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  /* ---------------- page-change handling ---------------- */

  // Watch a STABLE container, not the grid's tbody. "Get my POs" (and paging)
  // triggers an ASP.NET postback that replaces the entire grid table, which
  // would kill an observer attached to the old tbody. The form element
  // persists across these updates, so we observe it and re-resolve the grid on
  // every change.
  function watchGrid() {
    const root = document.getElementById("aspnetForm") || document.body;
    if (!root || root.__tpnObserved) return;
    root.__tpnObserved = true;
    let timer = null;
    const obs = new MutationObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const g = document.getElementById(GRID_ID);
        if (g) grid = g; // grab the freshly rendered grid after a postback
        buildToolbar(); // rebuilds if a postback detached the toolbar
        renderAll();
        if (options.autoRun) run(false);
      }, 400);
    });
    obs.observe(root, { childList: true, subtree: true });
  }

  /* ---------------- init ---------------- */

  // Try to start. Returns true once the grid exists and we've booted.
  function boot() {
    if (window.__tungstenPoNamesLoaded) return true;
    const found = document.getElementById(GRID_ID);
    if (!found) return false;
    if (!document.getElementById("aspnetForm")) {
      console.warn(LOG, "grid found but no #aspnetForm — cannot post back.");
      return false;
    }

    grid = found;
    window.__tungstenPoNamesLoaded = true;
    console.log(
      LOG,
      "active on",
      location.href,
      "| frame:",
      window.top !== window.self
    );

    loadState().then(() => {
      buildToolbar();
      renderAll();
      watchGrid();
      if (options.autoRun) run(false);
      else setStatus('Click "Load student names" to begin.', false);
    });
    return true;
  }

  // The grid can appear well after injection. Watch the DOM for it and also
  // poll as a fallback (covers cases the observer misses), giving up after
  // ~60s so we don't watch forever on pages that never have a grid.
  function waitForGrid() {
    if (boot()) return;

    const obs = new MutationObserver(() => {
      if (boot()) obs.disconnect();
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });

    let tries = 0;
    const iv = setInterval(() => {
      tries += 1;
      if (boot() || tries > 120) {
        clearInterval(iv);
        obs.disconnect();
      }
    }, 500);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", waitForGrid);
  } else {
    waitForGrid();
  }
})();
