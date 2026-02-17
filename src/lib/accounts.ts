import { slugifyId } from "./utils";

export type LocalAccount = {
  id: string;
  name: string;
  pin: string;
  createdAt: string;
  updatedAt: string;
};

const ACCOUNTS_KEY = "golf-padel-accounts";
const CURRENT_ACCOUNT_ID_KEY = "current_player_id";
const REMEMBERED_ACCOUNTS_KEY = "remembered_accounts";

const nowIso = () => new Date().toISOString();

const readJson = <T>(key: string, fallback: T): T => {
  const raw = localStorage.getItem(key);
  if (!raw) {
    return fallback;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

const writeJson = (key: string, value: unknown) => {
  localStorage.setItem(key, JSON.stringify(value));
};

export const getAccounts = (): LocalAccount[] => readJson<LocalAccount[]>(ACCOUNTS_KEY, []);

export const saveAccounts = (accounts: LocalAccount[]) => {
  writeJson(ACCOUNTS_KEY, accounts);
};

export const getRememberedAccountIds = (): string[] =>
  readJson<string[]>(REMEMBERED_ACCOUNTS_KEY, []);

export const rememberAccount = (accountId: string) => {
  const remembered = new Set(getRememberedAccountIds());
  remembered.add(accountId);
  writeJson(REMEMBERED_ACCOUNTS_KEY, Array.from(remembered));
};

export const forgetAccount = (accountId: string) => {
  const remembered = getRememberedAccountIds().filter((id) => id !== accountId);
  writeJson(REMEMBERED_ACCOUNTS_KEY, remembered);
  if (getCurrentAccountId() === accountId) {
    clearCurrentAccountId();
  }
};

export const getCurrentAccountId = (): string | null =>
  localStorage.getItem(CURRENT_ACCOUNT_ID_KEY);

export const setCurrentAccountId = (accountId: string) => {
  localStorage.setItem(CURRENT_ACCOUNT_ID_KEY, accountId);
};

export const clearCurrentAccountId = () => {
  localStorage.removeItem(CURRENT_ACCOUNT_ID_KEY);
};

export const createAccount = (name: string, pin: string): LocalAccount => {
  const cleanName = name.trim();
  if (!cleanName) {
    throw new Error("Ingresá un nombre.");
  }
  if (!/^\d{4,6}$/.test(pin)) {
    throw new Error("El PIN debe tener entre 4 y 6 dígitos.");
  }

  const accounts = getAccounts();
  const normalizedId = slugifyId(cleanName);
  const dedupCount = accounts.filter((account) => account.id.startsWith(normalizedId)).length;
  const id = dedupCount === 0 ? normalizedId : `${normalizedId}-${dedupCount + 1}`;

  const account: LocalAccount = {
    id,
    name: cleanName,
    pin,
    createdAt: nowIso(),
    updatedAt: nowIso()
  };

  saveAccounts([account, ...accounts]);
  return account;
};

export const verifyAccountPin = (accountId: string, pin: string): LocalAccount => {
  const account = getAccounts().find((item) => item.id === accountId);
  if (!account) {
    throw new Error("Cuenta no encontrada.");
  }
  if (account.pin !== pin) {
    throw new Error("PIN incorrecto.");
  }
  return account;
};
