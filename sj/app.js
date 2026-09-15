(() => {
  "use strict";

  const data = window.SJBM_DATA;
  const icons = window.SRBM_ICONS || {};
  if (!data?.bhajans?.length) return;

  const STORAGE = {
    favorites: "sj-bm:v3:favorites",
    lastBhajan: "sj-bm:v3:last-bhajan",
    preferences: "sj-bm:preferences",
  };
  const WORD_PATTERN = /[\u0900-\u0963\u0970-\u097f]+(?:[-'][\u0900-\u0963\u0970-\u097f]+)*/gu;

  const elements = {
    panel: document.getElementById("library-panel"),
    backdrop: document.getElementById("drawer-backdrop"),
    openDrawer: document.getElementById("open-drawer"),
    closeDrawer: document.getElementById("close-drawer"),
    mobileSearch: document.getElementById("mobile-search"),
    search: document.getElementById("search-input"),
    clearSearch: document.getElementById("clear-search"),
    list: document.getElementById("bhajan-list"),
    listSummary: document.getElementById("list-summary"),
    reader: document.getElementById("reader"),
    theme: document.getElementById("theme-button"),
    favorite: document.getElementById("favorite-button"),
    previous: document.getElementById("previous-bhajan"),
    next: document.getElementById("next-bhajan"),
    paginationIndex: document.getElementById("pagination-index"),
    pagePosition: document.getElementById("page-position"),
    dialog: document.getElementById("word-dialog"),
    dialogTitle: document.getElementById("word-dialog-title"),
    dialogContent: document.getElementById("word-dialog-content"),
    closeDialog: document.getElementById("close-word-dialog"),
    toast: document.getElementById("toast"),
  };

  const preferences = readJson(STORAGE.preferences, { showTransliteration: true, textScale: 1 });
  const previousFavorites = readJson("sj-bm:v2:favorites", null);
  const storedFavorites = readJson(
    STORAGE.favorites,
    previousFavorites === null
      ? migrateLegacyNumbers(readJson("sj-bm:favorites", []))
      : migratePreviousNumbers(previousFavorites),
  );
  const hashNumber = numberForRoute(location.hash.match(/^#bhajan-(.+)$/)?.[1]);
  const storedNumber = Number(
    localStorage.getItem(STORAGE.lastBhajan)
    || migratePreviousNumber(Number(localStorage.getItem("sj-bm:v2:last-bhajan")))
    || migrateLegacyNumber(Number(localStorage.getItem("sj-bm:last-bhajan"))),
  );
  const initialNumber = validNumber(hashNumber) ? hashNumber : validNumber(storedNumber) ? storedNumber : 1;
  const state = {
    currentNumber: initialNumber,
    listView: "all",
    tab: "devanagari",
    query: "",
    favorites: new Set(storedFavorites.map(Number).filter(validNumber)),
    showTransliteration: preferences.showTransliteration !== false,
    textScale: Math.min(1.3, Math.max(0.9, Number(preferences.textScale) || 1)),
    theme: preferences.theme === "dark" ? "dark" : "light",
  };

  function validNumber(value) {
    return Number.isInteger(value) && value >= 1 && value <= data.bhajans.length;
  }

  function readJson(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem(key)) ?? fallback;
    } catch {
      return fallback;
    }
  }

  function migrateLegacyNumber(number) {
    if (!Number.isInteger(number)) return 0;
    return data.bhajans.find((bhajan) => bhajan.legacy_number === number)?.number || 0;
  }

  function migrateLegacyNumbers(numbers) {
    if (!Array.isArray(numbers)) return [];
    return numbers.map(Number).map(migrateLegacyNumber).filter(Boolean);
  }

  function migratePreviousNumber(number) {
    if (!Number.isInteger(number)) return 0;
    return data.bhajans.find((bhajan) => bhajan.previous_number === number)?.number || 0;
  }

  function migratePreviousNumbers(numbers) {
    if (!Array.isArray(numbers)) return [];
    return numbers.map(Number).map(migratePreviousNumber).filter(Boolean);
  }

  function numberForRoute(route) {
    if (!route) return 0;
    return data.bhajans.find((bhajan) => bhajan.route === route)?.number || 0;
  }

  function routeForNumber(number) {
    return data.bhajans[number - 1]?.route || String(number);
  }

  function savePreferences() {
    localStorage.setItem(STORAGE.preferences, JSON.stringify({
      showTransliteration: state.showTransliteration,
      textScale: state.textScale,
      theme: state.theme,
    }));
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function normalizeSearch(value) {
    return String(value ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("es")
      .trim();
  }

  function iconMarkup(name, size = 20) {
    const nodes = icons[name] || [];
    const children = nodes.map(([tag, attributes]) => {
      const attrs = Object.entries(attributes).map(([key, value]) => `${key}="${escapeHtml(value)}"`).join(" ");
      return `<${tag} ${attrs}></${tag}>`;
    }).join("");
    return `<svg class="lucide lucide-${name.toLowerCase()}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${children}</svg>`;
  }

  function hydrateIcons(root = document) {
    root.querySelectorAll("i[data-icon]").forEach((placeholder) => {
      const wrapper = document.createElement("span");
      wrapper.innerHTML = iconMarkup(placeholder.dataset.icon, Number(placeholder.dataset.size) || 20);
      placeholder.replaceWith(wrapper.firstElementChild);
    });
  }

  function currentBhajan() {
    return data.bhajans[state.currentNumber - 1];
  }

  function applyTheme(theme) {
    state.theme = theme === "dark" ? "dark" : "light";
    document.documentElement.dataset.theme = state.theme;
    const dark = state.theme === "dark";
    elements.theme.innerHTML = iconMarkup(dark ? "Sun" : "Moon", 20);
    elements.theme.setAttribute("aria-label", dark ? "Activar modo claro" : "Activar modo oscuro");
    elements.theme.setAttribute("aria-pressed", String(dark));
    elements.theme.title = dark ? "Modo claro" : "Modo oscuro";
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#09111b" : "#eaf1f8");
  }

  function filteredBhajans() {
    const query = normalizeSearch(state.query);
    return data.bhajans.filter((bhajan) => {
      if (state.listView === "favorites" && !state.favorites.has(bhajan.number)) return false;
      if (!query) return true;
      const haystack = normalizeSearch([
        bhajan.number,
        bhajan.display_number,
        bhajan.route,
        bhajan.title,
        bhajan.title_transliteration,
        bhajan.title_es,
        bhajan.author,
        bhajan.spanish,
      ].join(" "));
      return haystack.includes(query);
    });
  }

  function renderList() {
    const bhajans = filteredBhajans();
    elements.listSummary.textContent = state.listView === "favorites"
      ? `${bhajans.length} favorito${bhajans.length === 1 ? "" : "s"}`
      : `${bhajans.length} de ${data.bhajans.length} bhajans`;
    elements.clearSearch.hidden = !state.query;

    if (!bhajans.length) {
      elements.list.innerHTML = `<div class="empty-list"><strong>Sin resultados</strong><span>${state.listView === "favorites" ? "Tus bhajans favoritos aparecerán aquí." : "Prueba con otra palabra o número."}</span></div>`;
      return;
    }

    elements.list.innerHTML = bhajans.map((bhajan) => {
      const favorite = state.favorites.has(bhajan.number);
      const active = bhajan.number === state.currentNumber;
      return `
        <div class="bhajan-row${active ? " active" : ""}" role="listitem" data-number="${bhajan.number}">
          <button class="bhajan-open" type="button" data-open-bhajan="${bhajan.number}"${active ? ' aria-current="true"' : ""}>
            <span class="bhajan-number">${String(bhajan.display_number).padStart(3, "0")}</span>
            <span class="bhajan-list-copy">
              <strong lang="hi">${escapeHtml(bhajan.title)}</strong>
              <small>${escapeHtml(bhajan.author)}</small>
            </span>
          </button>
          <button class="row-favorite${favorite ? " is-favorite" : ""}" type="button" data-favorite="${bhajan.number}" aria-label="${favorite ? "Quitar de favoritos" : "Añadir a favoritos"}" title="Favorito">
            ${iconMarkup("Star", 18)}
          </button>
        </div>`;
    }).join("");

    requestAnimationFrame(() => {
      elements.list.querySelector(".bhajan-row.active")?.scrollIntoView({ block: "nearest" });
    });
  }

  function renderCanonicalLine(line, lineIndex) {
    if (!line.words?.length) return renderClickableFallback(line.devanagari);
    let html = "";
    let cursor = 0;
    let wordIndex = 0;
    for (const match of line.devanagari.matchAll(WORD_PATTERN)) {
      html += escapeHtml(line.devanagari.slice(cursor, match.index));
      html += `<button class="word-button" type="button" data-line-index="${lineIndex}" data-word-index="${wordIndex}">${escapeHtml(match[0])}</button>`;
      cursor = match.index + match[0].length;
      wordIndex += 1;
    }
    return html + escapeHtml(line.devanagari.slice(cursor));
  }

  function renderClickableFallback(text) {
    let html = "";
    let cursor = 0;
    for (const match of text.matchAll(WORD_PATTERN)) {
      html += escapeHtml(text.slice(cursor, match.index));
      const word = match[0];
      html += `<button class="word-button" type="button" data-word="${escapeHtml(word)}">${escapeHtml(word)}</button>`;
      cursor = match.index + word.length;
    }
    return html + escapeHtml(text.slice(cursor));
  }

  function renderReader() {
    const bhajan = currentBhajan();
    const favorite = state.favorites.has(bhajan.number);
    const spanishParagraphs = (bhajan.spanish_blocks?.length ? bhajan.spanish_blocks : bhajan.spanish.split(/\n+/))
      .map((line) => line.trim()).filter(Boolean);
    const spanishNotes = (bhajan.spanish_notes || []).map((line) => line.trim()).filter(Boolean);
    const languageLabel = bhajan.source_language === "hi"
      ? "Hindi · devanagari"
      : "Punyabí · devanagari";

    elements.reader.innerHTML = `
      <header class="bhajan-header">
        <div class="bhajan-kicker">
          <span>Bhajan ${bhajan.display_number}</span>
          ${bhajan.official_duplicate_count > 1 ? `<span>Referencia repetida · ${bhajan.official_occurrence}/${bhajan.official_duplicate_count}</span>` : ""}
          ${bhajan.number_origin === "official_unnumbered" ? "<span>Número asignado</span>" : ""}
          ${bhajan.number_origin === "devanagari_only" ? "<span>Fuera de la edición española</span>" : ""}
          ${bhajan.book_page ? `<span>p. ${bhajan.book_page}</span>` : "<span>Edición española</span>"}
          <span>${languageLabel}</span>
        </div>
        <h1 lang="hi">${escapeHtml(bhajan.title)}</h1>
        <p class="title-transliteration" lang="pa-Latn">${escapeHtml(bhajan.title_transliteration)}</p>
        ${bhajan.title_es ? `<p class="title-spanish">${escapeHtml(bhajan.title_es)}</p>` : ""}
        <p class="author-line"><span>Autor</span><strong lang="hi">${escapeHtml(bhajan.author)}</strong></p>
      </header>

      <div class="reader-tabs" role="tablist" aria-label="Texto del bhajan">
        <button class="reader-tab${state.tab === "devanagari" ? " active" : ""}" type="button" role="tab" aria-selected="${state.tab === "devanagari"}" data-reader-tab="devanagari">
          <span lang="hi">देवनागरी</span>
        </button>
        <button class="reader-tab${state.tab === "spanish" ? " active" : ""}" type="button" role="tab" aria-selected="${state.tab === "spanish"}" data-reader-tab="spanish">
          <span>Español</span>
        </button>
      </div>

      <section class="tab-panel devanagari-panel"${state.tab !== "devanagari" ? " hidden" : ""} aria-label="Texto devanagari">
        <div class="reader-tools">
          <button id="toggle-transliteration" class="tool-button${state.showTransliteration ? " active" : ""}" type="button" aria-pressed="${state.showTransliteration}">
            ${iconMarkup("Languages", 18)}<span>Transliteración</span>
          </button>
          <div class="font-stepper" aria-label="Tamaño del texto">
            <button type="button" data-text-size="smaller" aria-label="Reducir texto" title="Reducir texto"${state.textScale <= 0.9 ? " disabled" : ""}>${iconMarkup("Minus", 17)}</button>
            <span aria-hidden="true">Aa</span>
            <button type="button" data-text-size="larger" aria-label="Aumentar texto" title="Aumentar texto"${state.textScale >= 1.3 ? " disabled" : ""}>${iconMarkup("Plus", 17)}</button>
          </div>
        </div>
        <div class="bhajan-lines" style="--text-scale: ${state.textScale}">
          ${bhajan.lines.map((line, index) => `
            <div class="bhajan-line${line.stanza_start && index > 0 ? " stanza-start" : ""}">
              <span class="line-number" aria-hidden="true">${index + 1}</span>
              <div>
                <p class="devanagari-line" lang="hi">${renderCanonicalLine(line, index)}</p>
                <p class="line-transliteration" lang="pa-Latn"${state.showTransliteration ? "" : " hidden"}>${escapeHtml(line.transliteration)}</p>
              </div>
            </div>`).join("")}
        </div>
      </section>

      <section class="tab-panel spanish-panel"${state.tab !== "spanish" ? " hidden" : ""} aria-label="Traducción española">
        <div class="translation-status">
          ${iconMarkup("Info", 18)}
          <span>${escapeHtml(bhajan.translation_status || "Traducción española")}</span>
        </div>
        <div class="spanish-copy">
          ${spanishParagraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("") || "<p>Traducción no disponible.</p>"}
          ${spanishNotes.length ? `<aside class="spanish-notes" aria-label="Notas de la edición oficial">${spanishNotes.map((note) => `<p>${escapeHtml(note)}</p>`).join("")}</aside>` : ""}
        </div>
      </section>`;

    elements.favorite.classList.toggle("is-favorite", favorite);
    elements.favorite.setAttribute("aria-label", favorite ? "Quitar de favoritos" : "Añadir a favoritos");
    elements.favorite.title = favorite ? "Quitar de favoritos" : "Añadir a favoritos";
    elements.previous.disabled = bhajan.number === 1;
    elements.next.disabled = bhajan.number === data.bhajans.length;
    elements.pagePosition.textContent = `${bhajan.display_number} · ${bhajan.number}/${data.bhajans.length}`;
    localStorage.setItem(STORAGE.lastBhajan, String(bhajan.number));
    window.dispatchEvent(new CustomEvent("bhajanchange", { detail: { bhajan } }));
  }

  function selectBhajan(number, pushHistory = true) {
    if (!validNumber(number)) return;
    state.currentNumber = number;
    state.tab = "devanagari";
    if (pushHistory) history.pushState({ bhajan: number }, "", `#bhajan-${routeForNumber(number)}`);
    renderList();
    renderReader();
    closeDrawer();
    document.querySelector(".reader-shell")?.scrollTo({ top: 0, behavior: "smooth" });
  }

  function toggleFavorite(number = state.currentNumber) {
    if (state.favorites.has(number)) {
      state.favorites.delete(number);
      showToast("Eliminado de favoritos");
    } else {
      state.favorites.add(number);
      showToast("Guardado en favoritos");
    }
    localStorage.setItem(STORAGE.favorites, JSON.stringify([...state.favorites].sort((a, b) => a - b)));
    renderList();
    renderReader();
  }

  function setListView(view) {
    state.listView = view;
    document.querySelectorAll("[data-list-view]").forEach((button) => {
      const active = button.dataset.listView === view;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
    });
    renderList();
  }

  function openDrawer(focusSearch = false) {
    elements.panel.classList.add("open");
    elements.backdrop.hidden = false;
    document.body.classList.add("drawer-open");
    if (focusSearch) requestAnimationFrame(() => elements.search.focus());
  }

  function closeDrawer() {
    elements.panel.classList.remove("open");
    elements.backdrop.hidden = true;
    document.body.classList.remove("drawer-open");
  }

  function openWord(word, lineIndex = null, wordIndex = null) {
    const contextualEntry = Number.isInteger(lineIndex) && Number.isInteger(wordIndex)
      ? currentBhajan().lines[lineIndex]?.words?.[wordIndex]
      : null;
    const contextual = typeof contextualEntry === "string"
      ? data.glosses[contextualEntry]
      : contextualEntry;
    const gloss = contextual || data.glosses[word] || {
      devanagari: word,
      transliteration: word,
      spanish: "Glosa no disponible",
      confidence: "Pendiente",
      source: "",
    };
    const displayWord = gloss.devanagari || word;
    const confidence = gloss.confidence || "Baja";
    elements.dialogTitle.textContent = displayWord;
    elements.dialogContent.innerHTML = `
      <div class="definition-block">
        <span>Transliteración</span>
        <strong lang="pa-Latn">${escapeHtml(gloss.transliteration)}</strong>
      </div>
      <div class="definition-block spanish-definition">
        <span>Español</span>
        <p>${escapeHtml(gloss.spanish)}</p>
      </div>
      ${gloss.lemma ? `<div class="definition-detail"><span>Verbo base</span><strong lang="hi">${escapeHtml(gloss.lemma)}</strong></div>` : ""}
      ${gloss.category ? `<div class="definition-detail"><span>Categoría</span><strong>${escapeHtml(gloss.category)}</strong></div>` : ""}
      <div class="definition-source">
        <span class="confidence confidence-${normalizeSearch(confidence)}">${escapeHtml(confidence)}</span>
        <span>${escapeHtml(gloss.source)}</span>
      </div>`;
    elements.dialog.showModal();
  }

  let toastTimer;
  function showToast(message) {
    clearTimeout(toastTimer);
    elements.toast.textContent = message;
    elements.toast.hidden = false;
    toastTimer = setTimeout(() => { elements.toast.hidden = true; }, 1800);
  }

  elements.list.addEventListener("click", (event) => {
    const open = event.target.closest("[data-open-bhajan]");
    const favorite = event.target.closest("[data-favorite]");
    if (open) selectBhajan(Number(open.dataset.openBhajan));
    if (favorite) toggleFavorite(Number(favorite.dataset.favorite));
  });

  elements.reader.addEventListener("click", (event) => {
    const word = event.target.closest(".word-button");
    const tab = event.target.closest("[data-reader-tab]");
    const textSize = event.target.closest("[data-text-size]");
    if (word) {
      const lineIndex = Number(word.dataset.lineIndex);
      const wordIndex = Number(word.dataset.wordIndex);
      openWord(
        word.dataset.word || word.textContent.trim(),
        Number.isInteger(lineIndex) ? lineIndex : null,
        Number.isInteger(wordIndex) ? wordIndex : null,
      );
    }
    if (tab) {
      state.tab = tab.dataset.readerTab;
      renderReader();
    }
    if (event.target.closest("#toggle-transliteration")) {
      state.showTransliteration = !state.showTransliteration;
      savePreferences();
      renderReader();
    }
    if (textSize) {
      const delta = textSize.dataset.textSize === "larger" ? 0.1 : -0.1;
      state.textScale = Math.round(Math.min(1.3, Math.max(0.9, state.textScale + delta)) * 10) / 10;
      savePreferences();
      renderReader();
    }
  });

  document.querySelectorAll("[data-list-view]").forEach((button) => {
    button.addEventListener("click", () => setListView(button.dataset.listView));
  });
  elements.search.addEventListener("input", () => {
    state.query = elements.search.value;
    renderList();
  });
  elements.clearSearch.addEventListener("click", () => {
    elements.search.value = "";
    state.query = "";
    renderList();
    elements.search.focus();
  });
  elements.favorite.addEventListener("click", () => toggleFavorite());
  elements.theme.addEventListener("click", () => {
    applyTheme(state.theme === "dark" ? "light" : "dark");
    savePreferences();
  });
  elements.previous.addEventListener("click", () => selectBhajan(state.currentNumber - 1));
  elements.next.addEventListener("click", () => selectBhajan(state.currentNumber + 1));
  elements.paginationIndex.addEventListener("click", () => openDrawer());
  elements.openDrawer.addEventListener("click", () => openDrawer());
  elements.closeDrawer.addEventListener("click", closeDrawer);
  elements.backdrop.addEventListener("click", closeDrawer);
  elements.mobileSearch.addEventListener("click", () => openDrawer(true));
  elements.closeDialog.addEventListener("click", () => elements.dialog.close());
  elements.dialog.addEventListener("click", (event) => {
    const rect = elements.dialog.getBoundingClientRect();
    const inside = event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
    if (!inside) elements.dialog.close();
  });
  window.addEventListener("popstate", () => {
    const number = numberForRoute(location.hash.match(/^#bhajan-(.+)$/)?.[1]);
    if (validNumber(number)) selectBhajan(number, false);
  });
  window.addEventListener("resize", () => {
    if (window.innerWidth >= 1024) closeDrawer();
  });

  hydrateIcons();
  applyTheme(state.theme);
  renderList();
  renderReader();
  if (!location.hash) history.replaceState({ bhajan: state.currentNumber }, "", `#bhajan-${routeForNumber(state.currentNumber)}`);

  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    window.addEventListener("load", async () => {
      const hadController = Boolean(navigator.serviceWorker.controller);
      let reloading = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (hadController && !reloading) {
          reloading = true;
          location.reload();
        }
      });
      try {
        const registration = await navigator.serviceWorker.register("../service-worker.js", {
          scope: "../",
          updateViaCache: "none",
        });
        if (registration.waiting) registration.waiting.postMessage("SKIP_WAITING");
        await registration.update();
      } catch {
        // The installed app remains available from its current offline cache.
      }
    });
  }
})();
