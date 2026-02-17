import { create } from 'zustand';
import { User as FirebaseUser } from 'firebase/auth';
import { User } from '../lib/types';

interface AuthState {
  firebaseUser: FirebaseUser | null;
  currentUser: User | null;
  authLoading: boolean;
  authError: string | null;
  setFirebaseUser: (user: FirebaseUser | null) => void;
  setAuthLoading: (loading: boolean) => void;
  setAuthError: (error: string | null) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  firebaseUser: null,
  currentUser: null,
  authLoading: true,
  authError: null,
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
}));
