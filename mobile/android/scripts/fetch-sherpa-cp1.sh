#!/usr/bin/env bash
# Descarga el runtime sherpa-onnx (AAR) y el modelo de prueba CP1 (Piper es-MX,
# variante estándar no cuantizada — el AAR no carga bien int8).
# Uso (desde mobile/android/ o la raíz del repo, invocando este script):
#   ./scripts/fetch-sherpa-cp1.sh
#   ./scripts/fetch-sherpa-cp1.sh --verify   # también sintetiza con el binario Linux
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ANDROID_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
LIBS_DIR="$ANDROID_DIR/app/libs"
VOICES_DIR="$ANDROID_DIR/.neural-voices"
SHERPA_VERSION="1.13.4"
AAR_NAME="sherpa-onnx-${SHERPA_VERSION}.aar"
AAR_URL="https://github.com/k2-fsa/sherpa-onnx/releases/download/v${SHERPA_VERSION}/${AAR_NAME}"
VOICE_ID="vits-piper-es_MX-claude-high"
VOICE_TAR_URL="https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/${VOICE_ID}.tar.bz2"
VERIFY=0

for arg in "$@"; do
  case "$arg" in
    --verify) VERIFY=1 ;;
    -h|--help)
      echo "Uso: $0 [--verify]"
      exit 0
      ;;
  esac
done

mkdir -p "$LIBS_DIR" "$VOICES_DIR"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# Limpia la variante int8 rota si quedó de intentos previos.
if [[ -d "$VOICES_DIR/${VOICE_ID}-int8" ]]; then
  echo "Eliminando modelo int8 abandonado: $VOICES_DIR/${VOICE_ID}-int8"
  rm -rf "$VOICES_DIR/${VOICE_ID}-int8"
fi

if [[ ! -f "$LIBS_DIR/$AAR_NAME" ]]; then
  echo "Descargando $AAR_NAME…"
  curl -fsSL -o "$LIBS_DIR/$AAR_NAME" "$AAR_URL"
else
  echo "AAR ya presente: $LIBS_DIR/$AAR_NAME"
fi
ls -lh "$LIBS_DIR/$AAR_NAME"

# El AAR debe traer onnxruntime + JNI (sin esto, UnsatisfiedLinkError en dispositivo).
# No sustituir por com.microsoft.onnxruntime:onnxruntime-android: el .so de Maven
# no es el mismo binario que el ORT custom del AAR sherpa (rompe el JNI).
python3 - <<PY
import zipfile, sys
aar = "$LIBS_DIR/$AAR_NAME"
need = [
  "jni/arm64-v8a/libonnxruntime.so",
  "jni/arm64-v8a/libsherpa-onnx-jni.so",
]
with zipfile.ZipFile(aar) as z:
  names = set(z.namelist())
missing = [n for n in need if n not in names]
if missing:
  print("ERROR: AAR incompleto, faltan:", missing, file=sys.stderr)
  sys.exit(1)
print("OK: AAR contiene", ", ".join(need))
PY

if [[ ! -f "$VOICES_DIR/$VOICE_ID/es_MX-claude-high.onnx" ]]; then
  echo "Descargando modelo $VOICE_ID (no cuantizado)…"
  curl -fsSL -o "$TMP/voice.tar.bz2" "$VOICE_TAR_URL"
  tar xjf "$TMP/voice.tar.bz2" -C "$VOICES_DIR"
else
  echo "Modelo ya presente: $VOICES_DIR/$VOICE_ID"
fi
ls -lh "$VOICES_DIR/$VOICE_ID/es_MX-claude-high.onnx"

echo
echo "Colocación en dispositivo (CP1, manual):"
echo "  adb push $VOICES_DIR/$VOICE_ID /data/data/mx.ideass.personal.agent/files/neural_voices/$VOICE_ID"
echo

if [[ "$VERIFY" -eq 1 ]]; then
  echo "Verificando síntesis con binario Linux (misma API OfflineTts)…"
  LINUX_TAR="sherpa-onnx-v${SHERPA_VERSION}-linux-x64-shared.tar.bz2"
  LINUX_URL="https://github.com/k2-fsa/sherpa-onnx/releases/download/v${SHERPA_VERSION}/${LINUX_TAR}"
  curl -fsSL -o "$TMP/$LINUX_TAR" "$LINUX_URL"
  tar xjf "$TMP/$LINUX_TAR" -C "$TMP"
  ROOT="$TMP/sherpa-onnx-v${SHERPA_VERSION}-linux-x64-shared"
  export LD_LIBRARY_PATH="$ROOT/lib:${LD_LIBRARY_PATH:-}"
  OUT="$TMP/cp1-synth.wav"
  MODEL="$VOICES_DIR/$VOICE_ID"
  "$ROOT/bin/sherpa-onnx-offline-tts" \
    --vits-model="$MODEL/es_MX-claude-high.onnx" \
    --vits-tokens="$MODEL/tokens.txt" \
    --vits-data-dir="$MODEL/espeak-ng-data" \
    --output-filename="$OUT" \
    "Hola, soy el agente. Esta es una prueba de síntesis neuronal."
  ls -lh "$OUT"
  echo "OK: síntesis produce WAV no vacío."
fi

echo "Listo. Siguiente: cd mobile/android && ./gradlew assembleDebug test"
