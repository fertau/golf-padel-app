import { create } from 'zustand';

type TabId = "mis-partidos" | "mis-reservas" | "perfil";

interface UIState {
    activeTab: TabId;
    expandedReservationId: string | null;
    showCreateForm: boolean;
    isOnline: boolean;
    setActiveTab: (tab: TabId) => void;
    setExpandedReservationId: (id: string | null) => void;
    setShowCreateForm: (show: boolean) => void;
    setIsOnline: (online: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
    activeTab: "mis-partidos",
    expandedReservationId: null,
    showCreateForm: false,
    isOnline: navigator.onLine,
    setActiveTab: (activeTab) => set({ activeTab }),
    setExpandedReservationId: (expandedReservationId) => set({ expandedReservationId }),
    setShowCreateForm: (showCreateForm) => set({ showCreateForm }),
    setIsOnline: (isOnline) => set({ isOnline }),
}));
