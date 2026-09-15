import fs from "node:fs";
import http from "node:http";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require(
  "C:/Users/tonym/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = path.join(ROOT, "test-output");
const BASE_URL = process.env.SANTBANI_URL || "http://127.0.0.1:4184/";
const PORT = Number(new URL(BASE_URL).port || 80);
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function createServer() {
  const mimeTypes = {
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".md": "text/markdown; charset=utf-8",
    ".png": "image/png",
    ".svg": "image/svg+xml; charset=utf-8",
    ".wav": "audio/wav",
    ".webmanifest": "application/manifest+json; charset=utf-8",
  };
  return http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, BASE_URL).pathname);
    let relative = pathname.replace(/^\/+/, "");
    if (!relative || pathname.endsWith("/")) relative += "index.html";
    const filePath = path.resolve(ROOT, relative);
    if (!filePath.startsWith(`${ROOT}${path.sep}`) || !fs.existsSync(filePath)) {
      response.writeHead(404).end("Not found");
      return;
    }
    response.setHeader("Content-Type", mimeTypes[path.extname(filePath)] || "application/octet-stream");
    fs.createReadStream(filePath).pipe(response);
  });
}

async function installMediaMocks(context) {
  await context.addInitScript(() => {
    const actions = {};
    const mediaSession = {
      metadata: null,
      playbackState: "none",
      setActionHandler(action, handler) {
        if (handler) actions[action] = handler;
        else delete actions[action];
      },
      setPositionState(state) { window.__positionState = state; },
    };
    Object.defineProperty(navigator, "mediaSession", { configurable: true, value: mediaSession });
    Object.defineProperty(navigator, "audioSession", {
      configurable: true,
      value: { type: "auto", state: "inactive" },
    });
    window.MediaMetadata = class MediaMetadata {
      constructor(metadata) { Object.assign(this, metadata); }
    };
    Object.defineProperties(HTMLMediaElement.prototype, {
      paused: { configurable: true, get() { return this.__paused !== false; } },
      ended: { configurable: true, get() { return Boolean(this.__ended); } },
      duration: { configurable: true, get() { return 180; } },
      currentTime: {
        configurable: true,
        get() { return this.__currentTime || 0; },
        set(value) { this.__currentTime = Number(value) || 0; },
      },
    });
    HTMLMediaElement.prototype.load = function load() {};
    HTMLMediaElement.prototype.play = function play() {
      this.__paused = false;
      this.__ended = false;
      this.dispatchEvent(new Event("play"));
      this.dispatchEvent(new Event("playing"));
      return Promise.resolve();
    };
    HTMLMediaElement.prototype.pause = function pause() {
      this.__paused = true;
      this.dispatchEvent(new Event("pause"));
    };
    window.__mediaActions = actions;
  });
}

async function waitForReader(page, globalName, count) {
  await page.waitForFunction(([name, expected]) => window[name]?.bhajans?.length === expected, [globalName, count], {
    timeout: 90_000,
  });
  await page.locator(".bhajan-header h1").waitFor({ timeout: 90_000 });
}

fs.mkdirSync(OUTPUT, { recursive: true });
const server = createServer();
await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(PORT, "127.0.0.1", resolve);
});

const browser = await chromium.launch({ executablePath: EDGE, headless: true });
const errors = [];

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "es-ES" });
  await installMediaMocks(context);
  const page = await context.newPage();
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => errors.push(`page: ${error.message}`));
  page.on("requestfailed", (request) => {
    if (!request.url().startsWith("https://mediaseva1.dsmynas.net/")) {
      errors.push(`request: ${request.url()} ${request.failure()?.errorText || "failed"}`);
    }
  });

  await page.goto(BASE_URL, { waitUntil: "networkidle", timeout: 90_000 });
  assert((await page.title()) === "SantBani Bhajan Mala", "El título principal es incorrecto.");
  assert((await page.locator('meta[name="app-version"]').getAttribute("content")) === "1.1", "Falta la versión 1.1.");
  assert(await page.locator(".book-card").count() === 2, "La portada no muestra los dos libros.");
  assert((await page.locator(".book-card-footer strong").allInnerTexts()).join("|") === "Sant Sadhu Ram Ji Bhajan Mala|Bayanes de los Maestros", "Los nombres inferiores no coinciden.");
  assert(await page.locator(".cover-frame img").evaluateAll((images) => images.every((image) => image.complete && image.naturalWidth > 250 && image.naturalHeight > 400)), "Alguna carátula no se cargó.");
  assert(await page.locator(".book-card").evaluateAll((cards) => cards.every((card) => Math.abs(card.getBoundingClientRect().width - card.getBoundingClientRect().height) < 2)), "Las tarjetas no son cuadradas.");
  assert(await page.locator(".book-card").evaluateAll((cards) => cards.length === 2 && cards[1].getBoundingClientRect().top > cards[0].getBoundingClientRect().bottom), "Los libros no están apilados.");
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "La portada desborda horizontalmente.");
  await page.screenshot({ path: path.join(OUTPUT, "desktop-library.png"), fullPage: false });

  await page.locator("#theme-button").click();
  assert(await page.evaluate(() => document.documentElement.dataset.theme === "dark"), "El modo oscuro principal no se activó.");
  assert(await page.evaluate(() => JSON.parse(localStorage.getItem("santbani-bm:preferences")).theme === "dark"), "El tema principal no se guardó.");

  await page.locator(".book-card-sr").click();
  await waitForReader(page, "SRBM_DATA", 251);
  assert((await page.locator('meta[name="app-version"]').getAttribute("content")) === "1.1", "SR BM no muestra v1.1.");
  assert(await page.locator(".bhajan-row").count() === 251, "SR BM no conserva sus 251 bhajans.");
  assert(await page.locator(".combined-home").isVisible(), "SR BM no ofrece regreso a la biblioteca en escritorio.");
  await page.locator(".word-button").first().click();
  assert(await page.locator("#word-dialog").getAttribute("open") !== null, "La ficha de palabra de SR BM no abrió.");
  await page.locator("#close-word-dialog").click();
  await page.locator("#favorite-button").click();
  assert(await page.evaluate(() => JSON.parse(localStorage.getItem("sr-bm:favorites") || "[]").length > 0), "El favorito de SR BM no se guardó.");
  await page.locator("#audio-button").click();
  await page.waitForFunction(() => document.querySelector("#audio-button").getAttribute("aria-label").startsWith("Pausar"));
  assert(await page.evaluate(() => ["play", "pause", "seekforward", "seekbackward", "seekto"].every((action) => window.__mediaActions[action])), "SR BM perdió controles multimedia.");
  await page.screenshot({ path: path.join(OUTPUT, "desktop-sr.png"), fullPage: false });
  await page.locator(".combined-home").click();
  await page.locator(".book-card").first().waitFor();

  await page.locator(".book-card-sj").click();
  await waitForReader(page, "SJBM_DATA", 340);
  assert((await page.locator('meta[name="app-version"]').getAttribute("content")) === "1.1", "SJ BM no muestra v1.1.");
  assert(await page.locator(".bhajan-row").count() === 340, "SJ BM no conserva sus 340 entradas.");
  await page.locator('[data-reader-tab="spanish"]').click();
  assert(await page.locator(".spanish-copy p").count() > 0, "SJ BM perdió la traducción española.");
  await page.locator('[data-reader-tab="devanagari"]').click();
  await page.locator("#audio-button").click();
  if (await page.locator("#audio-version-dialog").getAttribute("open") !== null) {
    assert(await page.locator(".audio-version-option").count() > 1, "SJ BM no conserva la selección de grabaciones.");
    await page.locator(".audio-version-option").first().click();
  }
  await page.waitForFunction(() => document.querySelector("#audio-button").getAttribute("aria-label").startsWith("Pausar"));
  assert(await page.evaluate(() => navigator.mediaSession.metadata?.artwork?.every((item) => item.src.includes("santbani-icon-"))), "El reproductor no usa el icono unificado.");
  await page.screenshot({ path: path.join(OUTPUT, "desktop-sj.png"), fullPage: false });

  await page.goto(BASE_URL, { waitUntil: "networkidle" });
  await page.setViewportSize({ width: 390, height: 844 });
  const mobile = await page.evaluate(() => {
    const cards = [...document.querySelectorAll(".book-card")].map((card) => card.getBoundingClientRect());
    return {
      width: document.documentElement.scrollWidth,
      viewport: innerWidth,
      cards: cards.map((rect) => ({ left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom })),
    };
  });
  assert(mobile.width <= mobile.viewport, "La portada desborda en iPhone.");
  assert(mobile.cards.length === 2 && mobile.cards[1].top > mobile.cards[0].bottom, "Los libros no aparecen apilados en móvil.");
  assert(mobile.cards.every((card) => Math.abs((card.right - card.left) - (card.bottom - card.top)) < 2), "Las tarjetas móviles no son cuadradas.");
  assert(mobile.cards.every((card) => card.left >= 0 && card.right <= mobile.viewport), "Algún libro queda fuera del móvil.");
  await page.screenshot({ path: path.join(OUTPUT, "iphone-library.png"), fullPage: false });

  await page.setViewportSize({ width: 320, height: 568 });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "La portada desborda a 320 px.");
  assert(await page.locator(".brand-copy small").isVisible(), "La versión no es visible a 320 px.");
  await page.screenshot({ path: path.join(OUTPUT, "iphone-320-library.png"), fullPage: false });

  await page.locator(".book-card-sr").click();
  await waitForReader(page, "SRBM_DATA", 251);
  assert(await page.locator(".combined-home").isVisible(), "Falta el regreso desde SR BM a 320 px.");
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "SR BM desborda en móvil.");
  await page.setViewportSize({ width: 390, height: 844 });
  assert(await page.locator(".combined-mobile-brand").isVisible(), "Falta el regreso móvil desde SR BM.");
  await page.screenshot({ path: path.join(OUTPUT, "iphone-sr.png"), fullPage: false });

  await page.evaluate(() => navigator.serviceWorker.ready);
  await context.setOffline(true);
  await page.goto(`${BASE_URL}sj/`, { waitUntil: "domcontentloaded" });
  await waitForReader(page, "SJBM_DATA", 340);
  assert((await page.locator(".bhajan-header h1").innerText()).length > 0, "SJ BM no abrió sin conexión.");
  await context.setOffline(false);

  const manifest = await page.request.get(`${BASE_URL}manifest.webmanifest`);
  assert(manifest.ok(), "No se pudo leer el manifiesto.");
  const manifestData = await manifest.json();
  assert(manifestData.name === "SantBani Bhajan Mala", "El manifiesto tiene otro nombre.");
  assert(manifestData.icons.every((icon) => icon.src.startsWith("santbani-icon-")), "El manifiesto no usa el libro blanco.");
  assert(errors.length === 0, errors.join("\n"));

  console.log(JSON.stringify({
    version: "1.1",
    libraryCards: 2,
    srBhajans: 251,
    sjEntries: 340,
    mobileLayout: "ok",
    wordGlosses: "ok",
    spanishTranslations: "ok",
    favorites: "ok",
    mediaSession: "ok",
    offline: "ok",
    browserErrors: errors,
  }, null, 2));
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
