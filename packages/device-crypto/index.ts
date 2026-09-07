export {
  DEVICE_AUTH_DOMAIN,
  DEVICE_AUTH_PURPOSE,
  DEVICE_AUTH_PROTOCOL_VERSION,
  DEVICE_KEY_ALGORITHM,
  buildDeviceAuthMessage,
  type DeviceKeyAlgorithm,
  type DeviceKeyStore,
  type DevicePublicKeyIdentity,
} from "./types.ts";
export {
  exportPublicKeySpkiBase64,
  generateEd25519KeyPair,
  importPublicKeySpkiBase64,
  isLikelyEd25519SpkiBase64,
  signEd25519,
  verifyEd25519,
} from "./ed25519.ts";
export { MemoryDeviceKeyStore } from "./memory-keystore.ts";
export {
  createDeviceKeyStore,
  createNodeDeviceKeyStore,
  type CreateDeviceKeyStoreOptions,
  type NodeDeviceKeyStoreOptions,
} from "./create-keystore.ts";
export {
  WindowsDeviceKeyStore,
  windowsDeviceIdentityDir,
  type WindowsDeviceKeyStoreOptions,
} from "./windows-keystore.ts";
export {
  createTestSealProvider,
  loadWindowsDpapiSeal,
  type WindowsSealProvider,
  type WindowsDpapiScope,
} from "./windows-seal.ts";
