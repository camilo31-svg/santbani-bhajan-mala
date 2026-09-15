(() => {
  "use strict";

  const isSj = Boolean(window.SJBM_DATA);
  const data = isSj ? window.SJBM_DATA : window.SRBM_DATA;
  const catalog = isSj ? window.SJBM_AUDIO : window.SRBM_AUDIO;
  const icons = (isSj ? window.SJBM_ICONS : window.SRBM_ICONS) || {};
  const playerIcons = {
    Play: [["path", { d: "m6 3 14 9-14 9z" }]],
    Pause: [
      ["rect", { x: "14", y: "4", width: "4", height: "16", rx: "1" }],
      ["rect", { x: "6", y: "4", width: "4", height: "16", rx: "1" }],
    ],
  };
  const appName = isSj ? "SJ BM" : "SR BM";
  const button = document.getElementById("audio-button");
  const audio = document.getElementById("bhajan-audio");
  const audioSessionHold = document.getElementById("audio-session-hold");
  const toast = document.getElementById("toast");
  const usesNativeIOSMediaControls = /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (!data?.bhajans?.length || !catalog || !button || !audio) return;
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
  let loading = false;
  let wantsPlayback = false;
  let playbackRequest = 0;
  let backgroundHoldActive = false;
  let releaseBackgroundHoldOnPlaying = false;
  let toastTimer;

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

  function keyFor(bhajan) {
    return isSj ? String(bhajan?.route || "") : String(bhajan?.number || "");
  }

  function displayNumber(bhajan) {
    return isSj ? bhajan?.display_number : bhajan?.number;
  }

  function bhajanFromLocation() {
    const route = location.hash.match(/^#bhajan-(.+)$/)?.[1];
    if (isSj) return data.bhajans.find((bhajan) => bhajan.route === route) || data.bhajans[0];
    const number = Number(route);
    return data.bhajans.find((bhajan) => bhajan.number === number) || data.bhajans[0];
  }

  function iconMarkup(name) {
    const children = (icons[name] || playerIcons[name] || []).map(([tag, attributes]) => {
      const attrs = Object.entries(attributes).map(([key, value]) => `${key}="${value}"`).join(" ");
      return `<${tag} ${attrs}></${tag}>`;
    }).join("");
    return `<svg class="lucide lucide-${name.toLowerCase()}" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${children}</svg>`;
  }

  function currentEntry() {
    return catalog[keyFor(currentBhajan)] || null;
  }

  function showToast(message) {
    if (!toast) return;
    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.hidden = false;
    toastTimer = setTimeout(() => { toast.hidden = true; }, 2400);
  }

  function updateButton() {
    const entry = currentEntry();
    const currentKey = keyFor(currentBhajan);
    const playing = Boolean(entry && loadedKey === currentKey && !audio.paused && !audio.ended);
    const resumable = Boolean(entry && loadedKey === currentKey && audio.currentTime > 0 && !audio.ended);
    let label = `Reproducir bhajan ${displayNumber(currentBhajan)}`;
    if (!entry) label = `Audio no disponible para el bhajan ${displayNumber(currentBhajan)}`;
    else if (loading) label = `Cargando audio del bhajan ${displayNumber(currentBhajan)}`;
    else if (playing) label = `Pausar bhajan ${displayNumber(currentBhajan)}`;
    else if (resumable) label = `Continuar bhajan ${displayNumber(currentBhajan)}`;

    button.innerHTML = iconMarkup(playing ? "Pause" : "Play");
    button.disabled = !entry;
    button.classList.toggle("is-playing", playing);
    button.classList.toggle("is-loading", loading);
    button.setAttribute("aria-label", label);
    button.setAttribute("aria-pressed", String(playing));
    button.title = entry ? label : "Audio no disponible en MediaSeva";
  }

  function clearAudio() {
    stopBackgroundAudioHold();
    wantsPlayback = false;
    playbackRequest += 1;
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
    loadedKey = "";
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
    currentBhajan = bhajan;
    updateButton();
  }

  function setMediaMetadata() {
    if (!("mediaSession" in navigator) || !("MediaMetadata" in window)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: `${displayNumber(currentBhajan)}. ${currentBhajan.title_transliteration || currentBhajan.title}`,
      artist: currentBhajan.author || "",
      album: appName,
      artwork: [
        { src: new URL("../santbani-icon-192.png", location.href).href, sizes: "192x192", type: "image/png" },
        { src: new URL("../santbani-icon-512.png", location.href).href, sizes: "512x512", type: "image/png" },
      ],
    });
  }

  function prepareCurrentAudio() {
    const entry = currentEntry();
    if (!entry) return false;
    configureIOSAudioSession();
    loadedKey = keyFor(currentBhajan);
    loading = true;
    audio.preload = "auto";
    audio.src = entry.url;
    audio.load();
    setMediaMetadata();
    updateButton();
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
    updateButton();
    showToast("No se pudo reproducir el audio. Comprueba tu conexión.");
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
    updateButton();

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
    if (loadedKey !== keyFor(currentBhajan) && !prepareCurrentAudio()) return Promise.resolve();
    primeBackgroundAudioHold();
    return playLoadedAudio();
  }

  function resumeFromMediaControls() {
    if (!loadedKey || loadedKey !== keyFor(currentBhajan)) return;
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
    updateButton();
  }

  function pauseFromMediaControls() {
    const keepBackgroundHold = startBackgroundAudioHold();
    pauseCurrent({ keepBackgroundHold });
    updatePositionState();
  }

  function togglePlayback() {
    if (!currentEntry()) return;
    if (loadedKey === keyFor(currentBhajan) && !audio.paused) {
      pauseCurrent();
    } else {
      void playCurrent();
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
  window.addEventListener("bhajanchange", (event) => setCurrentBhajan(event.detail?.bhajan));
  audio.addEventListener("play", () => {
    configureIOSAudioSession();
    wantsPlayback = true;
    loading = false;
    setMediaPlaybackState("playing");
    installMediaSessionActions();
    updateButton();
  });
  audio.addEventListener("playing", () => {
    wantsPlayback = true;
    loading = false;
    if (releaseBackgroundHoldOnPlaying || backgroundHoldActive) stopBackgroundAudioHold();
    setMediaPlaybackState("playing");
    installMediaSessionActions();
    updateButton();
  });
  audio.addEventListener("pause", () => {
    wantsPlayback = false;
    playbackRequest += 1;
    loading = false;
    setMediaPlaybackState(loadedKey ? "paused" : "none");
    installMediaSessionActions();
    updateButton();
  });
  audio.addEventListener("waiting", () => {
    loading = true;
    updateButton();
  });
  audio.addEventListener("ended", () => {
    stopBackgroundAudioHold();
    wantsPlayback = false;
    playbackRequest += 1;
    loading = false;
    setMediaPlaybackState("none");
    installMediaSessionActions();
    updateButton();
  });
  audio.addEventListener("error", () => {
    if (!loadedKey) return;
    wantsPlayback = false;
    playbackRequest += 1;
    loading = false;
    setMediaPlaybackState("paused");
    installMediaSessionActions();
    updateButton();
    showToast("El audio no está disponible en este momento.");
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

  installMediaSessionActions();
  setCurrentBhajan(currentBhajan);
})();
