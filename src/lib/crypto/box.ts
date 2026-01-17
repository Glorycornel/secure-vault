import sodium from "libsodium-wrappers";

export async function readySodium() {
  await sodium.ready;
  return sodium;
}

export function b64ToU8(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

export function u8ToB64(u8: Uint8Array): string {
  let s = "";
  u8.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s);
}

export async function genBoxKeypair() {
  const s = await readySodium();
  const { publicKey, privateKey } = s.crypto_box_keypair();
  return { publicKey, privateKey };
}

export async function sealTo(publicKey: Uint8Array, message: Uint8Array) {
  const s = await readySodium();
  return s.crypto_box_seal(message, publicKey);
}

export async function openSealed(
  sealed: Uint8Array,
  publicKey: Uint8Array,
  privateKey: Uint8Array
) {
  const s = await readySodium();
  const msg = s.crypto_box_seal_open(sealed, publicKey, privateKey);
  if (!msg) throw new Error("Failed to open sealed box (wrong key?)");
  return msg;
}
