export default function Avatar({ expression = 'normal' }: { expression?: 'normal' | 'happy' | 'surprised' | 'shy' }) {
  const eyeStyle = expression === 'surprised'
    ? { transform: 'scale(1.3)' }
    : expression === 'shy'
    ? { transform: 'scaleY(0.6)' }
    : {};

  return (
    <div style={{ width: '40px', height: '40px', position: 'relative', flexShrink: 0 }}>
      {/* 脸 */}
      <div
        style={{
          width: '36px',
          height: '36px',
          borderRadius: '50%',
          background: '#f5d0b0',
          border: '2px solid var(--text)',
          position: 'absolute',
          top: '2px',
          left: '2px',
        }}
      >
        {/* 头发 */}
        <div
          style={{
            width: '38px',
            height: '14px',
            background: '#2a2520',
            borderRadius: '19px 19px 0 0',
            position: 'absolute',
            top: '-2px',
            left: '-1px',
            border: '2px solid var(--text)',
          }}
        />
        {/* 眼睛 */}
        <div
          style={{
            width: '4px',
            height: '4px',
            borderRadius: '50%',
            background: 'var(--text)',
            position: 'absolute',
            top: '15px',
            left: '10px',
            ...eyeStyle,
          }}
        />
        <div
          style={{
            width: '4px',
            height: '4px',
            borderRadius: '50%',
            background: 'var(--text)',
            position: 'absolute',
            top: '15px',
            right: '10px',
            ...eyeStyle,
          }}
        />
        {/* 嘴巴 */}
        {expression === 'happy' ? (
          <div
            style={{
              width: '10px',
              height: '5px',
              borderBottom: '2px solid var(--text)',
              borderRadius: '0 0 10px 10px',
              position: 'absolute',
              bottom: '8px',
              left: '50%',
              transform: 'translateX(-50%)',
            }}
          />
        ) : expression === 'shy' ? (
          <div
            style={{
              width: '4px',
              height: '4px',
              border: '1.5px solid var(--text)',
              borderRadius: '50%',
              position: 'absolute',
              bottom: '8px',
              left: '50%',
              transform: 'translateX(-50%)',
            }}
          />
        ) : (
          <div
            style={{
              width: '8px',
              height: '2px',
              background: 'var(--text)',
              borderRadius: '1px',
              position: 'absolute',
              bottom: '9px',
              left: '50%',
              transform: 'translateX(-50%)',
            }}
          />
        )}
      </div>
    </div>
  );
}
