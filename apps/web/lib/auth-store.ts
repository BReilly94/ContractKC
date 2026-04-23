'use client';

import { create } from 'zustand';

const TOKEN_KEY = 'ckb.devToken';
const USER_KEY = 'ckb.devUser';

export interface StoredUser {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
}

interface AuthState {
  readonly token: string | null;
  readonly user: StoredUser | null;
  readonly hydrated: boolean;
  hydrate(): void;
  login(token: string, user: StoredUser): void;
  logout(): void;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  user: null,
  hydrated: false,
  hydrate: () => {
    if (typeof window === 'undefined') return;
    const token = window.localStorage.getItem(TOKEN_KEY);
    const userRaw = window.localStorage.getItem(USER_KEY);
    const user = userRaw ? (JSON.parse(userRaw) as StoredUser) : null;
    set({ token, user, hydrated: true });
  },
  login: (token, user) => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(TOKEN_KEY, token);
      window.localStorage.setItem(USER_KEY, JSON.stringify(user));
    }
    set({ token, user });
  },
  logout: () => {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(TOKEN_KEY);
      window.localStorage.removeItem(USER_KEY);
    }
    set({ token: null, user: null });
  },
}));

export const AUTH_STORAGE_KEYS = [TOKEN_KEY, USER_KEY];
