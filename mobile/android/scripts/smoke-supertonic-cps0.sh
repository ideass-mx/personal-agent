#!/usr/bin/env bash
# CP-S0: smoke-test Supertonic V3 int8 (bloqueo antes de UI).
# 1) Valida layout + sha256 del tar
# 2) Síntesis Linux (misma API OfflineTts)
# 3) Carga + síntesis en dispositivo arm64 (ORT del AAR — riesgo real)
#
# Uso (desde android/):
#   ./scripts/smoke-supertonic-cps0.sh
#   ./scripts/smoke-supertonic-cps0.sh --skip-device   # solo host
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ANDROID_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
VOICES_DIR="$ANDROID_DIR/.neural-voices"
ARCHIVE="sherpa-onnx-supertonic-3-tts-int8-2026-05-11"
EXPECTED_SHA="82fa96f91c4ef8abaae3a14a3f4153facf88bed821d1f7331cec2700f432c427"
URL="https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/${ARCHIVE}.tar.bz2"
MODEL_DIR="$VOICES_DIR/$ARCHIVE"
DEVICE_PATH="/data/local/tmp/$ARCHIVE"
SKIP_DEVICE=0
SHERPA_VERSION="1.13.4"

for arg in "$@"; do
  case "$arg" in
    --skip-device) SKIP_DEVICE=1 ;;
    -h|--help)
      echo "Uso: $0 [--skip-device]"
      exit 0
      ;;
  esac
done

mkdir -p "$VOICES_DIR"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

REQUIRED=(
  duration_predictor.int8.onnx
  text_encoder.int8.onnx
  vector_estimator.int8.onnx
  vocoder.int8.onnx
  tts.json
  unicode_indexer.bin
  voice.bin
)

if [[ ! -f "$MODEL_DIR/tts.json" ]]; then
  echo "Descargando $ARCHIVE…"
  curl -fL --progress-bar -o "$TMP/$ARCHIVE.tar.bz2" "$URL"
  ACTUAL="$(sha256sum "$TMP/$ARCHIVE.tar.bz2" | awk '{print $1}')"
  if [[ "$ACTUAL" != "$EXPECTED_SHA" ]]; then
    echo "ERROR: sha256 mismatch (got $ACTUAL expected $EXPECTED_SHA)" >&2
    exit 1
  fi
  tar xjf "$TMP/$ARCHIVE.tar.bz2" -C "$VOICES_DIR"
fi

echo "=== Layout (7 ficheros) ==="
for f in "${REQUIRED[@]}"; do
  if [[ ! -s "$MODEL_DIR/$f" ]]; then
    echo "ERROR: falta $MODEL_DIR/$f" >&2
    exit 1
  fi
  ls -lh "$MODEL_DIR/$f"
done
echo "OK: layout completo"

echo
echo "=== Smoke Linux (OfflineTts + lang=es sid=0) ==="
LINUX_ROOT="$TMP/sherpa-onnx-v${SHERPA_VERSION}-linux-x64-shared"
if [[ ! -x "$LINUX_ROOT/bin/sherpa-onnx-offline-tts" ]]; then
  LINUX_TAR="sherpa-onnx-v${SHERPA_VERSION}-linux-x64-shared.tar.bz2"
  curl -fL --progress-bar -o "$TMP/$LINUX_TAR" \
    "https://github.com/k2-fsa/sherpa-onnx/releases/download/v${SHERPA_VERSION}/$LINUX_TAR"
  tar xjf "$TMP/$LINUX_TAR" -C "$TMP"
fi
export LD_LIBRARY_PATH="$LINUX_ROOT/lib:${LD_LIBRARY_PATH:-}"
OUT="$TMP/supertonic-es-smoke.wav"
"$LINUX_ROOT/bin/sherpa-onnx-offline-tts" \
  --supertonic-duration-predictor="$MODEL_DIR/duration_predictor.int8.onnx" \
  --supertonic-text-encoder="$MODEL_DIR/text_encoder.int8.onnx" \
  --supertonic-vector-estimator="$MODEL_DIR/vector_estimator.int8.onnx" \
  --supertonic-vocoder="$MODEL_DIR/vocoder.int8.onnx" \
  --supertonic-tts-json="$MODEL_DIR/tts.json" \
  --supertonic-unicode-indexer="$MODEL_DIR/unicode_indexer.bin" \
  --supertonic-voice-style="$MODEL_DIR/voice.bin" \
  --lang=es \
  --sid=0 \
  --output-filename="$OUT" \
  "Hola, soy el agente. Esta es una prueba de Supertonic en español."
ls -lh "$OUT"
echo "OK: síntesis Linux"

if [[ "$SKIP_DEVICE" -eq 1 ]]; then
  echo
  echo "CP-S0 host OK (--skip-device). Falta smoke en dispositivo para decidir UI."
  exit 0
fi

echo
echo "=== Smoke dispositivo (ORT del AAR 1.13.4) ==="
if ! adb get-state >/dev/null 2>&1; then
  echo "ERROR: sin dispositivo adb. Conecta arm64 o usa --skip-device." >&2
  exit 1
fi

echo "Push modelo → $DEVICE_PATH"
adb shell "rm -rf '$DEVICE_PATH'" >/dev/null 2>&1 || true
adb push "$MODEL_DIR" "$DEVICE_PATH" >/dev/null

cd "$ANDROID_DIR"
echo "assembleDebug + connectedAndroidTest (SupertonicSmoke)…"
./gradlew :app:assembleDebug :app:assembleDebugAndroidTest --quiet

set +e
./gradlew :app:connectedDebugAndroidTest \
  -Pandroid.testInstrumentationRunnerArguments.class=mx.ideass.personal.agent.voice.SupertonicSmokeInstrumentedTest
RC=$?
set -e

if [[ "$RC" -ne 0 ]]; then
  echo
  echo "=============================================="
  echo "CP-S0 DEVICE BLOQUEADO / FALLIDO (exit $RC)"
  echo "=============================================="
  echo "Si ves INSTALL_FAILED_USER_RESTRICTED (HyperOS/Xiaomi):"
  echo "  Ajustes → Ajustes adicionales → Opciones de desarrollador →"
  echo "  activar «Depuración USB (ajustes de seguridad)» / «Install via USB»."
  echo "  Luego re-ejecuta: ./scripts/smoke-supertonic-cps0.sh"
  echo
  echo "Host (Linux OfflineTts + lang=es) ya OK; sin smoke en el ORT del AAR"
  echo "NO se decide continuar a UI (CP-S1/S2)."
  exit "$RC"
fi

echo
echo "=============================================="
echo "CP-S0 OK: Supertonic int8 carga y sintetiza ES"
echo "=============================================="
