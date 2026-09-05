import { useEffect, useRef, useState, useCallback } from 'react';
import { useGameStore } from '../store/gameStore';
import { DIALOG_SCENES } from '../game/dialogData';
import Avatar from './Avatar';

export default function ChatScreen() {
  const {
    currentScene,
    chatHistory,
    fragments,
    isTyping,
    addMessage,
    setScene,
    unlockFragment,
    setTyping,
    goTo,
  } = useGameStore();

  const [displayedMessages, setDisplayedMessages] = useState<typeof chatHistory>([]);
  const [optionsVisible, setOptionsVisible] = useState(false);
  const [currentMood, setCurrentMood] = useState<'normal' | 'happy' | 'surprised' | 'shy'>('normal');
  const scrollRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const scene = DIALOG_SCENES[currentScene];

  // 自动滚动到底部
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [displayedMessages, isTyping]);

  // 场景切换时播放消息
  useEffect(() => {
    if (!scene) return;

    setOptionsVisible(false);
    setDisplayedMessages([]);
    setTyping(true);
    setCurrentMood('normal');

    // 清理旧定时器
    timerRef.current.forEach(clearTimeout);
    timerRef.current = [];

    let delay = 0;
    scene.messages.forEach((msg, i) => {
      const msgDelay = delay + (msg.delay || 600 + i * 400);
      const t = setTimeout(() => {
        setDisplayedMessages((prev) => [...prev, { sender: msg.sender, text: msg.text, emoji: msg.emoji }]);
        addMessage(msg.sender, msg.text, msg.emoji);

        if (i === scene.messages.length - 1) {
          setTyping(false);
          setOptionsVisible(true);
        }
      }, msgDelay);
      timerRef.current.push(t);
      delay = msgDelay;
    });

    // 收集记忆碎片
    if (scene.collectFragment) {
      const t = setTimeout(() => unlockFragment(scene.collectFragment!), delay + 200);
      timerRef.current.push(t);
    }

    return () => {
      timerRef.current.forEach(clearTimeout);
    };
  }, [currentScene]);

  const handleOption = useCallback((option: typeof scene.options[0]) => {
    setOptionsVisible(false);
    addMessage('player', option.text);
    setDisplayedMessages((prev) => [...prev, { sender: 'player', text: option.text }]);

    if (option.mood) {
      setCurrentMood(option.mood as any);
    }

    if (option.nextScene) {
      if (option.nextScene === 'bye') {
        setTimeout(() => goTo('ending'), 800);
      } else {
        setTimeout(() => setScene(option.nextScene), 400);
      }
    }
  }, [addMessage, setScene, goTo]);

  const unlockedCount = fragments.filter((f) => f.unlocked).length;

  return (
    <div
      style={{
        width: '100%',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg-chat)',
        maxWidth: '600px',
        margin: '0 auto',
        position: 'relative',
      }}
    >
      {/* 顶部栏 */}
      <div
        style={{
          padding: '12px 16px',
          background: 'var(--card)',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          position: 'sticky',
          top: 0,
          zIndex: 10,
        }}
      >
        <Avatar expression={currentMood} />
        <div>
          <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text)' }}>卜桐乐</div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            {isTyping ? '对方正在输入...' : '在线'}
          </div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            碎片 {unlockedCount}/{fragments.length}
          </span>
        </div>
      </div>

      {/* 聊天区域 */}
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}
      >
        {/* 时间提示 */}
        <div style={{ textAlign: 'center', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px' }}>
          今天
        </div>

        {displayedMessages.map((msg, i) => (
          <div
            key={i}
            className="animate-pop-in"
            style={{
              display: 'flex',
              justifyContent: msg.sender === 'bot' ? 'flex-start' : 'flex-end',
              alignItems: 'flex-end',
              gap: '8px',
            }}
          >
            {msg.sender === 'bot' && <Avatar expression={currentMood} />}

            <div
              style={{
                maxWidth: '75%',
                padding: '10px 14px',
                borderRadius: msg.sender === 'bot' ? '16px 16px 16px 4px' : '16px 16px 4px 16px',
                background: msg.sender === 'bot' ? 'var(--bubble-bot)' : 'var(--bubble-player)',
                color: msg.sender === 'bot' ? 'var(--text)' : '#fff',
                fontSize: '14px',
                lineHeight: 1.6,
                boxShadow: 'var(--shadow)',
                wordBreak: 'break-word',
              }}
            >
              {msg.text}
              {msg.emoji && <span style={{ marginLeft: '4px' }}>{msg.emoji}</span>}
            </div>
          </div>
        ))}

        {/* 正在输入 */}
        {isTyping && (
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px' }}>
            <Avatar expression={currentMood} />
            <div
              style={{
                padding: '12px 16px',
                borderRadius: '16px 16px 16px 4px',
                background: 'var(--bubble-bot)',
                boxShadow: 'var(--shadow)',
                display: 'flex',
                gap: '4px',
              }}
            >
              <div className="typing-dot" />
              <div className="typing-dot" />
              <div className="typing-dot" />
            </div>
          </div>
        )}
      </div>

      {/* 选项区域 */}
      {optionsVisible && scene && scene.options.length > 0 && (
        <div
          className="animate-fade-in"
          style={{
            padding: '12px 16px 20px',
            background: 'var(--card)',
            borderTop: '1px solid var(--border)',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          {scene.options.map((option) => (
            <button
              key={option.id}
              onClick={() => handleOption(option)}
              style={{
                padding: '12px 16px',
                borderRadius: '12px',
                border: '1.5px solid var(--border)',
                background: '#fff',
                color: 'var(--text)',
                fontSize: '14px',
                textAlign: 'left',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                lineHeight: 1.5,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--accent-soft)';
                e.currentTarget.style.borderColor = 'rgba(107,158,124,0.3)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#fff';
                e.currentTarget.style.borderColor = 'var(--border)';
              }}
              onTouchStart={(e) => {
                e.currentTarget.style.transform = 'scale(0.98)';
              }}
              onTouchEnd={(e) => {
                e.currentTarget.style.transform = 'scale(1)';
              }}
            >
              {option.text}
            </button>
          ))}
        </div>
      )}

      {/* 结束状态 */}
      {optionsVisible && scene && scene.options.length === 0 && (
        <div
          className="animate-fade-in"
          style={{
            padding: '16px',
            textAlign: 'center',
            background: 'var(--card)',
            borderTop: '1px solid var(--border)',
          }}
        >
          <button
            className="btn-primary"
            onClick={() => goTo('ending')}
          >
            看看我们聊了些什么
          </button>
        </div>
      )}
    </div>
  );
}
