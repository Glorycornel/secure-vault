export const LEGACY_VAULT_SALT_KEY = "vault_salt_v1";
export const LEGACY_VAULT_CHECK_KEY = "vault_check_v1";

export function getVaultSaltKey(userId: string) {
  return `${LEGACY_VAULT_SALT_KEY}:${userId}`;
}

export function getVaultCheckKey(userId: string) {
  return `${LEGACY_VAULT_CHECK_KEY}:${userId}`;
}
