(() => {
  "use strict";

  const data = window.SJBM_DATA;
  const catalog = window.SJBM_AUDIO;
  const icons = window.SRBM_ICONS || window.SJBM_ICONS || {};
  const playerIcons = {
    Play: [["path", { d: "m6 3 14 9-14 9z" }]],
    Pause: [
      ["rect", { x: "14", y: "4", width: "4", height: "16", rx: "1" }],
      ["rect", { x: "6", y: "4", width: "4", height: "16", rx: "1" }],
    ],
    ChevronDown: [["path", { d: "m6 9 6 6 6-6" }]],
    Check: [["path", { d: "M20 6 9 17l-5-5" }]],
    X: [["path", { d: "M18 6 6 18" }], ["path", { d: "m6 6 12 12" }]],
  };
  const STORAGE_KEY = "sj-bm:audio-version-preferences";
  const button = document.getElementById("audio-button");
  const optionsButton = document.getElementById("audio-options-button");
  const dialog = document.getElementById("audio-version-dialog");
  const dialogBhajan = document.getElementById("audio-version-bhajan");
  const versionList = document.getElementById("audio-version-list");
  const closeDialog = document.getElementById("close-audio-version-dialog");
  const audio = document.getElementById("bhajan-audio");
  const audioSessionHold = document.getElementById("audio-session-hold");
  const toast = document.getElementById("toast");
  const usesNativeIOSMediaControls = /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (!data?.bhajans?.length || !catalog || !button || !optionsButton || !dialog || !audio) return;
  audio.preload = "auto";
  if (audioSessionHold) {
    audioSessionHold.preload = "auto";
    audioSessionHold.loop = true;
    audioSessionHold.muted = false;
    audioSessionHold.volume = 1;
    audioSessionHold.load();
  }
  configureIOSAudioSession();

  let currentBhajan = bhajanFromLocation();
  let loadedKey = "";
  let loadedVersionUrl = "";
  let loading = false;
  let wantsPlayback = false;
  let playbackRequest = 0;
  let backgroundHoldActive = false;
  let releaseBackgroundHoldOnPlaying = false;
  let toastTimer;
  const preferences = readPreferences();

  function configureIOSAudioSession() {
    if (!usesNativeIOSMediaControls || !("audioSession" in navigator)) return;
    try {
      navigator.audioSession.type = "playback";
    } catch {
      // Earlier iOS versions do not expose a configurable Audio Session API.
    }
  }

  function setMediaPlaybackState(state) {
    if (!("mediaSession" in navigator)) return;
    try {
      navigator.mediaSession.playbackState = state;
    } catch {
      // Playback state is only a hint and is unavailable in some older browsers.
    }
  }

  // Zero-valued PCM keeps iOS from suspending the PWA while the bhajan itself is paused.
  function startBackgroundAudioHold() {
    if (!usesNativeIOSMediaControls || !audioSessionHold) return false;
    configureIOSAudioSession();
    releaseBackgroundHoldOnPlaying = false;
    backgroundHoldActive = true;
    if (!audioSessionHold.paused) return true;
    try {
      audioSessionHold.currentTime = 0;
      const holdPromise = audioSessionHold.play();
      Promise.resolve(holdPromise).catch(() => {
        backgroundHoldActive = false;
        releaseBackgroundHoldOnPlaying = false;
      });
      return true;
    } catch {
      backgroundHoldActive = false;
      return false;
    }
  }

  function stopBackgroundAudioHold() {
    releaseBackgroundHoldOnPlaying = false;
    backgroundHoldActive = false;
    if (!audioSessionHold) return;
    if (!audioSessionHold.paused) audioSessionHold.pause();
    try {
      audioSessionHold.currentTime = 0;
    } catch {
      // The local hold track may not have metadata yet on older iOS versions.
    }
  }

  function primeBackgroundAudioHold() {
    if (!usesNativeIOSMediaControls || document.visibilityState !== "visible") return;
    if (startBackgroundAudioHold()) releaseBackgroundHoldOnPlaying = true;
  }

  function readPreferences() {
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE_KEY));
      return value && typeof value === "object" && !Array.isArray(value) ? value : {};
    } catch {
      return {};
    }
  }

  function savePreference(key, url) {
    preferences[key] = url;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
    } catch {
      // Reproduction still works when private browsing blocks storage.
    }
  }

  function keyFor(bhajan) {
    return String(bhajan?.route || "");
  }

  function displayNumber(bhajan) {
    return bhajan?.display_number;
  }

  function bhajanFromLocation() {
    const route = location.hash.match(/^#bhajan-(.+)$/)?.[1];
    return data.bhajans.find((bhajan) => bhajan.route === route) || data.bhajans[0];
  }

  function iconMarkup(name) {
    const children = (icons[name] || playerIcons[name] || []).map(([tag, attributes]) => {
      const attrs = Object.entries(attributes).map(([key, value]) => `${key}="${value}"`).join(" ");
      return `<${tag} ${attrs}></${tag}>`;
    }).join("");
    return `<svg class="lucide lucide-${name.toLowerCase()}" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${children}</svg>`;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function currentEntry() {
    return catalog[keyFor(currentBhajan)] || null;
  }

  function versionsFor(entry) {
    if (!entry) return [];
    if (Array.isArray(entry.versions) && entry.versions.length) return entry.versions;
    return entry.url ? [{ url: entry.url, label: "Grabación", filename: entry.source_title || "" }] : [];
  }

  function preferredVersion(entry) {
    const savedUrl = preferences[keyFor(currentBhajan)];
    return versionsFor(entry).find((version) => version.url === savedUrl) || null;
  }

  function loadedVersion(entry) {
    if (loadedKey !== keyFor(currentBhajan)) return null;
    return versionsFor(entry).find((version) => version.url === loadedVersionUrl) || null;
  }

  function showToast(message) {
    if (!toast) return;
    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.hidden = false;
    toastTimer = setTimeout(() => { toast.hidden = true; }, 2600);
  }

  function updateControls() {
    const entry = currentEntry();
    const versions = versionsFor(entry);
    const currentKey = keyFor(currentBhajan);
    const playing = Boolean(entry && loadedKey === currentKey && !audio.paused && !audio.ended);
    const resumable = Boolean(entry && loadedKey === currentKey && audio.currentTime > 0 && !audio.ended);
    let label = `Reproducir bhajan ${displayNumber(currentBhajan)}`;
    if (!entry) label = `Audio no disponible para el bhajan ${displayNumber(currentBhajan)}`;
    else if (loading) label = `Cargando audio del bhajan ${displayNumber(currentBhajan)}`;
    else if (playing) label = `Pausar bhajan ${displayNumber(currentBhajan)}`;
    else if (resumable) label = `Continuar bhajan ${displayNumber(currentBhajan)}`;
    else if (versions.length > 1 && !preferredVersion(entry)) label = `Elegir grabación para el bhajan ${displayNumber(currentBhajan)}`;

    button.innerHTML = iconMarkup(playing ? "Pause" : "Play");
    button.disabled = !entry;
    button.classList.toggle("is-playing", playing);
    button.classList.toggle("is-loading", loading);
    button.setAttribute("aria-label", label);
    button.setAttribute("aria-pressed", String(playing));
    button.title = entry ? label : "Audio no disponible en MediaSeva";

    optionsButton.innerHTML = iconMarkup("ChevronDown");
    optionsButton.hidden = versions.length < 2;
    optionsButton.disabled = versions.length < 2;
    optionsButton.setAttribute("aria-label", `Elegir otra grabación del bhajan ${displayNumber(currentBhajan)}`);
  }

  function clearAudio() {
    stopBackgroundAudioHold();
    wantsPlayback = false;
    playbackRequest += 1;
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
    loadedKey = "";
    loadedVersionUrl = "";
    loading = false;
    if ("mediaSession" in navigator) {
      navigator.mediaSession.metadata = null;
      setMediaPlaybackState("none");
    }
  }

  function setCurrentBhajan(bhajan) {
    if (!bhajan) return;
    const nextKey = keyFor(bhajan);
    if (loadedKey && loadedKey !== nextKey) clearAudio();
    if (dialog.open) dialog.close();
    currentBhajan = bhajan;
    updateControls();
  }

  function setMediaMetadata() {
    if (!("mediaSession" in navigator) || !("MediaMetadata" in window)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: `${displayNumber(currentBhajan)}. ${currentBhajan.title_transliteration || currentBhajan.title}`,
      artist: currentBhajan.author || "",
      album: "SJ BM",
      artwork: [
        { src: new URL("../santbani-icon-192.png", location.href).href, sizes: "192x192", type: "image/png" },
        { src: new URL("../santbani-icon-512.png", location.href).href, sizes: "512x512", type: "image/png" },
      ],
    });
  }

  function prepareVersion(version) {
    if (!version?.url) return false;
    configureIOSAudioSession();
    if (loadedKey && (loadedKey !== keyFor(currentBhajan) || loadedVersionUrl !== version.url)) clearAudio();
    loadedKey = keyFor(currentBhajan);
    loadedVersionUrl = version.url;
    loading = true;
    audio.preload = "auto";
    audio.src = version.url;
    audio.load();
    setMediaMetadata();
    updateControls();
    return true;
  }

  function handlePlaybackFailure(requestId) {
    if (requestId !== playbackRequest || !wantsPlayback) return;
    wantsPlayback = false;
    releaseBackgroundHoldOnPlaying = false;
    if (document.visibilityState === "visible") stopBackgroundAudioHold();
    loading = false;
    setMediaPlaybackState(audio.ended ? "none" : "paused");
    installMediaSessionActions();
    updateControls();
    showToast("No se pudo reproducir esta grabación. Puedes elegir otra versión.");
  }

  function playLoadedAudio() {
    configureIOSAudioSession();
    if (audio.ended) audio.currentTime = 0;
    wantsPlayback = true;
    releaseBackgroundHoldOnPlaying = backgroundHoldActive;
    const requestId = ++playbackRequest;
    loading = true;
    setMediaPlaybackState("playing");
    installMediaSessionActions();
    updateControls();

    let playPromise;
    try {
      playPromise = audio.play();
    } catch {
      handlePlaybackFailure(requestId);
      return Promise.resolve();
    }
    return Promise.resolve(playPromise).catch(() => handlePlaybackFailure(requestId));
  }

  function playCurrent() {
    configureIOSAudioSession();
    const entry = currentEntry();
    if (!entry) return Promise.resolve();
    if (loadedKey !== keyFor(currentBhajan) || !loadedVersion(entry)) {
      const version = preferredVersion(entry) || versionsFor(entry)[0];
      if (!prepareVersion(version)) return Promise.resolve();
    }
    primeBackgroundAudioHold();
    return playLoadedAudio();
  }

  function resumeFromMediaControls() {
    if (!loadedKey || loadedKey !== keyFor(currentBhajan) || !loadedVersion(currentEntry())) return;
    configureIOSAudioSession();
    setMediaMetadata();
    void playLoadedAudio();
  }

  function pauseCurrent({ keepBackgroundHold = false } = {}) {
    if (!keepBackgroundHold) stopBackgroundAudioHold();
    releaseBackgroundHoldOnPlaying = false;
    wantsPlayback = false;
    playbackRequest += 1;
    loading = false;
    audio.pause();
    setMediaPlaybackState(loadedKey ? "paused" : "none");
    installMediaSessionActions();
    updateControls();
  }

  function pauseFromMediaControls() {
    const keepBackgroundHold = startBackgroundAudioHold();
    pauseCurrent({ keepBackgroundHold });
    updatePositionState();
  }

  async function chooseVersion(version) {
    if (!version) return;
    savePreference(keyFor(currentBhajan), version.url);
    if (dialog.open) dialog.close();
    if (loadedKey !== keyFor(currentBhajan) || loadedVersionUrl !== version.url) prepareVersion(version);
    await playCurrent();
  }

  function cleanFilename(filename) {
    return String(filename || "")
      .replace(/\.mp3$/i, "")
      .replace(/^\s*\d{3}(?:\s*-\s*\d+)?\s*-?\s*/, "")
      .trim();
  }

  function openVersionDialog() {
    const entry = currentEntry();
    const versions = versionsFor(entry);
    if (versions.length < 2) return;
    const selectedUrl = loadedVersion(entry)?.url || preferredVersion(entry)?.url || "";
    dialogBhajan.textContent = `${displayNumber(currentBhajan)}. ${currentBhajan.title_transliteration || currentBhajan.title}`;
    versionList.innerHTML = versions.map((version, index) => {
      const selected = version.url === selectedUrl;
      return `
        <button class="audio-version-option${selected ? " is-selected" : ""}" type="button" role="listitem" data-version-index="${index}" aria-label="${escapeHtml(version.label)}${selected ? ", seleccionada" : ""}">
          <span class="audio-version-option-icon">${iconMarkup(selected ? "Check" : "Play")}</span>
          <span class="audio-version-option-copy">
            <strong>${escapeHtml(version.label)}</strong>
            <small>${escapeHtml(cleanFilename(version.filename) || entry.source_title)}</small>
          </span>
        </button>`;
    }).join("");
    if (!dialog.open) dialog.showModal();
  }

  function togglePlayback() {
    const entry = currentEntry();
    if (!entry) return;
    if (loadedKey === keyFor(currentBhajan) && !audio.paused) {
      pauseCurrent();
      return;
    }
    if (loadedVersion(entry) || preferredVersion(entry) || versionsFor(entry).length === 1) {
      void playCurrent();
    } else {
      openVersionDialog();
    }
  }

  function seekBy(seconds) {
    if (!loadedKey) return;
    const duration = Number.isFinite(audio.duration) ? audio.duration : Infinity;
    audio.currentTime = Math.max(0, Math.min(duration, audio.currentTime + seconds));
    updatePositionState();
  }

  function seekTo(details) {
    if (!loadedKey || !Number.isFinite(details.seekTime)) return;
    const time = Math.max(0, Math.min(audio.duration || details.seekTime, details.seekTime));
    if (details.fastSeek && typeof audio.fastSeek === "function") audio.fastSeek(time);
    else audio.currentTime = time;
    updatePositionState();
  }

  function updatePositionState() {
    if (!("mediaSession" in navigator) || typeof navigator.mediaSession.setPositionState !== "function") return;
    if (!Number.isFinite(audio.duration) || audio.duration <= 0) return;
    try {
      navigator.mediaSession.setPositionState({
        duration: audio.duration,
        playbackRate: audio.playbackRate,
        position: Math.min(audio.currentTime, audio.duration),
      });
    } catch {
      // Some browsers expose Media Session before position state is available.
    }
  }

  function installMediaSessionActions() {
    if (!("mediaSession" in navigator)) return;
    const actions = {
      play: resumeFromMediaControls,
      pause: pauseFromMediaControls,
      seekbackward: (details) => seekBy(-(details.seekOffset || 10)),
      seekforward: (details) => seekBy(details.seekOffset || 10),
      seekto: seekTo,
    };
    Object.entries(actions).forEach(([action, handler]) => {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch {
        // Unsupported lock-screen actions are ignored individually.
      }
    });
  }

  function refreshMediaSession() {
    configureIOSAudioSession();
    installMediaSessionActions();
    if (!loadedKey) return;
    if (audio.ended) setMediaPlaybackState("none");
    else setMediaPlaybackState(audio.paused ? "paused" : "playing");
  }

  function handleVisibilityChange() {
    if (document.visibilityState === "visible" && backgroundHoldActive && !wantsPlayback) {
      stopBackgroundAudioHold();
    }
    refreshMediaSession();
  }

  document.addEventListener("visibilitychange", handleVisibilityChange);
  window.addEventListener("pageshow", refreshMediaSession);
  button.addEventListener("click", togglePlayback);
  optionsButton.addEventListener("click", openVersionDialog);
  closeDialog.addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
  versionList.addEventListener("click", (event) => {
    const option = event.target.closest("[data-version-index]");
    if (!option) return;
    const version = versionsFor(currentEntry())[Number(option.dataset.versionIndex)];
    void chooseVersion(version);
  });
  window.addEventListener("bhajanchange", (event) => setCurrentBhajan(event.detail?.bhajan));
  audio.addEventListener("play", () => {
    configureIOSAudioSession();
    wantsPlayback = true;
    loading = false;
    setMediaPlaybackState("playing");
    installMediaSessionActions();
    updateControls();
  });
  audio.addEventListener("playing", () => {
    wantsPlayback = true;
    loading = false;
    if (releaseBackgroundHoldOnPlaying || backgroundHoldActive) stopBackgroundAudioHold();
    setMediaPlaybackState("playing");
    installMediaSessionActions();
    updateControls();
  });
  audio.addEventListener("pause", () => {
    wantsPlayback = false;
    playbackRequest += 1;
    loading = false;
    setMediaPlaybackState(loadedKey ? "paused" : "none");
    installMediaSessionActions();
    updateControls();
  });
  audio.addEventListener("waiting", () => {
    loading = true;
    updateControls();
  });
  audio.addEventListener("ended", () => {
    stopBackgroundAudioHold();
    wantsPlayback = false;
    playbackRequest += 1;
    loading = false;
    setMediaPlaybackState("none");
    installMediaSessionActions();
    updateControls();
  });
  audio.addEventListener("error", () => {
    if (!loadedKey) return;
    wantsPlayback = false;
    playbackRequest += 1;
    loading = false;
    setMediaPlaybackState("paused");
    installMediaSessionActions();
    updateControls();
    showToast("Esta grabación no está disponible. Puedes elegir otra versión.");
  });
  audio.addEventListener("loadedmetadata", updatePositionState);
  audio.addEventListener("durationchange", updatePositionState);
  audio.addEventListener("timeupdate", updatePositionState);

  if (audioSessionHold) {
    audioSessionHold.addEventListener("playing", () => {
      backgroundHoldActive = true;
      if (wantsPlayback) return;
      setMediaMetadata();
      setMediaPlaybackState("paused");
      installMediaSessionActions();
      updatePositionState();
    });
    audioSessionHold.addEventListener("pause", () => {
      backgroundHoldActive = false;
    });
    audioSessionHold.addEventListener("error", () => {
      backgroundHoldActive = false;
      releaseBackgroundHoldOnPlaying = false;
    });
  }

  closeDialog.innerHTML = iconMarkup("X");
  installMediaSessionActions();
  setCurrentBhajan(currentBhajan);
})();
