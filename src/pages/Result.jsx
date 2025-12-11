import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import xkcdColors from '../assets/xkcd_color.json';

/* ---------- localStorage 키 ---------- */
const STORAGE_KEY = 'colorPalettes_v1';
const CVD_PROFILE_KEY = 'colorVisionProfile_v6';

/* ---------- 색상 유틸 ---------- */
const rgb2xyz = (r, g, b) => {
  const srgb = [r, g, b].map(v => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4) });
  const [R, G, B] = srgb;
  const X = R * 0.4124564 + G * 0.3575761 + B * 0.1804375;
  const Y = R * 0.2126729 + G * 0.7151522 + B * 0.0721750;
  const Z = R * 0.0193339 + G * 0.1191920 + B * 0.9503041;
  return [X, Y, Z];
};

const xyz2lab = (X, Y, Z) => {
  const ref = [0.95047, 1, 1.08883];
  const f = t => t > Math.pow(6 / 29, 3) ? Math.cbrt(t) : (t * (29 / 6) * (29 / 6) / 3 + 4 / 29);
  const [xr, yr, zr] = [X / ref[0], Y / ref[1], Z / ref[2]];
  const fx = f(xr), fy = f(yr), fz = f(zr);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
};

const rgb2lab = (r, g, b) => xyz2lab(...rgb2xyz(r, g, b));

const labDist = (L1, a1, b1, L2, a2, b2) => {
  const dL = L1 - L2, da = a1 - a2, db = b1 - b2;
  return Math.sqrt(dL * dL + da * da + db * db);
};

const hex2rgb = (hex) => {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
};

const rgb2hex = (r, g, b) =>
  '#' + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();

/* ---------- RGB ↔ HSL 변환 ---------- */
const rgb2hsl = (r, g, b) => {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  
  if (max === min) return [0, 0, l];
  
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  
  let h;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  
  return [h * 360, s, l];
};

const hsl2rgb = (h, s, l) => {
  h = h / 360;
  const hue2rgb = (p, q, t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1/6) return p + (q - p) * 6 * t;
    if (t < 1/2) return q;
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
    return p;
  };
  
  if (s === 0) {
    const gray = l * 255;
    return [gray, gray, gray];
  }
  
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  
  return [
    hue2rgb(p, q, h + 1/3) * 255,
    hue2rgb(p, q, h) * 255,
    hue2rgb(p, q, h - 1/3) * 255
  ];
};

/* ---------- XKCD 색상 이름 찾기 ---------- */
const nearestXKCDName = (rgb) => {
  const lab = rgb2lab(...rgb);
  let best = { name: null, d: Infinity };
  for (const c of xkcdColors) {
    const cRgb = hex2rgb(c.code);
    const d = labDist(...lab, ...rgb2lab(...cRgb));
    if (d < best.d) { best = { name: c.english, d }; }
  }
  return best.name;
};

/* ---------- 빠른 K-means 팔레트 추출 ---------- */
const extractPalette = async (imgUrl, targetClusters = 8, iterations = 12) => {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const img = await new Promise((res, rej) => {
    const i = new Image(); 
    i.crossOrigin = 'anonymous';
    i.onload = () => res(i); 
    i.onerror = rej; 
    i.src = imgUrl;
  });
  
  // 이미지 리사이즈 (속도 개선)
  const ratio = img.width > 400 ? 400 / img.width : 1;
  const w = Math.max(1, Math.round(img.width * ratio));
  const h = Math.max(1, Math.round(img.height * ratio));
  canvas.width = w; 
  canvas.height = h;
  ctx.drawImage(img, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);
  
  // 픽셀 샘플링 (최대 5000개로 제한)
  const pixels = [];
  const maxSamples = 5000;
  const step = Math.max(1, Math.floor((w * h) / maxSamples));
  
  for (let i = 0; i < w * h; i += step) {
    const o = i * 4;
    const r = data[o], g = data[o + 1], b = data[o + 2], a = data[o + 3];
    if (a < 128) continue;
    
    const [hue, sat, light] = rgb2hsl(r, g, b);
    if (sat < 0.05 && (light < 0.05 || light > 0.95)) continue;
    
    pixels.push([r, g, b]);
  }
  
  if (!pixels.length) return [];
  
  // 동적 k 결정 (단순화)
  const k = Math.min(targetClusters, Math.max(3, Math.floor(pixels.length / 100)));
  
  // K-means 실행 (단순 RGB 거리)
  const centers = runFastKMeans(pixels, k, iterations);
  
  // 각 클러스터의 픽셀 수 계산
  const counts = Array(k).fill(0);
  for (const p of pixels) {
    let bi = 0, bd = Infinity;
    for (let c = 0; c < k; c++) {
      const dr = p[0] - centers[c][0];
      const dg = p[1] - centers[c][1];
      const db = p[2] - centers[c][2];
      const d = dr * dr + dg * dg + db * db;
      if (d < bd) { bd = d; bi = c; }
    }
    counts[bi]++;
  }
  
  const total = counts.reduce((a, b) => a + b, 0);
  
  // 팔레트 생성
  let palette = centers
    .map((rgb, i) => ({
      rgb,
      hex: rgb2hex(...rgb),
      pct: total ? (counts[i] / total * 100) : 0,
      name: nearestXKCDName(rgb),
    }))
    .filter(p => p.pct >= 1.0)
    .sort((a, b) => b.pct - a.pct);
  
  // 비슷한 색상 병합 (선택적)
  const merged = mergeSimilarColors(palette);
  
  return merged;
};

/* ---------- 빠른 K-means (RGB 거리만 사용) ---------- */
function runFastKMeans(pixels, k, iterations) {
  const centers = [];
  
  // K-means++ 초기화
  const initialIdx = Math.floor(Math.random() * pixels.length);
  centers.push(pixels[initialIdx].slice());
  
  for (let c = 1; c < k; c++) {
    const distances = pixels.map(p => {
      let minDist = Infinity;
      for (const center of centers) {
        const dr = p[0] - center[0];
        const dg = p[1] - center[1];
        const db = p[2] - center[2];
        const d = dr * dr + dg * dg + db * db;
        if (d < minDist) minDist = d;
      }
      return minDist;
    });
    
    const totalDist = distances.reduce((a, b) => a + b, 0);
    let rand = Math.random() * totalDist;
    
    for (let i = 0; i < pixels.length; i++) {
      rand -= distances[i];
      if (rand <= 0) {
        centers.push(pixels[i].slice());
        break;
      }
    }
  }
  
  // K-means 반복
  for (let it = 0; it < iterations; it++) {
    const sums = Array.from({ length: k }, () => [0, 0, 0, 0]);
    
    for (const p of pixels) {
      let bi = 0, bd = Infinity;
      
      for (let c = 0; c < k; c++) {
        const dr = p[0] - centers[c][0];
        const dg = p[1] - centers[c][1];
        const db = p[2] - centers[c][2];
        const d = dr * dr + dg * dg + db * db;
        if (d < bd) { bd = d; bi = c; }
      }
      
      const s = sums[bi];
      s[0] += p[0]; s[1] += p[1]; s[2] += p[2]; s[3]++;
    }
    
    for (let c = 0; c < k; c++) {
      if (sums[c][3] === 0) {
        const randIdx = Math.floor(Math.random() * pixels.length);
        centers[c] = pixels[randIdx].slice();
      } else {
        centers[c] = [
          Math.round(sums[c][0] / sums[c][3]),
          Math.round(sums[c][1] / sums[c][3]),
          Math.round(sums[c][2] / sums[c][3]),
        ];
      }
    }
  }
  
  return centers;
}

/* ---------- 비슷한 색상 병합 ---------- */
function mergeSimilarColors(palette) {
  const merged = [];
  const used = new Set();
  
  for (let i = 0; i < palette.length; i++) {
    if (used.has(i)) continue;
    
    const p1 = palette[i];
    const toMerge = [i];
    
    for (let j = i + 1; j < palette.length; j++) {
      if (used.has(j)) continue;
      
      const p2 = palette[j];
      const lab1 = rgb2lab(...p1.rgb);
      const lab2 = rgb2lab(...p2.rgb);
      const dist = labDist(...lab1, ...lab2);
      
      // LAB 거리 15 미만이면 병합
      if (dist < 15) {
        toMerge.push(j);
        used.add(j);
      }
    }
    
    if (toMerge.length > 1) {
      let totalR = 0, totalG = 0, totalB = 0, totalPct = 0;
      
      for (const idx of toMerge) {
        const p = palette[idx];
        totalR += p.rgb[0] * p.pct;
        totalG += p.rgb[1] * p.pct;
        totalB += p.rgb[2] * p.pct;
        totalPct += p.pct;
      }
      
      const avgRgb = [
        Math.round(totalR / totalPct),
        Math.round(totalG / totalPct),
        Math.round(totalB / totalPct)
      ];
      
      merged.push({
        rgb: avgRgb,
        hex: rgb2hex(...avgRgb),
        pct: totalPct,
        name: nearestXKCDName(avgRgb)
      });
    } else {
      merged.push(p1);
    }
  }
  
  return merged.sort((a, b) => b.pct - a.pct);
}

/* ---------- 개인 맞춤 CVD 필터 ---------- */
const applyCVDFilter = (r, g, b, cvdProfile) => {
  if (!cvdProfile || !cvdProfile.confusionPair) return [r, g, b];
  
  const [h, s, l] = rgb2hsl(r, g, b);
  
  if (s < 0.08 || l < 0.05 || l > 0.95) {
    return [r, g, b];
  }
  
  const { hueA, hueB } = cvdProfile.confusionPair;
  const maxWidth = cvdProfile.maxWidth || 0;
  
  const oppositeA = (hueA + 180) % 360;
  const oppositeB = (hueB + 180) % 360;
  
  const confusionPoints = [hueA, hueB, oppositeA, oppositeB];
  const zoneWidth = 35 + maxWidth * 3;
  
  let minDist = 999;
  
  for (const point of confusionPoints) {
    const dist = Math.min(
      Math.abs(h - point),
      Math.abs(h - point + 360),
      Math.abs(h - point - 360)
    );
    
    if (dist < minDist) {
      minDist = dist;
    }
  }
  
  if (minDist > zoneWidth) {
    return [r, g, b];
  }
  
  const axisCenter = (hueA + hueB) / 2;
  
  let perpendicular1 = (axisCenter + 90) % 360;
  let perpendicular2 = (axisCenter - 90 + 360) % 360;
  
  const distToPer1 = Math.min(
    Math.abs(h - perpendicular1),
    Math.abs(h - perpendicular1 + 360),
    Math.abs(h - perpendicular1 - 360)
  );
  
  const distToPer2 = Math.min(
    Math.abs(h - perpendicular2),
    Math.abs(h - perpendicular2 + 360),
    Math.abs(h - perpendicular2 - 360)
  );
  
  const targetHue = distToPer1 < distToPer2 ? perpendicular1 : perpendicular2;
  
  const intensity = 1 - (minDist / zoneWidth);
  const shiftAmount = 60 * intensity;
  
  let newH = h + (targetHue > h ? shiftAmount : -shiftAmount);
  
  while (newH < 0) newH += 360;
  while (newH >= 360) newH -= 360;
  
  let newS = Math.min(1, s * 1.2);
  
  const [newR, newG, newB] = hsl2rgb(newH, newS, l);
  
  if (isNaN(newR) || isNaN(newG) || isNaN(newB)) {
    return [r, g, b];
  }
  
  return [
    Math.max(0, Math.min(255, newR)),
    Math.max(0, Math.min(255, newG)),
    Math.max(0, Math.min(255, newB))
  ];
};

/* ---------- 색약 혼동 검사 (단순화 및 수정) ---------- */
const areColorsConfused = (rgb1, rgb2, cvdProfile) => {
  if (!cvdProfile || !cvdProfile.confusionPair) return false;
  
  const { hueA, hueB } = cvdProfile.confusionPair;
  const maxWidth = cvdProfile.maxWidth || 0;
  
  const [h1, s1, l1] = rgb2hsl(...rgb1);
  const [h2, s2, l2] = rgb2hsl(...rgb2);
  
  // 1. 무채색 제외
  if (s1 < 0.12 || s2 < 0.12) return false;
  
  // 2. 명도 차이가 너무 크면 구분 가능
  const lightnessDiff = Math.abs(l1 - l2);
  if (lightnessDiff > 0.4) return false;
  
  // 3. 원래부터 너무 비슷한 색 제외
  const lab1 = rgb2lab(...rgb1);
  const lab2 = rgb2lab(...rgb2);
  const labDistance = labDist(...lab1, ...lab2);
  if (labDistance < 12) return false;
  
  // 4. 혼동 범위 계산 (더 넓게)
  const range = 60 + maxWidth * 2;
  
  // 각 색상이 hueA 또는 hueB 근처에 있는지 확인
  const distToA1 = Math.min(Math.abs(h1 - hueA), 360 - Math.abs(h1 - hueA));
  const distToB1 = Math.min(Math.abs(h1 - hueB), 360 - Math.abs(h1 - hueB));
  const distToA2 = Math.min(Math.abs(h2 - hueA), 360 - Math.abs(h2 - hueA));
  const distToB2 = Math.min(Math.abs(h2 - hueB), 360 - Math.abs(h2 - hueB));
  
  const nearA1 = distToA1 < range;
  const nearB1 = distToB1 < range;
  const nearA2 = distToA2 < range;
  const nearB2 = distToB2 < range;
  
  // 5. 한 색상은 A 근처, 다른 색상은 B 근처면 혼동
  const confused = (nearA1 && nearB2) || (nearB1 && nearA2);
  
  if (!confused) return false;
  
  // 6. 추가 검증: 채도 차이
  const satDiff = Math.abs(s1 - s2);
  if (satDiff > 0.45) return false;
  
  return true;
};

/* ---------- 팔레트에서 혼동 쌍 찾기 ---------- */
const findConfusedPairs = (palette, cvdProfile) => {
  if (!cvdProfile || !palette.length || palette.length < 2) return [];
  
  const pairs = [];
  
  for (let i = 0; i < palette.length; i++) {
    for (let j = i + 1; j < palette.length; j++) {
      if (areColorsConfused(palette[i].rgb, palette[j].rgb, cvdProfile)) {
        pairs.push([i, j]);
      }
    }
  }
  
  return pairs;
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
  const [cvdFilterEnabled, setCvdFilterEnabled] = useState(false);
  const [cvdProfile, setCvdProfile] = useState(null);
  const [confusedPairs, setConfusedPairs] = useState([]);
  const [isExtracting, setIsExtracting] = useState(false);

  // CVD 프로파일 로드
  useEffect(() => {
    try {
      const raw = localStorage.getItem(CVD_PROFILE_KEY);
      if (raw) {
        const profile = JSON.parse(raw);
        setCvdProfile(profile);
      }
    } catch (e) {
      console.error('CVD 프로파일 로드 실패:', e);
    }
  }, []);

  if (!imageUrl) {
    return (
      <div style={{ padding: 20 }}>
        <p>이미지가 전달되지 않았습니다.</p>
        <button onClick={() => navigate('/')}>업로드 페이지로</button>
      </div>
    );
  }

  // 팔레트 추출 (CVD와 독립적)
  useEffect(() => {
    let mounted = true;
    
    const extractAsync = async () => {
      setIsExtracting(true);
      
      await new Promise(resolve => setTimeout(resolve, 50));
      
      const pal = await extractPalette(imageUrl);
      
      if (mounted) {
        setPalette(pal);
        setIsExtracting(false);
      }
    };
    
    extractAsync();
    
    return () => { mounted = false; };
  }, [imageUrl]);

  // 혼동 쌍 계산 (동기 처리로 단순화)
  useEffect(() => {
    if (!palette.length || !cvdProfile) {
      setConfusedPairs([]);
      return;
    }
    
    const pairs = findConfusedPairs(palette, cvdProfile);
    setConfusedPairs(pairs);
  }, [palette, cvdProfile]);

  // 보색 계산 함수 추가
const getComplementaryColor = (r, g, b) => {
  const [h, s, l] = rgb2hsl(r, g, b);
  // 보색은 색상환에서 180도 반대편
  const compH = (h + 180) % 360;
  // 채도는 약간 낮추고, 명도는 중간~밝게
  const compS = Math.min(s * 0.8, 0.6);
  const compL = 0.75; // 밝게 해서 오버레이로 적합하게
  return hsl2rgb(compH, compS, compL);
};

// 캔버스 그리기 부분 수정
useEffect(() => {
  if (!canvasRef.current || !palette.length) return;
  
  (async () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const img = await new Promise((res, rej) => {
      const i = new Image(); i.crossOrigin = 'anonymous';
      i.onload = () => res(i); i.onerror = rej; i.src = imageUrl;
    });

    const maxW = 1440;
    const ratio = img.width > maxW ? maxW / img.width : 1;
    const w = Math.round(img.width * ratio);
    const h = Math.round(img.height * ratio);
    canvas.width = w; canvas.height = h;

    ctx.drawImage(img, 0, 0, w, h);
    const imgData = ctx.getImageData(0, 0, w, h);
    const d = imgData.data;

    const paletteLab = palette.map(p => rgb2lab(...p.rgb));
    const clusterMap = new Uint8Array(w * h);

    // clusterMap 계산
    for (let i = 0; i < d.length; i += 4) {
      const r0 = d[i], g0 = d[i + 1], b0 = d[i + 2];
      const lab = rgb2lab(r0, g0, b0);
      let minDist = Infinity, minIdx = -1;
      paletteLab.forEach((pl, idx) => {
        const dist = labDist(...lab, ...pl);
        if (dist < minDist) { minDist = dist; minIdx = idx; }
      });
      clusterMap[i / 4] = minIdx;
    }

    // ✅ 선택된 색상의 보색 계산 (한 번만)
    let complementaryRGB = null;
    if (selectedIdx !== null) {
      const selectedColor = palette[selectedIdx].rgb;
      complementaryRGB = getComplementaryColor(...selectedColor);
    }

    // 필터 적용
    for (let i = 0; i < d.length; i += 4) {
      let r = d[i], g = d[i + 1], b = d[i + 2];
      
      if (cvdFilterEnabled && cvdProfile) {
        [r, g, b] = applyCVDFilter(r, g, b, cvdProfile);
      }

      const clusterIdx = clusterMap[i / 4];
      
      // ✅ 보색 오버레이 적용
      if (selectedIdx !== null && clusterIdx !== selectedIdx) {
        const alpha = 0.75; // 75% 오버레이 강도
        r = r * (1 - alpha) + complementaryRGB[0] * alpha;
        g = g * (1 - alpha) + complementaryRGB[1] * alpha;
        b = b * (1 - alpha) + complementaryRGB[2] * alpha;
      }

      d[i] = Math.max(0, Math.min(255, Math.round(r)));
      d[i + 1] = Math.max(0, Math.min(255, Math.round(g)));
      d[i + 2] = Math.max(0, Math.min(255, Math.round(b)));
    }

    // 외곽선 강조
    if (outlineMode) {
      const borderColor = [0, 0, 0];
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          const idx = y * w + x;
          const c = clusterMap[idx];
          const neighbors = [
            clusterMap[idx - 1], clusterMap[idx + 1],
            clusterMap[idx - w], clusterMap[idx + w],
            clusterMap[idx - w - 1], clusterMap[idx - w + 1],
            clusterMap[idx + w - 1], clusterMap[idx + w + 1],
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
}, [imageUrl, palette, selectedIdx, outlineMode, cvdFilterEnabled, cvdProfile]);

  /* ---------- 팔레트 저장 ---------- */
  const handleSavePalette = () => {
    if (!palette.length) {
      alert('저장할 팔레트가 없습니다.');
      return;
    }

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
          pct: p.pct,
        })),
      };

      const next = [entry, ...prev];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      navigate('/palettes');
    } catch (e) {
      console.error(e);
      alert('팔레트 저장 중 오류가 발생했습니다.');
    }
  };

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: 20 }}>
      {/* 제목 + 저장 버튼 */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
        gap: 12,
        flexWrap: 'wrap',
      }}>
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
            fontSize: 14,
          }}
        >
          현재 팔레트 저장
        </button>
      </div>

      {/* CVD 프로파일 정보 */}
      {cvdProfile && (
        <div style={{ 
          marginBottom: 12, 
          padding: 12, 
          background: '#eff6ff',
          border: '1px solid #3b82f6',
          borderRadius: 8 
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <strong style={{ color: '#1e40af' }}>측정된 색각 프로파일:</strong>
              <span style={{ marginLeft: 8, color: '#4b5563' }}>
                혼동 {cvdProfile.confusionPair?.hueA}° ↔ {cvdProfile.confusionPair?.hueB}° (±{cvdProfile.maxWidth}°)
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 600 }}>개인 맞춤 필터</span>
              <label style={{ position: 'relative', width: 50, height: 26, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={cvdFilterEnabled}
                  onChange={() => setCvdFilterEnabled(v => !v)}
                  style={{ display: 'none' }}
                />
                <span style={{
                  position: 'absolute',
                  top: 0, left: 0, right: 0, bottom: 0,
                  background: cvdFilterEnabled ? '#2d7ef7' : '#ccc',
                  borderRadius: 26,
                  transition: '0.3s',
                }} />
                <span style={{
                  position: 'absolute',
                  top: 2,
                  left: cvdFilterEnabled ? 24 : 2,
                  width: 22,
                  height: 22,
                  background: '#fff',
                  borderRadius: '50%',
                  transition: '0.3s',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                }} />
              </label>
            </div>
          </div>
        </div>
      )}

      {/* 외곽선 토글 */}
      <div style={{ display: 'flex', gap: 20, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>외곽선 강조</span>
          <label style={{ position: 'relative', width: 50, height: 26, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={outlineMode}
              onChange={() => setOutlineMode(o => !o)}
              style={{ display: 'none' }}
            />
            <span style={{
              position: 'absolute',
              top: 0, left: 0, right: 0, bottom: 0,
              background: outlineMode ? '#2d7ef7' : '#ccc',
              borderRadius: 26,
              transition: '0.3s',
            }} />
            <span style={{
              position: 'absolute',
              top: 2,
              left: outlineMode ? 24 : 2,
              width: 22,
              height: 22,
              background: '#fff',
              borderRadius: '50%',
              transition: '0.3s',
              boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
            }} />
          </label>
        </div>
      </div>

      {/* 캔버스 + 팔레트 목록 */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20 }}>
        <canvas
          ref={canvasRef}
          style={{ border: '1px solid #ccc', borderRadius: 8, maxWidth: '70%', height: 'auto' }}
        />

        <div style={{ width: '30%' }}>
          <h3 style={{ marginTop: 0 }}>팔레트</h3>
          
          {/* 로딩 상태 */}
          {isExtracting && (
            <div style={{
              padding: 24,
              background: '#f3f4f6',
              borderRadius: 8,
              marginBottom: 12,
              textAlign: 'center',
            }}>
              <div style={{ 
                fontSize: 16,
                fontWeight: 600, 
                color: '#374151',
                marginBottom: 8,
              }}>
                팔레트 분석 중...
              </div>
              <div style={{ 
                fontSize: 13, 
                color: '#6b7280',
              }}>
                잠시만 기다려주세요
              </div>
            </div>
          )}
          
          {/* 혼동 경고 */}
          {!isExtracting && confusedPairs.length > 0 && (
            <div style={{
              padding: 12,
              background: '#fef3c7',
              border: '2px solid #f59e0b',
              borderRadius: 8,
              marginBottom: 12,
            }}>
              <div style={{ fontWeight: 700, color: '#92400e', marginBottom: 8 }}>
                ⚠️ 혼동 발견: {confusedPairs.length}개 쌍
              </div>
              <div style={{ fontSize: 13, color: '#78350f' }}>
                {confusedPairs.map(([i, j], idx) => (
                  <div key={idx} style={{ marginBottom: 4 }}>
                    • 색상 {i + 1} ↔ 색상 {j + 1}
                  </div>
                ))}
              </div>
            </div>
          )}
          
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            overflowY: 'auto',
            maxHeight: '70vh',
          }}>
            {!isExtracting && palette.map((p, i) => {
              const confusedWith = confusedPairs
                .filter(([a, b]) => a === i || b === i)
                .map(([a, b]) => a === i ? b : a);
              
              const isConfused = confusedWith.length > 0;
              
              return (
                <div
                  key={i}
                  onClick={() => setSelectedIdx(prev => prev === i ? null : i)}
                  style={{
                    cursor: 'pointer',
                    padding: 8,
                    borderRadius: 8,
                    border: i === selectedIdx 
                      ? '3px solid #2d7ef7' 
                      : isConfused 
                        ? '3px solid #f59e0b'
                        : '1px solid #ccc',
                    background: isConfused ? '#fef3c7' : '#fafafa',
                    position: 'relative',
                  }}
                >
                  {isConfused && (
                    <div style={{
                      position: 'absolute',
                      top: 4,
                      right: 4,
                      background: '#f59e0b',
                      color: '#fff',
                      fontSize: 10,
                      padding: '2px 6px',
                      borderRadius: 4,
                      fontWeight: 700,
                    }}>
                      ↔ {confusedWith.map(idx => idx + 1).join(', ')}
                    </div>
                  )}
                  <div style={{
                    width: '100%',
                    height: 40,
                    borderRadius: 6,
                    background: p.hex,
                  }} />
                  <p style={{ margin: '6px 0 0 0', fontSize: 13, fontWeight: 600 }}>
                    {i + 1}. {p.name || '(이름 없음)'}
                  </p>
                  <code>{p.hex}</code><br />
                  <small>{p.pct.toFixed(1)}%</small>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}