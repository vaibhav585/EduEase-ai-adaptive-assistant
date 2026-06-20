import create from 'zustand';

interface AppState {
  // Add your state properties here
}

export const useAppStore = create<AppState>((set) => ({
  // Add your state and actions here
}));