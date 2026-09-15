import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require(
  "C:/Users/tonym/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
);

const directory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(directory, "..");
const browser = await chromium.launch({
  executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: true,
});

try {
  const page = await browser.newPage({ viewport: { width: 2400, height: 1500 }, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(path.join(directory, "cover-render.html")).href);
  await page.evaluate(() => document.fonts.ready);
  await page.locator("#sr-cover").screenshot({ path: path.join(root, "covers", "sr-bhajan-mala.png") });
  await page.locator("#sj-cover").screenshot({ path: path.join(root, "covers", "sj-bhajan-mala.png") });

  const icon = page.locator("#app-icon");
  for (const size of [180, 192, 512]) {
    await icon.evaluate((element, pixels) => {
      element.style.width = `${pixels}px`;
      element.style.height = `${pixels}px`;
    }, size);
    await icon.screenshot({ path: path.join(root, `santbani-icon-${size}.png`) });
  }
} finally {
  await browser.close();
}
