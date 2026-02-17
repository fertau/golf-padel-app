import { create } from 'zustand';
import { User as FirebaseUser } from 'firebase/auth';
import { User } from '../lib/types';

interface AuthState {
  firebaseUser: FirebaseUser | null;
  currentUser: User | null;
  authLoading: boolean;
  authError: string | null;
  currentUserId: string | null;
  rememberedIds: string[];
  setFirebaseUser: (user: FirebaseUser | null) => void;
  setAuthLoading: (loading: boolean) => void;
  setAuthError: (error: string | null) => void;
  setCurrentUserId: (userId: string | null) => void;
  remember: (userId: string) => void;
  forget: (userId: string) => void;
}

const REMEMBERED_ACCOUNTS_KEY = "remembered_accounts";
const CURRENT_USER_ID_KEY = "current_player_id";

const readRememberedIds = (): string[] => {
  if (typeof localStorage === "undefined") {
    return [];
  }
  try {
    const raw = localStorage.getItem(REMEMBERED_ACCOUNTS_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as string[];
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch {
    return [];
  }
};

const readCurrentUserId = (): string | null => {
  if (typeof localStorage === "undefined") {
    return null;
  }
  return localStorage.getItem(CURRENT_USER_ID_KEY);
};

const persistRememberedIds = (ids: string[]) => {
  if (typeof localStorage === "undefined") {
    return;
  }
  localStorage.setItem(REMEMBERED_ACCOUNTS_KEY, JSON.stringify(ids));
};

export const useAuthStore = create<AuthState>((set) => ({
  firebaseUser: null,
  currentUser: null,
  authLoading: true,
  authError: null,
  currentUserId: readCurrentUserId(),
  rememberedIds: readRememberedIds(),
  setFirebaseUser: (firebaseUser) => {
    const currentUser: User | null = firebaseUser
      ? {
        id: firebaseUser.uid,
        name: firebaseUser.displayName || firebaseUser.email || "Jugador",
        avatar: firebaseUser.photoURL || undefined
      }
      : null;
    set({ firebaseUser, currentUser, authLoading: false });
  },
  setAuthLoading: (authLoading) => set({ authLoading }),
  setAuthError: (authError) => set({ authError }),
  setCurrentUserId: (currentUserId) => {
    if (typeof localStorage !== "undefined") {
      if (currentUserId) {
        localStorage.setItem(CURRENT_USER_ID_KEY, currentUserId);
      } else {
        localStorage.removeItem(CURRENT_USER_ID_KEY);
      }
    }
    set({ currentUserId });
  },
  remember: (userId) =>
    set((state) => {
      const rememberedIds = state.rememberedIds.includes(userId)
        ? state.rememberedIds
        : [...state.rememberedIds, userId];
      persistRememberedIds(rememberedIds);
      return { rememberedIds };
    }),
  forget: (userId) =>
    set((state) => {
      const rememberedIds = state.rememberedIds.filter((id) => id !== userId);
      persistRememberedIds(rememberedIds);
      if (state.currentUserId === userId && typeof localStorage !== "undefined") {
        localStorage.removeItem(CURRENT_USER_ID_KEY);
      }
      return {
        rememberedIds,
        currentUserId: state.currentUserId === userId ? null : state.currentUserId
      };
    })
}));
