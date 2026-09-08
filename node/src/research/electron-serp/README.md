# electron-serp

Runtime Electron. **DuckDuckGo = prod** · Brave = experimental.

Autosuficiente: **sin** carpeta `scraping/`.

```text
BrowserWindow → <a href> genéricos
  → SiteProfile (denylist / challenge)
  → SerpHit[] → research.search
```

```text
shared/     contract · hits · organic · interpret · adapter-base
duckduckgo/ SiteProfile DDG
brave/      SiteProfile Brave
fixtures/   HTML offline tests
```
