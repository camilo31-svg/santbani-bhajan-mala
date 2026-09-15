import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require(
  "C:/Users/tonym/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
);

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const ROOT = "https://camilo31-svg.github.io/santbani-bhajan-mala/";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const browser = await chromium.launch({ executablePath: EDGE, headless: true });
try {
  const libraryContext = await browser.newContext({ locale: "es-ES" });
  const libraryPage = await libraryContext.newPage();
  await libraryPage.goto(`${ROOT}?verify=1.1`, { waitUntil: "networkidle", timeout: 120_000 });
  assert((await libraryPage.title()) === "SantBani Bhajan Mala", "La portada pública tiene otro título.");
  assert((await libraryPage.locator('meta[name="app-version"]').getAttribute("content")) === "1.1", "La portada pública no sirve v1.1.");
  assert(await libraryPage.locator(".book-card").count() === 2, "La portada pública no muestra ambos libros.");
  assert(await libraryPage.locator(".cover-frame img").evaluateAll((images) => images.every((image) => image.complete && image.naturalWidth > 250 && image.naturalHeight > 400)), "Las carátulas públicas no cargaron.");
  assert(await libraryPage.locator(".book-card").evaluateAll((cards) => cards.every((card) => Math.abs(card.getBoundingClientRect().width - card.getBoundingClientRect().height) < 2)), "Las tarjetas públicas no son cuadradas.");
  const manifestName = await libraryPage.evaluate(async (url) => {
    const response = await fetch(url, { cache: "no-store" });
    return response.ok ? (await response.json()).name : "";
  }, `${ROOT}manifest.webmanifest?verify=1.1`);
  assert(manifestName === "SantBani Bhajan Mala", "El manifiesto público es incorrecto.");
  await libraryContext.close();

  const apps = [
    { name: "SR BM", url: `${ROOT}sr/?verify=1.1#bhajan-1`, picker: false },
    { name: "SJ BM", url: `${ROOT}sj/?verify=1.1#bhajan-17`, picker: true },
  ];

  for (const app of apps) {
    const context = await browser.newContext({ locale: "es-ES" });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(app.url, { waitUntil: "domcontentloaded", timeout: 120_000 });
    await page.locator("#audio-button").waitFor({ timeout: 120_000 });
    assert((await page.locator('meta[name="app-version"]').getAttribute("content")) === "1.1", `${app.name}: versión pública incorrecta.`);
    await page.locator("#audio-button").click();
    if (app.picker) {
      await page.locator("#audio-version-dialog[open]").waitFor();
      await page.locator(".audio-version-option").first().click();
    }
    await page.waitForFunction(() => {
      const audio = document.querySelector("#bhajan-audio");
      return audio && !audio.paused && audio.readyState >= 2;
    }, null, { timeout: 45_000 });
    await page.waitForTimeout(1_200);
    const firstTime = await page.locator("#bhajan-audio").evaluate((audio) => audio.currentTime);
    assert(firstTime > 0, `${app.name}: el audio público no avanzó.`);
    await page.locator("#audio-button").click();
    const paused = await page.locator("#bhajan-audio").evaluate((audio) => ({ paused: audio.paused, time: audio.currentTime }));
    assert(paused.paused, `${app.name}: el audio público no se pausó.`);
    await page.locator("#audio-button").click();
    await page.waitForTimeout(1_000);
    const resumed = await page.locator("#bhajan-audio").evaluate((audio) => ({ paused: audio.paused, time: audio.currentTime }));
    assert(!resumed.paused && resumed.time > paused.time, `${app.name}: el audio público no se reanudó.`);
    assert(errors.length === 0, `${app.name}: ${errors.join("; ")}`);
    console.log(`${app.name}: play/pause/resume OK (${resumed.time.toFixed(2)} s)`);
    await context.close();
  }
} finally {
  await browser.close();
}
