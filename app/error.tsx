'use client';

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div
      style={{
        height: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        fontFamily: 'sans-serif',
        color: '#1f2a24',
        padding: 24,
        textAlign: 'center',
      }}
    >
      <h2 style={{ fontSize: 18 }}>문제가 발생했습니다</h2>
      <p style={{ color: '#6b7a72', fontSize: 14 }}>화면을 표시하는 중 오류가 났어요. 다시 시도해 주세요.</p>
      <button
        onClick={reset}
        style={{
          background: '#00873c',
          color: '#fff',
          border: 'none',
          borderRadius: 10,
          padding: '10px 20px',
          fontSize: 14,
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        다시 불러오기
      </button>
    </div>
  );
}
