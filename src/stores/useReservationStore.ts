import { create } from 'zustand';
import { Reservation } from '../lib/types';

interface ReservationState {
    reservations: Reservation[];
    loading: boolean;
    setReservations: (reservations: Reservation[]) => void;
    setLoading: (loading: boolean) => void;
}

export const useReservationStore = create<ReservationState>((set) => ({
    reservations: [],
    loading: true,
    setReservations: (reservations) => set({ reservations, loading: false }),
    setLoading: (loading) => set({ loading }),
}));
