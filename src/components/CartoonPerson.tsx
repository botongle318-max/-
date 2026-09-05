export default function CartoonPerson({ expression = 'normal' }: { expression?: 'normal' | 'smile' | 'curious' | 'mystery' }) {
  return (
    <div className="cartoon-person">
      <div className="cartoon-hair" />
      <div className="cartoon-head">
        <div
          className="cartoon-eye"
          style={{ left: '22px', transform: expression === 'curious' ? 'scaleY(1.3)' : 'none' }}
        />
        <div
          className="cartoon-eye"
          style={{ right: '22px', transform: expression === 'curious' ? 'scaleY(1.3)' : 'none' }}
        />
        {expression === 'smile' && (
          <div
            style={{
              position: 'absolute',
              bottom: '20px',
              left: '50%',
              transform: 'translateX(-50%)',
              width: '20px',
              height: '10px',
              borderBottom: '2.5px solid var(--text)',
              borderRadius: '0 0 20px 20px',
            }}
          />
        )}
        {expression === 'normal' && (
          <div
            style={{
              position: 'absolute',
              bottom: '22px',
              left: '50%',
              transform: 'translateX(-50%)',
              width: '14px',
              height: '3px',
              background: 'var(--text)',
              borderRadius: '2px',
            }}
          />
        )}
        {expression === 'mystery' && (
          <>
            <div
              style={{
                position: 'absolute',
                top: '34px',
                left: '20px',
                width: '10px',
                height: '2px',
                background: 'var(--text)',
                transform: 'rotate(-15deg)',
              }}
            />
            <div
              style={{
                position: 'absolute',
                top: '34px',
                right: '20px',
                width: '10px',
                height: '2px',
                background: 'var(--text)',
                transform: 'rotate(15deg)',
              }}
            />
            <div
              style={{
                position: 'absolute',
                bottom: '20px',
                left: '50%',
                transform: 'translateX(-50%)',
                width: '8px',
                height: '8px',
                border: '2px solid var(--text)',
                borderRadius: '50%',
              }}
            />
          </>
        )}
      </div>
      <div className="cartoon-body" />
      <div className="cartoon-arm" style={{ left: '24px' }} />
      <div className="cartoon-arm" style={{ right: '24px' }} />
      <div className="cartoon-leg" style={{ left: '50px' }} />
      <div className="cartoon-leg" style={{ right: '50px' }} />
    </div>
  );
}
