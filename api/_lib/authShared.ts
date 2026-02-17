export const normalizeUsername = (value: string): string =>
  value.trim().toLowerCase().replace(/\s+/g, " ");

export const assertPinFormat = (pin: string) => /^\d{4}$/.test(pin);
