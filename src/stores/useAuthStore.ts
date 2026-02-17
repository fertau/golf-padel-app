import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

type AuthStore = {
  currentUserId: string | null;
  rememberedIds: string[];
  setCurrentUserId: (userId: string | null) => void;
  remember: (userId: string) => void;
  forget: (userId: string) => void;
  logout: () => void;
};

const noopStorage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined
};

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      currentUserId: null,
      rememberedIds: [],
      setCurrentUserId: (userId) => set({ currentUserId: userId }),
      remember: (userId) => {
        const remembered = new Set(get().rememberedIds);
        remembered.add(userId);
        set({ rememberedIds: Array.from(remembered) });
      },
      forget: (userId) => {
        const rememberedIds = get().rememberedIds.filter((id) => id !== userId);
        const currentUserId = get().currentUserId === userId ? null : get().currentUserId;
        set({ rememberedIds, currentUserId });
      },
      logout: () => set({ currentUserId: null })
    }),
    {
      name: "golf-padel-auth",
      storage: createJSONStorage(() =>
        typeof window === "undefined" ? noopStorage : window.localStorage
      )
    }
  )
);
