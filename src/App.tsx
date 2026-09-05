import { useEffect } from 'react';
import { useGameStore } from './store/gameStore';
import Home from './pages/Home';
import ChatScreen from './components/ChatScreen';
import Ending from './pages/Ending';

export default function App() {
  const screen = useGameStore((s) => s.screen);

  useEffect(() => {
    const preventZoom = (e: TouchEvent) => {
      if (e.touches.length > 1) e.preventDefault();
    };
    document.addEventListener('touchstart', preventZoom, { passive: false });
    return () => document.removeEventListener('touchstart', preventZoom);
  }, []);

  if (screen === 'home') return <Home />;
  if (screen === 'chat') return <ChatScreen />;
  if (screen === 'ending') return <Ending />;
  return <Home />;
}
