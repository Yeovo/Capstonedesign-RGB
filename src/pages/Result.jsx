import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import xkcdColors from '../assets/xkcd_color.json';

const STORAGE_KEY = 'colorPalettes_v1';

/* ---------- 색상 유틸 ---------- */
const rgb2xyz = (r, g, b) => {
  const srgb = [r, g, b].map(v => {
    v /= 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  const [R, G, B] = srgb;
  const X = R * 0.4124564 + G * 0.3575761 + B * 0.1804375;
  const Y = R * 0.2126729 + G * 0.7151522 + B * 0.0721750;
  const Z = R * 0.0193339 + G * 0.1191920 + B * 0.9503041;
  return [X, Y, Z];
};

const xyz2lab = (X, Y, Z) => {
  const ref = [0.95047, 1, 1.08883];
  const f = t =>
    t > Math.pow(6 / 29, 3)
      ? Math.cbrt(t)
      : (t * (29 / 6) * (29 / 6) / 3 + 4 / 29);
  const [xr, yr, zr] = [X / ref[0], Y / ref[1], Z / ref[2]];
  const fx = f(xr),
    fy = f(yr),
    fz = f(zr);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
};

const rgb2lab = (r, g, b) => xyz2lab(...rgb2xyz(r, g, b));

const labDist = (L1, a1, b1, L2, a2, b2) => {
  const dL = L1 - L2,
    da = a1 - a2,
    db = b1 - b2;
  return Math.sqrt(dL * dL + da * da + db * db);
};

const hex2rgb = hex => {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16)
  ];
};

const rgb2hex = (r, g, b) =>
  '#' +
  [r, g, b]
    .map(v => v.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();

/* ---------- XKCD 색상 이름 ---------- */
const nearestXKCDName = rgb => {
  const lab = rgb2lab(...rgb);
  let best = { name: null, d: Infinity };
  for (const c of xkcdColors) {
    const cRgb = hex2rgb(c.code);
    const d = labDist(...lab, ...rgb2lab(...cRgb));
    if (d < best.d) best = { name: c.english, d };
  }
  return best.name;
};

/* ---------- 팔레트 추출 ---------- */
const extractPalette = async (
  imgUrl,
  clusters = 5,
  sampleSize = 200 * 200,
  iterations = 10
) => {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const img = await new Promise((res, rej) => {
    const i = new Image();
    i.crossOrigin = 'anonymous';
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = imgUrl;
  });
  const ratio = img.width > 320 ? 320 / img.width : 1;
  const w = Math.max(1, Math.round(img.width * ratio));
  const h = Math.max(1, Math.round(img.height * ratio));
  canvas.width = w;
  canvas.height = h;
  ctx.drawImage(img, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);
  const pixels = [];
  const step = Math.max(1, Math.floor((w * h) / sampleSize));
  for (let i = 0; i < w * h; i += step) {
    const o = i * 4,
      r = data[o],
      g = data[o + 1],
      b = data[o + 2],
      a = data[o + 3];
    if (a < 128) continue;
    pixels.push([r, g, b]);
  }
  if (!pixels.length) return [];
  const centers = [];
  for (let c = 0; c < clusters; c++)
    centers.push(pixels[Math.floor(Math.random() * pixels.length)].slice());
  for (let it = 0; it < iterations; it++) {
    const sums = Array.from({ length: clusters }, () => [0, 0, 0, 0]);
    for (const p of pixels) {
      let bi = 0,
        bd = Infinity;
      for (let c = 0; c < clusters; c++) {
        const dr = p[0] - centers[c][0],
          dg = p[1] - centers[c][1],
          db = p[2] - centers[c][2],
          d = dr * dr + dg * dg + db * db;
        if (d < bd) {
          bd = d;
          bi = c;
        }
      }
      const s = sums[bi];
      s[0] += p[0];
      s[1] += p[1];
      s[2] += p[2];
      s[3]++;
    }
    for (let c = 0; c < clusters; c++) {
      if (sums[c][3] === 0)
        centers[c] = pixels[Math.floor(Math.random() * pixels.length)].slice();
      else
        centers[c] = [
          Math.round(sums[c][0] / sums[c][3]),
          Math.round(sums[c][1] / sums[c][3]),
          Math.round(sums[c][2] / sums[c][3])
        ];
    }
  }
  const counts = Array(clusters).fill(0);
  for (const p of pixels) {
    let bi = 0,
      bd = Infinity;
    for (let c = 0; c < clusters; c++) {
      const dr = p[0] - centers[c][0],
        dg = p[1] - centers[c][1],
        db = p[2] - centers[c][2],
        d = dr * dr + dg * dg + db * db;
      if (d < bd) {
        bd = d;
        bi = c;
      }
    }
    counts[bi]++;
  }
  const total = counts.reduce((a, b) => a + b, 0);
  return centers
    .map((rgb, i) => ({
      rgb,
      hex: rgb2hex(...rgb),
      pct: total ? (counts[i] / total) * 100 : 0,
      name: nearestXKCDName(rgb)
    }))
    .sort((a, b) => b.pct - a.pct);
};

/* ---------- 색약 필터 ---------- */
const applyFilter = (r, g, b, mode) => {
  if (mode === 'none') return [r, g, b];
  if (mode === 'protan')
    return [
      r * 0.566 + g * 0.433 + b * 0,
      r * 0.558 + g * 0.442 + b * 0,
      r * 0 + g * 0.242 + b * 0.758
    ];
  if (mode === 'deutan')
    return [
      r * 0.625 + g * 0.375 + b * 0,
      r * 0.7 + g * 0.3 + b * 0,
      r * 0 + g * 0.3 + b * 0.7
    ];
  if (mode === 'tritan')
    return [
      r * 0.95 + g * 0.05 + b * 0,
      r * 0 + g * 0.433 + b * 0.567,
      r * 0 + g * 0.475 + b * 0.525
    ];
  return [r, g, b];
};

/* ---------- 메인 Result ---------- */
export default function Result() {
  const location = useLocation();
  const navigate = useNavigate();
  const { imageUrl } = location.state || {};
  const canvasRef = useRef(null);

  const [palette, setPalette] = useState([]);
  const [selectedIdx, setSelectedIdx] = useState(null);
  const [outlineMode, setOutlineMode] = useState(false);
  const [filterMode, setFilterMode] = useState('none');

  // 🔹 태그 입력/AI 상태
  const [tagInput, setTagInput] = useState('');
  const [tagLoading, setTagLoading] = useState(false);

  if (!imageUrl)
    return (
      <div style={{ padding: 20 }}>
        <p>이미지가 전달되지 않았습니다.</p>
        <button onClick={() => navigate('/')}>업로드 페이지로</button>
      </div>
    );

  /* ---------- 팔레트 추출 ---------- */
  useEffect(() => {
    let mounted = true;
    (async () => {
      const pal = await extractPalette(imageUrl, 5);
      if (mounted) setPalette(pal);
    })();
    return () => {
      mounted = false;
    };
  }, [imageUrl]);

  /* ---------- 캔버스 그리기 ---------- */
  useEffect(() => {
    if (!canvasRef.current || !palette.length) return;
    (async () => {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      const img = await new Promise((res, rej) => {
        const i = new Image();
        i.crossOrigin = 'anonymous';
        i.onload = () => res(i);
        i.onerror = rej;
        i.src = imageUrl;
      });
      const maxW = 1440;
      const ratio = img.width > maxW ? maxW / img.width : 1;
      const w = Math.round(img.width * ratio),
        h = Math.round(img.height * ratio);
      canvas.width = w;
      canvas.height = h;
      ctx.drawImage(img, 0, 0, w, h);
      const imgData = ctx.getImageData(0, 0, w, h);
      const d = imgData.data;

      const paletteLab = palette.map(p => rgb2lab(...p.rgb));
      const clusterMap = new Uint8Array(w * h);

      // clusterMap 계산
      for (let i = 0; i < d.length; i += 4) {
        const r0 = d[i],
          g0 = d[i + 1],
          b0 = d[i + 2];
        const lab = rgb2lab(r0, g0, b0);
        let minDist = Infinity,
          minIdx = -1;
        paletteLab.forEach((pl, idx) => {
          const dist = labDist(...lab, ...pl);
          if (dist < minDist) {
            minDist = dist;
            minIdx = idx;
          }
        });
        clusterMap[i / 4] = minIdx;
      }

      // 필터 및 강조
      for (let i = 0; i < d.length; i += 4) {
        let r = d[i],
          g = d[i + 1],
          b = d[i + 2];

        [r, g, b] = applyFilter(r, g, b, filterMode);

        const clusterIdx = clusterMap[i / 4];
        if (!(selectedIdx === null || clusterIdx === selectedIdx)) {
          const gray = Math.round(
            0.2126 * r + 0.7152 * g + 0.0722 * b
          );
          r = g = b = gray;
        }

        d[i] = r;
        d[i + 1] = g;
        d[i + 2] = b;
      }

      // 외곽선
      if (outlineMode) {
        const borderColor = [0, 0, 0];
        for (let y = 1; y < h - 1; y++) {
          for (let x = 1; x < w - 1; x++) {
            const idx = y * w + x;
            const c = clusterMap[idx];

            const neighbors = [
              clusterMap[idx - 1],
              clusterMap[idx + 1],
              clusterMap[idx - w],
              clusterMap[idx + w],
              clusterMap[idx - w - 1],
              clusterMap[idx - w + 1],
              clusterMap[idx + w - 1],
              clusterMap[idx + w + 1]
            ];

            const different = neighbors.some(n => n !== c);

            if (different) {
              const o = idx * 4;
              d[o] = borderColor[0];
              d[o + 1] = borderColor[1];
              d[o + 2] = borderColor[2];
            }
          }
        }
      }

      ctx.putImageData(imgData, 0, 0);
    })();
  }, [imageUrl, palette, selectedIdx, outlineMode, filterMode]);

  /* ---------- AI 태그 생성 ---------- */
  const handleAiTags = async () => {
    if (!palette.length) {
      alert('팔레트가 아직 준비되지 않았습니다.');
      return;
    }
    try {
      setTagLoading(true);
      const res = await fetch('/api/tag-image', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          palette,          // 그대로 보내도 됨 (백엔드에서 JSON.stringify 해서 프롬프트에만 사용)
          imageDescription: '' // 나중에 이미지 설명을 따로 넣고 싶으면 여기 채우기
        })
      });

      if (!res.ok) {
        const text = await res.text();
        console.error('API error:', text);
        alert('AI 태그 생성 중 오류가 발생했습니다.');
        return;
      }

      const data = await res.json();
      const tags =
        Array.isArray(data.tags) && data.tags.length
          ? data.tags
          : (data.raw || '')
              .split(',')
              .map(t => t.trim())
              .filter(Boolean);

      if (!tags.length) {
        alert('생성된 태그가 없습니다.');
        return;
      }

      setTagInput(tags.join(', '));
    } catch (e) {
      console.error(e);
      alert('AI 태그 생성 중 오류가 발생했습니다.');
    } finally {
      setTagLoading(false);
    }
  };

  /* ---------- 팔레트 저장 ---------- */
  const handleSavePalette = () => {
    if (!palette.length) {
      alert('저장할 팔레트가 없습니다.');
      return;
    }

    const tags = tagInput
      .split(',')
      .map(t => t.trim())
      .filter(Boolean);

    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const prev = raw ? JSON.parse(raw) : [];

      const entry = {
        id: Date.now().toString(),
        createdAt: new Date().toISOString(),
        name: '',
        colors: palette.map(p => ({
          hex: p.hex,
          name: p.name,
          pct: p.pct
        })),
        tags
      };

      const next = [entry, ...prev];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      alert('팔레트를 저장했습니다.\n상단 메뉴의 Palettes 페이지에서 확인할 수 있어요.');
    } catch (e) {
      console.error(e);
      alert('팔레트 저장 중 오류가 발생했습니다.');
    }
  };

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: 20 }}>
      {/* 제목 + 저장 버튼 */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 8,
          gap: 12,
          flexWrap: 'wrap'
        }}
      >
        <h2 style={{ margin: 0 }}>색상 분석 결과</h2>
        <button
          onClick={handleSavePalette}
          style={{
            padding: '8px 14px',
            borderRadius: 999,
            border: 'none',
            cursor: 'pointer',
            background: '#10b981',
            color: '#fff',
            fontWeight: 700,
            fontSize: 14
          }}
        >
          현재 팔레트 저장
        </button>
      </div>

      {/* 필터/외곽선 */}
      <div
        style={{
          display: 'flex',
          gap: 20,
          alignItems: 'center',
          marginBottom: 12,
          flexWrap: 'wrap'
        }}
      >
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 10,
            alignItems: 'center'
          }}
        >
          <strong>필터:</strong>
          {['none', 'protan', 'deutan', 'tritan'].map(m => (
            <button
              key={m}
              onClick={() => setFilterMode(m)}
              style={{
                padding: '6px 12px',
                borderRadius: 10,
                border: '1px solid #d1d5db',
                cursor: 'pointer',
                background: filterMode === m ? '#2d7ef7' : '#fff',
                color: filterMode === m ? '#fff' : '#111',
                fontWeight: 600
              }}
            >
              {m === 'none'
                ? 'None'
                : m === 'protan'
                ? '적색약'
                : m === 'deutan'
                ? '녹색약'
                : '청색약'}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>외곽선 강조</span>
          <label
            style={{ position: 'relative', width: 50, height: 26, cursor: 'pointer' }}
          >
            <input
              type="checkbox"
              checked={outlineMode}
              onChange={() => setOutlineMode(o => !o)}
              style={{ display: 'none' }}
            />
            <span
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: outlineMode ? '#2d7ef7' : '#ccc',
                borderRadius: 26,
                transition: '0.3s'
              }}
            />
            <span
              style={{
                position: 'absolute',
                top: 2,
                left: outlineMode ? 24 : 2,
                width: 22,
                height: 22,
                background: '#fff',
                borderRadius: '50%',
                transition: '0.3s',
                boxShadow: '0 1px 3px rgba(0,0,0,0.3)'
              }}
            />
          </label>
        </div>
      </div>

      {/* 🔹 태그 입력 + AI 버튼 */}
      <div
        style={{
          marginBottom: 16,
          display: 'flex',
          gap: 8,
          alignItems: 'center',
          flexWrap: 'wrap'
        }}
      >
        <input
          type="text"
          placeholder="태그 (쉼표로 구분: 예) 초록, 숲, 저채도)"
          value={tagInput}
          onChange={e => setTagInput(e.target.value)}
          style={{
            flex: 1,
            minWidth: 240,
            padding: '8px 10px',
            borderRadius: 999,
            border: '1px solid #d1d5db',
            fontSize: 13
          }}
        />
        <button
          onClick={handleAiTags}
          disabled={tagLoading}
          style={{
            padding: '8px 14px',
            borderRadius: 999,
            border: 'none',
            cursor: tagLoading ? 'default' : 'pointer',
            background: '#6366f1',
            color: '#fff',
            fontWeight: 600,
            fontSize: 13,
            opacity: tagLoading ? 0.7 : 1
          }}
        >
          {tagLoading ? '생성 중…' : 'AI 태그 추천'}
        </button>
      </div>

      {/* 캔버스 + 팔레트 */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20 }}>
        <canvas
          ref={canvasRef}
          style={{
            border: '1px solid #ccc',
            borderRadius: 8,
            maxWidth: '70%',
            height: 'auto'
          }}
        />

        <div style={{ width: '30%' }}>
          <h3 style={{ marginTop: 0 }}>팔레트</h3>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              overflowY: 'auto',
              maxHeight: '70vh'
            }}
          >
            {palette.map((p, i) => (
              <div
                key={i}
                onClick={() =>
                  setSelectedIdx(prev => (prev === i ? null : i))
                }
                style={{
                  cursor: 'pointer',
                  padding: 8,
                  borderRadius: 8,
                  border:
                    i === selectedIdx
                      ? '3px solid #2d7ef7'
                      : '1px solid #ccc',
                  background: '#fafafa'
                }}
              >
                <div
                  style={{
                    width: '100%',
                    height: 40,
                    borderRadius: 6,
                    background: p.hex
                  }}
                />
                <p style={{ margin: '6px 0 0 0', fontSize: 13 }}>
                  {p.name || '(이름 없음)'}
                </p>
                <code>{p.hex}</code>
                <br />
                <small>{p.pct.toFixed(1)}%</small>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
