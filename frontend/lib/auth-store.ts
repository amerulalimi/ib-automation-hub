import { create } from "zustand";

export type UserProfile = {
  email: string;
  id?: string;
  role?: string;
  is_active?: boolean;
  quotas?: {
    max_channels: number | null;
    max_ai_tokens_per_month: number | null;
    max_scheduled_posts: number | null;
    channels_used: number;
  };
};

type AuthState = {
  profile: UserProfile | null;
  setProfile: (p: UserProfile | null) => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  profile: null,
  setProfile: (p) => set({ profile: p }),
}));
