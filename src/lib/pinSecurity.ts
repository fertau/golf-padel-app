const encoder = new TextEncoder();

export type PinHashPayload = {
  hash: string;
  salt: string;
  iterations: number;
  algorithm: "PBKDF2-SHA256";
};

const toBase64 = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes));

const fromBase64 = (value: string): Uint8Array =>
  Uint8Array.from(atob(value), (char) => char.charCodeAt(0));

const constantTimeEqual = (a: Uint8Array, b: Uint8Array): boolean => {
  if (a.length !== b.length) {
    return false;
  }

  let diff = 0;
  for (let index = 0; index < a.length; index += 1) {
    diff |= a[index] ^ b[index];
  }
  return diff === 0;
};

export const hashPin = async (pin: string, iterations = 120_000): Promise<PinHashPayload> => {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(pin),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations,
      hash: "SHA-256"
    },
    keyMaterial,
    256
  );

  return {
    hash: toBase64(new Uint8Array(derivedBits)),
    salt: toBase64(salt),
    iterations,
    algorithm: "PBKDF2-SHA256"
  };
};

export const verifyPinHash = async (
  pin: string,
  payload: Pick<PinHashPayload, "hash" | "salt" | "iterations">
): Promise<boolean> => {
  const saltBytes = fromBase64(payload.salt);
  const salt = Uint8Array.from(saltBytes);

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(pin),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations: payload.iterations,
      hash: "SHA-256"
    },
    keyMaterial,
    256
  );
  return constantTimeEqual(new Uint8Array(derivedBits), fromBase64(payload.hash));
};
