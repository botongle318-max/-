export interface ChatMessage {
  id: string;
  sender: 'bot' | 'player';
  text: string;
  emoji?: string;
  delay?: number;
}

export interface ChatOption {
  id: string;
  text: string;
  nextScene: string;
  mood?: 'happy' | 'curious' | 'shy' | 'normal';
}

export interface ChatScene {
  id: string;
  messages: ChatMessage[];
  options: ChatOption[];
  collectFragment?: string;
}

export interface MemoryFragment {
  id: string;
  emoji: string;
  title: string;
  unlocked: boolean;
}

export type GameScreen = 'home' | 'chat' | 'ending';
