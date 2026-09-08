/**
 * HTTP runners de 60.9.3 dependían de scraping HTML.
 * Eliminado junto con `research/scraping/`. Usar Electron SERP.
 */
export function unavailableHttpRunner(): never {
  throw new Error(
    "HTTP SERP scraping removed — use electron-serp adapters (PHASE 60.12+)",
  );
}
