export function utf8ToBytes(text: string) {
    return new TextEncoder().encode(text);
  }
  
  export function bytesToUtf8(bytes: Uint8Array) {
    return new TextDecoder().decode(bytes);
  }
  
  export function bytesToBase64(bytes: Uint8Array) {
    let binary = "";
    for (const b of bytes) binary += String.fromCharCode(b);
    return btoa(binary);
  }
  
  export function base64ToBytes(base64: string) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }
  