# Windows VC++ 2015–2022 x64 sidecars (PHASE 61.2.3)

App-local copies of MSVC redistributable DLLs required by official
`llama-server` win-cpu builds (ggml-org releases).

## Evidence

Static PE imports of `llama-b10537-bin-win-cpu-x64.zip`:

```
llama-server.exe
  → VCRUNTIME140.dll
  → VCRUNTIME140_1.dll
  → MSVCP140.dll
  → (+ ggml / OpenMP DLLs shipped in the zip)
```

Without the three VC140 DLLs, Windows returns `0xC0000135` (`STATUS_DLL_NOT_FOUND`)
before any `/health` or GGUF load.

## Source

Extracted from the official Microsoft Visual C++ Redistributable x64
(`vc_redist.x64.exe`), cab payload for the additional runtime.

Redistribution follows Microsoft’s VC++ Redistributable terms (app-local
side-by-side next to the executable).

## Files

- `vcruntime140.dll`
- `vcruntime140_1.dll`
- `msvcp140.dll`
