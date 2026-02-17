import { pbkdf2Sync, randomBytes, timingSafeEqual } from "crypto";

const PIN_ITERATIONS = 210_000;
const KEY_LENGTH = 32;

export type PinHashRecord = {
  pinHash: string;
  pinSalt: string;
  pinIterations: number;
  pinAlgorithm: "PBKDF2-SHA256";
};

export const hashPin = (pin: string): PinHashRecord => {
  const salt = randomBytes(16);
  const hash = pbkdf2Sync(pin, salt, PIN_ITERATIONS, KEY_LENGTH, "sha256");

  return {
    pinHash: hash.toString("base64"),
    pinSalt: salt.toString("base64"),
    pinIterations: PIN_ITERATIONS,
    pinAlgorithm: "PBKDF2-SHA256"
  };
};

export const verifyPin = (
  pin: string,
  payload: Pick<PinHashRecord, "pinHash" | "pinSalt" | "pinIterations">
): boolean => {
  const salt = Buffer.from(payload.pinSalt, "base64");
  const expected = Buffer.from(payload.pinHash, "base64");
  const calculated = pbkdf2Sync(pin, salt, payload.pinIterations, expected.length, "sha256");
  if (calculated.length !== expected.length) {
    return false;
  }
  return timingSafeEqual(calculated, expected);
};
