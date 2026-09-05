import { useGameStore } from '../store/gameStore';
import Avatar from '../components/Avatar';

export default function Home() {
  const goTo = useGameStore((s) => s.goTo);
  const reset = useGameStore((s) => s.reset);

  return (
    <div
      style={{
        width: '100%',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        background: 'var(--bg)',
      }}
    >
      <div style={{ textAlign: 'center', maxWidth: '360px' }}>
        <div className="animate-float" style={{ marginBottom: '20px' }}>
          <Avatar expression="happy" />
        </div>

        <h1
          className="animate-fade-in"
          style={{
            fontSize: '22px',
            fontWeight: 700,
            marginBottom: '8px',
            color: 'var(--text)',
          }}
        >
          卜桐乐的聊天室
        </h1>

        <p
          className="animate-fade-in"
          style={{
            fontSize: '14px',
            color: 'var(--text-light)',
            marginBottom: '28px',
            lineHeight: 1.6,
          }}
        >
          我们好像还不认识？
          <br />
          来随便聊两句吧
        </p>

        <div className="animate-fade-in">
          <button
            className="btn-primary"
            onClick={() => {
              reset();
              goTo('chat');
            }}
          >
            开始聊天
          </button>
        </div>

        <p
          style={{
            fontSize: '11px',
            color: 'var(--text-muted)',
            marginTop: '20px',
          }}
        >
          大概 2~3 分钟的对话
        </p>
      </div>
    </div>
  );
}
