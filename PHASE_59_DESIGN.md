# PHASE 59 — DESIGN (Credential & Secret Management)

## Diagrama

```text
                  ┌──────────────────┐
                  │    Agent Runtime │
                  └────────┬─────────┘
                           │  (no secrets)
                           ▼
                  ┌──────────────────┐
                  │   Tool / MCP     │
                  │   Integration    │
                  └────────┬─────────┘
                           │
                    CredentialRef
                           │
                           ▼
                  ┌──────────────────┐
                  │ CredentialManager│
                  └────────┬─────────┘
                           │
                           ▼
                  ┌──────────────────┐
                  │    SecretStore   │
                  └────────┬─────────┘
                           │
             ┌─────────────┴──────────────┐
             ▼                            ▼
    Windows Credential              Encrypted file
         Manager                      (fallback)
```

## Distinciones

| Concepto | ≠ Credential |
|----------|----------------|
| Artifact | Bytes de producto (PHASE 57–58) |
| Resource | Referencia MCP/normalizada |
| Memory | Historial conversacional |
| MCP Result | Envelope de tool |
| Android / install / device auth | Pairing + TrustedDevice / `HUB_TOKEN` |
| Env `ANTHROPIC_API_KEY` | Legacy boot LLM (no auto-import) |

## Módulos

```text
gateway/src/credentials/
├── types.ts
├── credential-manager.ts
├── credential-store.ts      # SQLite metadata
├── credential-redactor.ts
├── resolve-root.ts
├── index.ts
└── stores/
    ├── memory-secret-store.ts
    ├── windows-credential-store.ts
    └── encrypted-file-credential-store.ts
```

## CredentialRef

```ts
{ credentialId: string; purpose?: string }
```

Imposible reconstruir el secreto desde el ref.

## Metadata (SQLite) vs Secret (SecretStore)

- Tabla `credentials`: metadata only — **nunca** columna `secret`.
- `SecretStore.put/get/delete(credentialId)`.

## Kinds

`api_key` | `bearer_token` | `basic_auth` | `oauth_token` (modelo; OAuth flow deferred).

## Lifecycle

`CREATE → ACTIVE → REVOKED | EXPIRED → DELETE`  
`revoke` no borra metadata; `getSecret` fail-closed.  
`delete` coordina metadata + secret.

## Access (conservador)

```text
valid id + ACTIVE (+ not expired)
  + binding: si metadata.serverId → context.serverId debe coincidir
  + binding: si metadata.integrationId → context.integrationId debe coincidir
  + solo callers internos (Gateway Tool/MCP path)
```

TrustedDevice permissions ≠ credential access. ACL fino agent/tool/device → fase posterior.

## MCP binding

```ts
McpServerCredentialBinding { serverId, credentialId }
```

Inyección futura: resolver secreto en Gateway e inyectar al adapter con mínimo alcance.  
No `credential://` en MCP. No dump de todas las credenciales al Node.

## SecretStore backends

| Platform | Default |
|----------|---------|
| `win32` | `WindowsCredentialStore` (CredWrite/CredRead Generic) |
| other | `EncryptedFileCredentialStore` |

Encrypted fallback: AES-256-GCM; master key en `{credentialsRoot}/.master.key` (0600), **no** en `.env` / SQLite / `product.json` / logs.

## LLM / Android / QR / Logs

- LLM: solo vistas `{ credentialId, name, provider, status }` vía `toLlmSafeCredentialView`.
- Android / QR: sin cambios; sin secretos de integración.
- Logs: `CredentialRedactor` para strings/objetos (`Authorization`, `apiKey`, `password`, …).

## Env legacy

`ANTHROPIC_API_KEY` / `HUB_TOKEN` siguen siendo boot/install. Nuevas integraciones → `CredentialRef`.

## Deferred

OAuth completo, refresh rotation, Vault remoto, S3/MinIO/Wasabi, UI admin, sync multi-device, RBAC enterprise, migrar Anthropic key a CredentialManager.
