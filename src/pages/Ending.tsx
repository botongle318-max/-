import { useGameStore } from '../store/gameStore';
import Avatar from '../components/Avatar';

export default function Ending() {
  const fragments = useGameStore((s) => s.fragments);
  const goTo = useGameStore((s) => s.goTo);
  const reset = useGameStore((s) => s.reset);

  const unlocked = fragments.filter((f) => f.unlocked);
  const locked = fragments.filter((f) => !f.unlocked);

  return (
    <div
      style={{
        width: '100%',
        minHeight: '100vh',
        padding: '24px 20px 40px',
        background: 'var(--bg)',
      }}
    >
      <div style={{ maxWidth: '420px', margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <Avatar expression="happy" />
          <h1 style={{ fontSize: '20px', fontWeight: 700, marginTop: '12px', color: 'var(--text)' }}>
            聊完了
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
            这是我们聊到的关于卜桐乐的事
          </p>
        </div>

        {/* 已解锁碎片 */}
        <div
          style={{
            background: 'var(--card)',
            borderRadius: '16px',
            padding: '20px',
            marginBottom: '16px',
            boxShadow: 'var(--shadow)',
          }}
        >
          <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '12px' }}>
            已收集 {unlocked.length} / {fragments.length}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {unlocked.map((f) => (
              <span
                key={f.id}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '6px 12px',
                  background: 'var(--accent-soft)',
                  borderRadius: '20px',
                  fontSize: '13px',
                  color: 'var(--accent)',
                }}
              >
                {f.emoji} {f.title}
              </span>
            ))}
          </div>
        </div>

        {/* 未解锁碎片 */}
        {locked.length > 0 && (
          <div
            style={{
              background: 'var(--card)',
              borderRadius: '16px',
              padding: '20px',
              marginBottom: '16px',
              boxShadow: 'var(--shadow)',
            }}
          >
            <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '12px' }}>
              还有 {locked.length} 个没有聊到
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {locked.map((f) => (
                <span
                  key={f.id}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '6px 12px',
                    background: 'rgba(154,148,142,0.08)',
                    borderRadius: '20px',
                    fontSize: '13px',
                    color: 'var(--text-muted)',
                  }}
                >
                  {f.id === 'hidden' ? '❓' : '🔒'} {f.title}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* 结语 */}
        <div
          style={{
            textAlign: 'center',
            padding: '20px',
            fontSize: '14px',
            color: 'var(--text-light)',
            lineHeight: 2,
          }}
        >
          <p>
            聊了这么多，你应该对我有一点了解了吧。
          </p>
          <p>
            但说实话，聊天能了解的也就这么多了。
          </p>
          <p style={{ fontStyle: 'italic', color: 'var(--text-muted)' }}>
            真正认识一个人，还是需要时间。
          </p>
          <p>
            以后有机会再慢慢聊吧。
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '24px' }}>
          <button
            className="btn-primary"
            onClick={() => {
              reset();
              goTo('chat');
            }}
          >
            再聊一次
          </button>
          <button
            className="btn-ghost"
            onClick={() => goTo('home')}
          >
            回到首页
          </button>
        </div>
      </div>
    </div>
  );
}
