declare module "libsodium-wrappers" {
    export type SodiumBoxKeyPair = {
      publicKey: Uint8Array;
      privateKey: Uint8Array;
      keyType?: string;
    };
  
    export type Sodium = {
      ready: Promise<void>;
  
      // keypair generation
      crypto_box_keypair(): SodiumBoxKeyPair;
  
      // sealed boxes (easy sharing)
      crypto_box_seal(message: Uint8Array, publicKey: Uint8Array): Uint8Array;
      crypto_box_seal_open(
        ciphertext: Uint8Array,
        publicKey: Uint8Array,
        privateKey: Uint8Array
      ): Uint8Array | null;
  
      // If your box.ts uses these, they’re common too:
      randombytes_buf(length: number): Uint8Array;
      from_base64(s: string, variant?: number): Uint8Array;
      to_base64(u8: Uint8Array, variant?: number): string;
  
      // Keep other APIs accessible without "any"
      [key: string]: unknown;
    };
  
    const sodium: Sodium;
    export default sodium;
  }
  