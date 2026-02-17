import { beforeEach, describe, expect, it } from "vitest";
import { useAuthStore } from "../src/stores/useAuthStore";

const storage = new Map<string, string>();

const localStorageMock = {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => {
    storage.set(key, value);
  },
  removeItem: (key: string) => {
    storage.delete(key);
  },
  clear: () => {
    storage.clear();
  },
  key: (index: number) => Array.from(storage.keys())[index] ?? null,
  get length() {
    return storage.size;
  }
};

Object.defineProperty(globalThis, "localStorage", {
  value: localStorageMock,
  configurable: true
});

describe("useAuthStore", () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState({ currentUserId: null, rememberedIds: [] });
  });

  it("remembers and forgets accounts", () => {
    useAuthStore.getState().remember("u1");
    useAuthStore.getState().remember("u2");
    expect(useAuthStore.getState().rememberedIds).toEqual(["u1", "u2"]);

    useAuthStore.getState().setCurrentUserId("u1");
    useAuthStore.getState().forget("u1");

    expect(useAuthStore.getState().rememberedIds).toEqual(["u2"]);
    expect(useAuthStore.getState().currentUserId).toBeNull();
  });
});
