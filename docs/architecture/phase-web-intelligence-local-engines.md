# Motores locales para `research.search()` (dev)

No forman parte del installer ni del startup del Gateway/Node/Desktop.
Levantar **solo** lo que se quiera comparar.

Defaults sugeridos (coinciden con el harness):

| Provider | Env | Puerto sugerido |
|----------|-----|-----------------|
| Websurfx | `WEBSURFX_BASE_URL` | `http://127.0.0.1:8081` |
| LibreY | `LIBREY_BASE_URL` | `http://127.0.0.1:8082` |



**Benchmark temporal (PHASE 60.2):** si hay Docker:

```bash
docker compose -f docker-compose.research-benchmark.yml up -d
# health JSON (no basta con "container running"):
curl -sG 'http://127.0.0.1:8080/search' \
  --data-urlencode 'q=PostgreSQL 17' \
  --data-urlencode 'format=json' | head
docker compose -f docker-compose.research-benchmark.yml down
```

Bind solo `127.0.0.1:8080`. Sin Redis.

Alternativa one-shot (también requiere Docker):

```bash
# Ejemplo con Docker (ajustar settings: search.formats debe incluir json)
docker run --rm -p 127.0.0.1:8080:8080 \
```

Probar:

```bash
curl -sG 'http://127.0.0.1:8080/search' \
  --data-urlencode 'q=test' \
  --data-urlencode 'format=json' | head -c 200
```

El adapter usa `GET /search?q=&format=json` (+ `language`, `safesearch` opcionales).

## Websurfx

Upstream: <https://github.com/neon-mmd/websurfx>


```bash
# Tras compilar según el README del proyecto:
# cargo run --release
# (puerto según websurfx.toml; mapear a 8081)
curl -sG 'http://127.0.0.1:8081/search' \
  --data-urlencode 'q=test' \
  --data-urlencode 'json=true' | head -c 200
```

Campos típicos del resultado: `title`, `url`, `description` (no `content`).

## LibreY

Upstream: <https://github.com/Ahwxorg/librey>

API: `GET /api.php?q=...&p=0&t=0` → JSON array
`{ title, url, base_url, description }` (o `{ "error": "..." }`).

```bash
# PHP built-in server (ejemplo; requiere instancia clonada y config.php)
cd /ruta/a/librey
php -S 127.0.0.1:8082
curl -sG 'http://127.0.0.1:8082/api.php' \
  --data-urlencode 'q=test' \
  --data-urlencode 'p=0' \
  --data-urlencode 't=0' | head -c 200
```

Asegurar que la API no esté deshabilitada (`disable_api` en config).

## Comparación con el harness

```bash
export WEBSURFX_BASE_URL=http://127.0.0.1:8081
export LIBREY_BASE_URL=http://127.0.0.1:8082
npm run research:benchmark
```

Si un servidor no está arriba, el benchmark marca `success=false` y un código
de error (`http_error`, `timeout`, `provider_unavailable`, …) — no inventa
resultados.
