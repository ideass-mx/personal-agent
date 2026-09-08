# PHASE 60.9.5 — Browser Divergence

**Generated:** 2026-09-08T13:38:48.929Z  
**Case:** **A** — Existe diferencia observable fuerte antes del submit  
**Cause:** CAUSE NOT IDENTIFIED  
**First divergence:** T0

## Outcomes

| | Manual | Playwright |
| --- | ---: | ---: |
| Challenge | 0/3 | 3/3 |
| Organic | 3/3 | 0/3 |

## Evidence matrix (T0 representative)

| Observable | Manual | Playwright | Difference | Relevance | Strength |
| --- | --- | --- | --- | --- | --- |
| userAgent | "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Cursor/3.5.38 Chrome/142.0.7444.265 Electron/39.8.1 Safari/537.36" | "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/150.0.0.0 Safari/537.36" | DIFFERENT | possible | medium |
| platform | "Linux x86_64" | "Linux x86_64" | SAME | none | weak |
| language | "en-US" | "en-US" | SAME | none | weak |
| languages | ["en-US","en","en"] | ["en-US"] | DIFFERENT | low | weak |
| timezone | "America/Mexico_City" | "America/Mexico_City" | SAME | none | weak |
| webdriver | false | true | DIFFERENT | possible | medium |
| hardwareConcurrency | 32 | 32 | SAME | none | weak |
| deviceMemory | 8 | 32 | DIFFERENT | low | weak |
| maxTouchPoints | 0 | 0 | SAME | none | weak |
| cookieEnabled | true | true | SAME | none | weak |
| pluginsLength | 5 | 5 | SAME | none | weak |
| mimeTypesLength | 2 | 2 | SAME | none | weak |
| innerWidth | 1920 | 1280 | DIFFERENT | low | weak |
| innerHeight | 1080 | 800 | DIFFERENT | low | weak |
| devicePixelRatio | 2 | 1 | DIFFERENT | low | weak |
| screenWidth | 1704 | 1280 | DIFFERENT | low | weak |
| screenHeight | 1065 | 800 | DIFFERENT | low | weak |
| webglVendor | "Google Inc. (Intel)" | "Google Inc. (Google)" | DIFFERENT | possible | weak |
| webglRenderer | "ANGLE (Intel, Mesa Intel(R) Graphics (RPL-S), OpenGL 4.6)" | "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)" | DIFFERENT | possible | weak |
| cookieNames | [] | [] | SAME | none | weak |
| localStorageKeys | ["origin_conversions"] | [] | DIFFERENT | possible | weak |
| sessionStorageKeys | [] | [] | SAME | none | weak |
| serviceWorkerScopes | [] | [] | SAME | none | weak |
| cacheStorageKeys | [] | [] | SAME | none | weak |
| permissions | {} | {"notifications":"prompt","geolocation":"prompt","camera":"prompt","microphone":"prompt"} | DIFFERENT | low | weak |
| challengeDetected | [false,false,false] | [true,true,true] | DIFFERENT | outcome | strong |
| organicResultsDetected | [true,true,true] | [false,false,false] | DIFFERENT | outcome | strong |

## Answers

1. Query entered both: true
2. Submit both: true
3. Navigation both: true
4. First difference: T0
8. Cause identified: false — CAUSE NOT IDENTIFIED
10. Continue research: true

See `docs/architecture/phase-60.9.5-browser-divergence.md`.
