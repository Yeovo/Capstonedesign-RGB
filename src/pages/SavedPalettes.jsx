import { useEffect, useState } from 'react';

const STORAGE_KEY = 'colorPalettes_v1';

export default function SavedPalettes() {
  const [palettes, setPalettes] = useState([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        setPalettes(Array.isArray(parsed) ? parsed : []);
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

  const handleRefresh = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        setPalettes(Array.isArray(parsed) ? parsed : []);
      } else {
        setPalettes([]);
      }
    } catch (e) {
      console.error(e);
      alert('팔레트를 다시 불러오는 중 오류가 발생했습니다.');
    }
  };

  const handleClearAll = () => {
    if (!window.confirm('모든 저장된 팔레트를 삭제할까요?')) return;
    localStorage.removeItem(STORAGE_KEY);
    setPalettes([]);
  };

  const handleDeleteOne = (id) => {
    if (!window.confirm('이 팔레트를 삭제할까요?')) return;
    const next = palettes.filter(p => p.id !== id);
    setPalettes(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 20 }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 10,
        marginBottom: 16,
        flexWrap: 'wrap'
      }}>
        <h2 style={{ margin: 0 }}>저장된 팔레트</h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            onClick={handleRefresh}
            style={btn('#2d7ef7')}
          >
            새로고침
          </button>
          {palettes.length > 0 && (
            <button
              onClick={handleClearAll}
              style={btn('#ef4444')}
            >
              전체 삭제
            </button>
          )}
        </div>
      </div>

      {palettes.length === 0 && (
        <p style={{ color: '#666' }}>
          아직 저장된 팔레트가 없습니다.<br />
          이미지 분석 후 <strong>“현재 팔레트 저장”</strong> 버튼을 눌러 보세요.
        </p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {palettes.map((p, idx) => (
          <div
            key={p.id}
            style={{
              border: '1px solid #e5e7eb',
              borderRadius: 12,
              padding: 12,
              background: '#fafafa'
            }}
          >
            {/* 헤더 */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 8,
              gap: 8
            }}>
              <div>
                <div style={{ fontWeight: 700 }}>
                  팔레트 #{palettes.length - idx}
                </div>
                {p.createdAt && (
                  <div style={{ fontSize: 12, color: '#888' }}>
                    {new Date(p.createdAt).toLocaleString()}
                  </div>
                )}
              </div>
              <button
                onClick={() => handleDeleteOne(p.id)}
                style={btn('#f97316')}
              >
                삭제
              </button>
            </div>

            {/* 색 바 (막대) */}
            <div style={{
              display: 'flex',
              borderRadius: 8,
              overflow: 'hidden',
              height: 34,
              marginBottom: 8
            }}>
              {(p.colors || []).map((c, i) => (
                <div
                  key={i}
                  style={{
                    flex: c.pct > 0 ? c.pct : 1,
                    background: c.hex,
                    minWidth: 24
                  }}
                  title={`${c.name || ''} ${c.hex} (${c.pct?.toFixed?.(1) ?? '0.0'}%)`}
                />
              ))}
            </div>

            {/* 색 정보 리스트 */}
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 8
            }}>
              {(p.colors || []).map((c, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '4px 6px',
                    borderRadius: 8,
                    background: '#ffffff',
                    border: '1px solid #e5e7eb',
                    fontSize: 12
                  }}
                >
                  <span style={{
                    width: 14,
                    height: 14,
                    borderRadius: 4,
                    background: c.hex,
                    border: '1px solid #e5e7eb'
                  }} />
                  <span>{c.name || '(이름 없음)'}</span>
                  <code style={{ color: '#4b5563' }}>{c.hex}</code>
                  <span style={{ color: '#9ca3af' }}>
                    {c.pct?.toFixed?.(1) ?? '0.0'}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function btn(bg) {
  return {
    background: bg,
    color: '#fff',
    border: 0,
    padding: '7px 12px',
    borderRadius: 999,
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 600,
    lineHeight: 1.2
  };
}
