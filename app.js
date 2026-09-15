(() => {
  "use strict";

  const ICONS = window.SRBM_ICONS || {};
  const themeButton = document.querySelector("#theme-button");
  const themeMeta = document.querySelector('meta[name="theme-color"]');

  function createIcon(name) {
    const nodes = ICONS[name];
    if (!nodes) return null;
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("aria-hidden", "true");
    for (const [tag, attributes] of nodes) {
      const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
      for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
      svg.append(node);
    }
    return svg;
  }

  function hydrateIcons(root = document) {
    root.querySelectorAll("[data-icon]").forEach((placeholder) => {
      const icon = createIcon(placeholder.dataset.icon);
      if (icon) placeholder.replaceWith(icon);
    });
  }

  function applyTheme(theme) {
    const dark = theme === "dark";
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    themeMeta?.setAttribute("content", dark ? "#0a1117" : "#e9eef2");
    themeButton.setAttribute("aria-label", dark ? "Activar modo claro" : "Activar modo oscuro");
    themeButton.setAttribute("title", dark ? "Modo claro" : "Modo oscuro");
    themeButton.replaceChildren(createIcon(dark ? "Sun" : "Moon"));
  }

  hydrateIcons();
  applyTheme(document.documentElement.dataset.theme);

  themeButton.addEventListener("click", () => {
    const theme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    applyTheme(theme);
    localStorage.setItem("santbani-bm:preferences", JSON.stringify({ theme }));
  });

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
        const registration = await navigator.serviceWorker.register("./service-worker.js", {
          updateViaCache: "none",
        });
        if (registration.waiting) registration.waiting.postMessage("SKIP_WAITING");
        await registration.update();
      } catch {
        // The current installed version remains usable if an update fails.
      }
    });
  }
})();
