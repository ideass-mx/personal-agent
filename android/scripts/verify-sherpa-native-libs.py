#!/usr/bin/env python3
"""Verifica que el APK debug contiene las nativas sherpa sin strip de onnxruntime."""
from __future__ import annotations

import hashlib
import sys
import zipfile
from pathlib import Path

REQUIRED = (
    "lib/arm64-v8a/libonnxruntime.so",
    "lib/arm64-v8a/libsherpa-onnx-jni.so",
)
AAR_ONNX = "jni/arm64-v8a/libonnxruntime.so"


def sha256_entry(zip_path: Path, entry: str) -> str:
    with zipfile.ZipFile(zip_path) as z:
        with z.open(entry) as f:
            h = hashlib.sha256()
            while True:
                chunk = f.read(1024 * 1024)
                if not chunk:
                    break
                h.update(chunk)
            return h.hexdigest()


def main() -> int:
    if len(sys.argv) != 3:
        print(f"Uso: {sys.argv[0]} <apk-debug-dir> <aar-path>", file=sys.stderr)
        return 2
    apk_dir = Path(sys.argv[1])
    aar = Path(sys.argv[2])
    apks = sorted(
        p
        for p in apk_dir.glob("*.apk")
        if "-androidTest" not in p.name
    )
    if not apks:
        print(f"ERROR: no hay APK en {apk_dir}", file=sys.stderr)
        return 1
    apk = apks[0]
    with zipfile.ZipFile(apk) as z:
        names = set(z.namelist())
    missing = [n for n in REQUIRED if n not in names]
    if missing:
        libs = "\n".join(sorted(n for n in names if n.startswith("lib/")))
        print(f"ERROR: APK sin nativas sherpa: {missing}", file=sys.stderr)
        print(f"APK={apk}", file=sys.stderr)
        print(f"Entradas lib/:\n{libs}", file=sys.stderr)
        return 1
    print("OK: presentes:")
    for n in REQUIRED:
        print(f"  {n}")
    if aar.is_file():
        aar_hash = sha256_entry(aar, AAR_ONNX)
        apk_hash = sha256_entry(apk, REQUIRED[0])
        if aar_hash != apk_hash:
            print(
                "ERROR: libonnxruntime.so en el APK fue alterado (¿strip?).\n"
                f"  AAR={aar_hash}\n  APK={apk_hash}\n"
                "  Revisa packaging.jniLibs.keepDebugSymbols.",
                file=sys.stderr,
            )
            return 1
        print(f"OK: hash libonnxruntime.so coincide con el AAR ({aar_hash[:12]}…)")
    else:
        print(f"AVISO: AAR no encontrado ({aar}); solo se comprobó presencia en el APK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
