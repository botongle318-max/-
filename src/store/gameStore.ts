import { create } from 'zustand';
import type { GameScreen, MemoryFragment } from '../types';

interface GameState {
  screen: GameScreen;
  currentScene: string;
  chatHistory: { sender: 'bot' | 'player'; text: string; emoji?: string }[];
  fragments: MemoryFragment[];
  visitedScenes: Set<string>;
  isTyping: boolean;

  goTo: (screen: GameScreen) => void;
  setScene: (scene: string) => void;
  addMessage: (sender: 'bot' | 'player', text: string, emoji?: string) => void;
  unlockFragment: (id: string) => void;
  setTyping: (typing: boolean) => void;
  reset: () => void;
}

const defaultFragments: MemoryFragment[] = [
  { id: 'name', emoji: '👤', title: '卜桐乐', unlocked: false },
  { id: 'birthday', emoji: '🎂', title: '2008.08.25', unlocked: false },
  { id: 'hometown', emoji: '📍', title: '湖南长沙', unlocked: false },
  { id: 'mbti', emoji: '💬', title: 'ENTP', unlocked: false },
  { id: 'gym', emoji: '💪', title: '喜欢健身', unlocked: false },
  { id: 'music', emoji: '🎵', title: '周杰伦 / 陶喆', unlocked: false },
  { id: 'movie', emoji: '🎬', title: '喜欢电影', unlocked: false },
  { id: 'photo', emoji: '📸', title: '摄影爱好者', unlocked: false },
  { id: 'travel', emoji: '✈️', title: '想去很多地方', unlocked: false },
  { id: 'edit', emoji: '🎞️', title: '剪辑初学者', unlocked: false },
  { id: 'ai', emoji: '🤖', title: '在研究 AI', unlocked: false },
  { id: 'imagination', emoji: '✨', title: '想象力丰富', unlocked: false },
  { id: 'random', emoji: '🌀', title: '随心所欲', unlocked: false },
  { id: 'hidden', emoji: '❓', title: '???', unlocked: false },
];

export const useGameStore = create<GameState>((set) => ({
  screen: 'home',
  currentScene: 'start',
  chatHistory: [],
  fragments: [...defaultFragments],
  visitedScenes: new Set(),
  isTyping: false,

  goTo: (screen) => set({ screen }),

  setScene: (scene) =>
    set((state) => ({
      currentScene: scene,
      visitedScenes: new Set([...state.visitedScenes, scene]),
    })),

  addMessage: (sender, text, emoji) =>
    set((state) => ({
      chatHistory: [...state.chatHistory, { sender, text, emoji }],
    })),

  unlockFragment: (id) =>
    set((state) => ({
      fragments: state.fragments.map((f) =>
        f.id === id ? { ...f, unlocked: true } : f
      ),
    })),

  setTyping: (typing) => set({ isTyping: typing }),

  reset: () =>
    set({
      screen: 'home',
      currentScene: 'start',
      chatHistory: [],
      fragments: [...defaultFragments],
      visitedScenes: new Set(),
      isTyping: false,
    }),
}));
