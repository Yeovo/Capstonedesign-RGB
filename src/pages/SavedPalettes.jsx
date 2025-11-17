import { useEffect, useState } from 'react';

const STORAGE_KEY = 'colorPalettes_v1';

export default function SavedPalettes() {
  const [palettes, setPalettes] = useState([]);
  const [exportMenuOpen, setExportMenuOpen] = useState(null);

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

  // 외부 클릭 -> 메뉴 닫기
  useEffect(() => {
    const close = () => setExportMenuOpen(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, []);

  const toggleExportMenu = (id) => {
    setExportMenuOpen(prev => (prev === id ? null : id));
  };

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

  const handleRename = (id) => {
    const newName = window.prompt('새 이름을 입력하세요:');
    if (!newName) return;

    const next = palettes.map(p =>
      p.id === id ? { ...p, name: newName } : p
    );

    setPalettes(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 20 }}>
      {/* 상단 헤더 */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 10,
        flexWrap: 'wrap',
        marginBottom: 16
      }}>
        <h2 style={{ margin: 0 }}>저장된 팔레트</h2>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={handleRefresh} style={btn('#2d7ef7')}>
            새로고침
          </button>

          {palettes.length > 0 && (
            <button onClick={handleClearAll} style={btn('#ef4444')}>
              전체 삭제
            </button>
          )}
        </div>
      </div>

      {/* 비어있을 때 */}
      {palettes.length === 0 && (
        <p style={{ color: '#666' }}>
          아직 저장된 팔레트가 없습니다.<br />
          이미지 분석 후 <strong>“현재 팔레트 저장”</strong> 버튼을 눌러 보세요.
        </p>
      )}

      {/* 팔레트 리스트 */}
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
            {/* 카드 헤더 */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              marginBottom: 8,
              gap: 8,
              position: 'relative'
            }}>

              {/* 제목 */}
              <div>
                <div style={{ fontWeight: 700 }}>
                  {p.name || `팔레트 #${palettes.length - idx}`}
                </div>
                {p.createdAt && (
                  <div style={{ fontSize: 12, color: '#888' }}>
                    {new Date(p.createdAt).toLocaleString()}
                  </div>
                )}
              </div>

              {/* 버튼 영역 */}
              <div style={{
                display: 'flex',
                gap: 8,
                position: 'relative',
                flexWrap: 'wrap'
              }}>
                {/* 1) 이름 바꾸기 */}
                <button
                  onClick={() => handleRename(p.id)}
                  style={btn('#10b981')}
                >
                  이름 바꾸기
                </button>

                {/* 2) 내보내기 */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleExportMenu(p.id);
                  }}
                  style={btn('#3b82f6')}
                >
                  내보내기
                </button>

                {/* 내보내기 메뉴 */}
                {exportMenuOpen === p.id && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      position: 'absolute',
                      top: '120%',
                      right: 0,
                      background: '#fff',
                      border: '1px solid #e5e7eb',
                      borderRadius: 8,
                      boxShadow: '0 4px 10px rgba(0,0,0,0.08)',
                      zIndex: 10,
                      display: 'flex',
                      flexDirection: 'column'
                    }}
                  >
                    <button
                      onClick={() => {
                        downloadAco(p);
                        setExportMenuOpen(null);
                      }}
                      style={menuItem()}
                    >
                      ACO
                    </button>

                    <button
                      onClick={() => {
                        exportCss(p);
                        setExportMenuOpen(null);
                      }}
                      style={menuItem()}
                    >
                      CSS
                    </button>

                    <button
                      onClick={() => {
                        exportJson(p);
                        setExportMenuOpen(null);
                      }}
                      style={menuItem()}
                    >
                      JSON
                    </button>

                    <button
                      onClick={() => {
                        exportPng(p);
                        setExportMenuOpen(null);
                      }}
                      style={menuItem()}
                    >
                      PNG
                    </button>

                    {/* GRD (현재 비활성화)
                    <button
                      onClick={() => {
                        exportGrd(p);
                        setExportMenuOpen(null);
                      }}
                      style={menuItem()}
                    >
                      GRD
                    </button>
                    */}
                  </div>
                )}

                {/* 3) 삭제 */}
                <button
                  onClick={() => handleDeleteOne(p.id)}
                  style={btn('#f97316')}
                >
                  삭제
                </button>
              </div>
            </div>

            {/* 색 막대 */}
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

            {/* 색 상세 목록 */}
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

            {/* 🔹 AI/사용자 태그 칩 */}
            {(p.tags && p.tags.length > 0) && (
              <div
                style={{
                  marginTop: 10,
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 6
                }}
              >
                {p.tags.map((tag, i) => (
                  <span
                    key={i}
                    style={{
                      padding: '3px 8px',
                      borderRadius: 999,
                      background: '#eef2ff',
                      border: '1px solid #c7d2fe',
                      fontSize: 11,
                      color: '#4338ca',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------------- ACO ---------------------- */

function hexToRgb16(hex) {
  const r = parseInt(hex.slice(1, 3), 16) * 257;
  const g = parseInt(hex.slice(3, 5), 16) * 257;
  const b = parseInt(hex.slice(5, 7), 16) * 257;
  return { r, g, b };
}

function createAco(colors) {
  const count = colors.length;
  const buffer = new ArrayBuffer(4 + count * 10);
  const view = new DataView(buffer);

  let offset = 0;
  view.setUint16(offset, 1); offset += 2;
  view.setUint16(offset, count); offset += 2;

  for (const hex of colors) {
    const { r, g, b } = hexToRgb16(hex);

    view.setUint16(offset, 0); offset += 2;
    view.setUint16(offset, r); offset += 2;
    view.setUint16(offset, g); offset += 2;
    view.setUint16(offset, b); offset += 2;
    view.setUint16(offset, 0); offset += 2;
  }

  return buffer;
}

function downloadAco(palette) {
  const colors = palette.colors.map(c => c.hex);
  const buffer = createAco(colors);

  const blob = new Blob([buffer], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `${palette.name || palette.id}.aco`;
  a.click();

  URL.revokeObjectURL(url);
}

/* ---------------------- CSS ---------------------- */

function exportCss(palette) {
  const lines = palette.colors.map((c, i) => `--color-${i + 1}: ${c.hex};`);
  const css = `:root {\n  ${lines.join('\n  ')}\n}`;

  const blob = new Blob([css], { type: 'text/css' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `${palette.name || palette.id}.css`;
  a.click();

  URL.revokeObjectURL(url);
}

/* ---------------------- JSON ---------------------- */

function exportJson(palette) {
  const json = JSON.stringify(palette.colors, null, 2);

  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `${palette.name || palette.id}.json`;
  a.click();

  URL.revokeObjectURL(url);
}

/* ---------------------- PNG ---------------------- */

function exportPng(palette) {
  const colors = palette.colors || [];
  const width = 600;
  const height = 80;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  let x = 0;
  let totalPct = colors.reduce((acc, c) => acc + (c.pct || 1), 0);

  for (const c of colors) {
    const w = (c.pct || 1) / totalPct * width;
    ctx.fillStyle = c.hex;
    ctx.fillRect(x, 0, w, height);
    x += w;
  }

  canvas.toBlob((blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${palette.name || palette.id}.png`;
    a.click();
    URL.revokeObjectURL(url);
  });
}

/* ---------------------- STYLE HELPERS ---------------------- */

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
    lineHeight: 1.2,
    whiteSpace: 'nowrap'
  };
}

function menuItem() {
  return {
    padding: '8px 12px',
    fontSize: 13,
    background: 'white',
    border: 'none',
    textAlign: 'left',
    cursor: 'pointer',
    whiteSpace: 'nowrap'
  };
}
