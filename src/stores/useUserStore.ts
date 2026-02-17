import { create } from "zustand";
import type { AccountProfile } from "../lib/authApi";
import { fetchAccountsByIds, searchAccountByName } from "../lib/authApi";

type UserStore = {
  profilesById: Record<string, AccountProfile>;
  upsertProfiles: (profiles: AccountProfile[]) => void;
  loadRememberedProfiles: (ids: string[]) => Promise<AccountProfile[]>;
  searchExactByName: (name: string) => Promise<AccountProfile | null>;
};

export const useUserStore = create<UserStore>((set, get) => ({
  profilesById: {},
  upsertProfiles: (profiles) =>
    set((state) => {
      const next = { ...state.profilesById };
      profiles.forEach((profile) => {
        next[profile.id] = profile;
      });
      return { profilesById: next };
    }),
  loadRememberedProfiles: async (ids) => {
    const profiles = await fetchAccountsByIds(ids);
    get().upsertProfiles(profiles);
    return profiles;
  },
  searchExactByName: async (name) => {
    const profile = await searchAccountByName(name);
    if (profile) {
      get().upsertProfiles([profile]);
    }
    return profile;
  }
}));
