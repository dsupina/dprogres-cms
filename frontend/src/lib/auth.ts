import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import api from './api';
import { User, LoginData, RegisterData, UpdateProfileData, ChangePasswordData, ApiResponse } from '../types';

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (data: LoginData) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => void;
  updateProfile: (data: UpdateProfileData) => Promise<void>;
  changePassword: (data: ChangePasswordData) => Promise<void>;
  checkAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,

      login: async (data: LoginData) => {
        set({ isLoading: true });
        try {
          const response = await api.post<ApiResponse<any>>('/auth/login', data);
          // Backend returns { message, token, user } structure
          const { token, user } = response.data;
          
          if (token && user) {
            localStorage.setItem('token', token);
            set({ 
              user, 
              token, 
              isAuthenticated: true, 
              isLoading: false 
            });
          } else {
            throw new Error('Invalid response structure from server');
          }
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      register: async (data: RegisterData) => {
        set({ isLoading: true });
        try {
          await api.post('/auth/register', data);
          set({ isLoading: false });
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      logout: () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        set({ 
          user: null, 
          token: null, 
          isAuthenticated: false 
        });
      },

      updateProfile: async (data: UpdateProfileData) => {
        set({ isLoading: true });
        try {
          const response = await api.put<ApiResponse<any>>('/auth/profile', data);
          const { user } = response.data;
          
          if (user) {
            set({ user, isLoading: false });
          }
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      changePassword: async (data: ChangePasswordData) => {
        set({ isLoading: true });
        try {
          await api.put('/auth/password', data);
          set({ isLoading: false });
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      checkAuth: async () => {
        const token = localStorage.getItem('token');
        if (!token) {
          set({ isAuthenticated: false });
          return;
        }

        try {
          const response = await api.get<ApiResponse<any>>('/auth/me');
          // Backend returns { user } structure  
          const { user } = response.data;
          
          if (user) {
            set({ 
              user, 
              token, 
              isAuthenticated: true 
            });
          } else {
            console.warn('No user data received from /auth/me');
            get().logout();
          }
        } catch (error) {
          console.error('Auth check failed:', error);
          get().logout();
        }
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({ 
        user: state.user, 
        token: state.token, 
        isAuthenticated: state.isAuthenticated 
      }),
    }
  )
);

// Auth helper functions
export const isAdmin = (user: User | null): boolean => {
  return user?.role === 'admin';
};

export const isEditor = (user: User | null): boolean => {
  return user?.role === 'admin' || user?.role === 'editor';
};

export const isAuthor = (user: User | null): boolean => {
  return user?.role === 'admin' || user?.role === 'editor' || user?.role === 'author';
};

export const canEditPost = (user: User | null, post: { author_id: number }): boolean => {
  if (!user) return false;
  if (isAdmin(user)) return true;
  return user.id === post.author_id;
};

export const getFullName = (user: User | null): string => {
  if (!user) return '';
  return `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email;
}; 