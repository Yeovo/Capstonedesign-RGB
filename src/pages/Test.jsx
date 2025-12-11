import React, { useEffect, useRef, useState } from "react";

/**
 * 색각 캘리브레이터 v6 - 격자 샘플링
 * 
 * 4단계 점진적 좁히기:
 * 1. 넓은 격자 (45° 간격) - 대략적 혼동 영역 찾기
 * 2. 중간 격자 (15° 간격) - 선택한 영역 주변 탐색
 * 3. 세밀 격자 (5° 간격) - 정밀한 혼동 쌍 확정
 * 4. 혼동선 폭 측정 - 확정된 쌍에서 ±1~8° 테스트
 */

const STORAGE_KEY = "colorVisionProfile_v6";

// ============================
// HSL 색공간 변환
// ============================

function hslToRgb(h, s, l) {
  s /= 100;
  l /= 100;
  const k = n => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = n =>
    l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [
    Math.round(255 * f(0)),
    Math.round(255 * f(8)),
    Math.round(255 * f(4))
  ];
}

// ============================
// 점 패턴 생성
// ============================

function generateDots(width, height, count) {
  const dots = [];
  for (let i = 0; i < count; i++) {
    dots.push({
      x: Math.random() * width,
      y: Math.random() * height,
      r: Math.random() * 2.5 + 2,
    });
  }
  return dots;
}

function isNumber5(x, y, width, height) {
  const nx = x / width;
  const ny = y / height;
  const cx = 0.5, cy = 0.5;
  const size = 0.22;
  
  if (nx > cx - size && nx < cx + size && ny > cy - size * 1.1 && ny < cy - size * 0.8) return true;
  if (nx > cx - size && nx < cx - size * 0.6 && ny > cy - size * 1.1 && ny < cy - size * 0.1) return true;
  if (nx > cx - size && nx < cx + size && ny > cy - size * 0.15 && ny < cy + size * 0.15) return true;
  if (nx > cx + size * 0.6 && cx < cx + size && ny > cy + size * 0.1 && ny < cy + size * 1.1) return true;
  if (nx > cx - size && nx < cx + size && ny > cy + size * 0.8 && ny < cy + size * 1.1) return true;
  
  return false;
}

// ============================
// 색상 쌍 생성 (같은 색 제외, 중복 제거)
// ============================

function generateColorPairs(interval, centerHueA = null, centerHueB = null, range = 180) {
  const pairs = [];
  const saturation = 70;
  const lightness = 50;
  const minAngleDiff = 60;
  const seen = new Set();
  
  // 중심이 지정되면 그 주변만, 1단계면 0-180만 (대립각 중복 방지)
  const startA = centerHueA !== null ? centerHueA - range / 2 : 0;
  const endA = centerHueA !== null ? centerHueA + range / 2 : 180; // ✅ 180까지만
  
  for (let hueA = startA; hueA < endA; hueA += interval) {
    const normalizedA = ((hueA % 360) + 360) % 360;
    
    const startB = centerHueB !== null ? centerHueB - range / 2 : 0;
    const endB = centerHueB !== null ? centerHueB + range / 2 : 360;
    
    for (let hueB = startB; hueB < endB; hueB += interval) {
      const normalizedB = ((hueB % 360) + 360) % 360;
      
      // 각도 차이 계산 (최단 거리)
      let diff = Math.abs(normalizedB - normalizedA);
      if (diff > 180) diff = 360 - diff;
      
      // 너무 가까운 색은 제외
      if (diff >= minAngleDiff && diff <= 300) {
        // 중복 체크
        const min = Math.min(normalizedA, normalizedB);
        const max = Math.max(normalizedA, normalizedB);
        const key = `${min}-${max}`;
        
        if (seen.has(key)) continue;
        seen.add(key);
        
        pairs.push({
          hueA: normalizedA,
          hueB: normalizedB,
          colorA: hslToRgb(normalizedA, saturation, lightness),
          colorB: hslToRgb(normalizedB, saturation, lightness),
          saturation,
          lightness
        });
      }
    }
  }
  
  return pairs;
}

// ============================
// 메인 컴포넌트
// ============================

export default function ColorCalibrator() {
  const [stage, setStage] = useState("intro");
  const [selectedPairs, setSelectedPairs] = useState([]);
  const [finalPair, setFinalPair] = useState(null);
  const [widthMeasurements, setWidthMeasurements] = useState([]);

  if (stage === "intro") {
    // 저장된 프로파일 확인
    const savedProfile = localStorage.getItem(STORAGE_KEY);
    let profileData = null;
    if (savedProfile) {
      try {
        profileData = JSON.parse(savedProfile);
      } catch (e) {
        // 파싱 실패시 무시
      }
    }

    return (
      <div style={styles.container}>
        <div style={styles.header}>
          <h1 style={styles.title}>색각 캘리브레이터</h1>
          <p style={styles.subtitle}>개인 맞춤 색각 측정 도구</p>
        </div>
        
        {profileData ? (
          <div style={styles.savedProfileCard}>
            <h3 style={styles.savedProfileTitle}>저장된 측정 결과</h3>
            <div style={styles.savedProfileContent}>
              <div style={styles.savedProfileRow}>
                <span style={styles.savedProfileLabel}>혼동 색상</span>
                <span style={styles.savedProfileValue}>
                  {profileData.confusionPair.hueA}° ↔ {profileData.confusionPair.hueB}°
                </span>
              </div>
              <div style={styles.savedProfileRow}>
                <span style={styles.savedProfileLabel}>혼동선 폭</span>
                <span style={styles.savedProfileValue}>±{profileData.maxWidth}°</span>
              </div>
              <div style={styles.savedProfileRow}>
                <span style={styles.savedProfileLabel}>심각도</span>
                <span style={styles.savedProfileValue}>{profileData.severityLabel}</span>
              </div>
              <div style={styles.savedProfileRow}>
                <span style={styles.savedProfileLabel}>측정 일시</span>
                <span style={styles.savedProfileValue}>
                  {new Date(profileData.timestamp).toLocaleString('ko-KR')}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div style={styles.noProfileCard}>
            <p style={styles.noProfileText}>저장된 측정 결과가 없습니다</p>
          </div>
        )}
        
        <div style={styles.infoCard}>
          <h3 style={styles.infoTitle}>개인 맞춤 정밀 측정</h3>
          <p style={styles.infoText}>
            고정된 색상 쌍이 아닌, 당신이 실제로 혼동하는 색상을 직접 찾아냅니다.
            3단계 점진적 좁히기로 정확한 혼동 색상 쌍을 특정합니다.
          </p>
        </div>

        <div style={styles.infoCard}>
          <h3 style={styles.infoTitle}>수치화된 결과</h3>
          <ul style={styles.infoList}>
            <li>혼동 색상 쌍의 정확한 각도 (예: 40° ↔ 115°)</li>
            <li>혼동선 폭 측정 (예: ±2° 범위)</li>
            <li>심각도 수준 판정 (경도/중등도/중증)</li>
            <li>측정된 데이터는 개인 맞춤 색상 보정 필터 제작에 사용 가능</li>
          </ul>
        </div>

        <button style={styles.primaryButton} onClick={() => setStage("grid1")}>
          {profileData ? "다시 측정하기" : "측정 시작하기"}
        </button>

        <p style={styles.note}>
          소요시간: 약 3-5분
        </p>
      </div>
    );
  }

  if (stage === "grid1") {
    return (
      <GridSelection
        interval={30}
        centerHueA={null}
        centerHueB={null}
        range={180}
        title="1단계: 넓은 범위 탐색"
        description="숫자 '5'가 가장 안 보이는 칸을 클릭하세요"
        onSelect={(pair) => {
          setSelectedPairs([pair]);
          setStage("grid2");
        }}
      />
    );
  }

  if (stage === "grid2") {
    const prevPair = selectedPairs[0];
    return (
      <GridSelection
        interval={15}
        centerHueA={prevPair.hueA}
        centerHueB={prevPair.hueB}
        range={90}
        title="2단계: 중간 범위 탐색"
        description="선택한 영역 주변을 더 세밀하게 탐색합니다"
        onSelect={(pair) => {
          setSelectedPairs([...selectedPairs, pair]);
          setStage("grid3");
        }}
      />
    );
  }

  if (stage === "grid3") {
    const prevPair = selectedPairs[1];
    return (
      <GridSelection
        interval={5}
        centerHueA={prevPair.hueA}
        centerHueB={prevPair.hueB}
        range={30}
        title="3단계: 정밀 탐색"
        description="최종적으로 가장 구별이 안 되는 조합을 선택하세요"
        onSelect={(pair) => {
          setFinalPair(pair);
          setStage("width");
        }}
      />
    );
  }

  if (stage === "width") {
    return (
      <WidthMeasurement
        pair={finalPair}
        widthMeasurements={widthMeasurements}
        setWidthMeasurements={setWidthMeasurements}
        setStage={setStage}
      />
    );
  }

  if (stage === "result") {
    return (
      <Results
        finalPair={finalPair}
        widthMeasurements={widthMeasurements}
        setStage={setStage}
      />
    );
  }

  return null;
}

// ============================
// Grid Selection
// ============================

function GridSelection({ interval, centerHueA, centerHueB, range, title, description, onSelect }) {
  const [currentPage, setCurrentPage] = useState(0);
  const pairs = generateColorPairs(interval, centerHueA, centerHueB, range);
  
  const itemsPerPage = 4;
  const totalPages = Math.ceil(pairs.length / itemsPerPage);
  const currentPairs = pairs.slice(currentPage * itemsPerPage, (currentPage + 1) * itemsPerPage);
  
  return (
    <div style={styles.container}>
      <h2 style={styles.title}>{title}</h2>
      <p style={styles.desc}>{description}</p>
      
      <div style={styles.gridInfo}>
        <span style={styles.gridCount}>
          {currentPage * itemsPerPage + 1}~{Math.min((currentPage + 1) * itemsPerPage, pairs.length)} / 총 {pairs.length}개
        </span>
      </div>

      <div style={styles.grid}>
        {currentPairs.map((pair, idx) => (
          <GridCell
            key={currentPage * itemsPerPage + idx}
            pair={pair}
            onClick={() => onSelect(pair)}
          />
        ))}
      </div>

      <div style={styles.pagination}>
        <button
          style={{...styles.paginationButton, opacity: currentPage === 0 ? 0.3 : 1}}
          onClick={() => setCurrentPage(Math.max(0, currentPage - 1))}
          disabled={currentPage === 0}
        >
          ← 이전
        </button>
        <span style={styles.pageIndicator}>
          {currentPage + 1} / {totalPages}
        </span>
        <button
          style={{...styles.paginationButton, opacity: currentPage === totalPages - 1 ? 0.3 : 1}}
          onClick={() => setCurrentPage(Math.min(totalPages - 1, currentPage + 1))}
          disabled={currentPage === totalPages - 1}
        >
          다음 →
        </button>
      </div>

      <p style={styles.hint}>
        💡 천천히 살펴보며 가장 구별이 안 되는 칸을 클릭하세요
      </p>
    </div>
  );
}

// ============================
// Grid Cell
// ============================

function GridCell({ pair, onClick }) {
  const canvasRef = useRef(null);
  const [dots] = useState(() => generateDots(300, 300, 2500));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "#f5f5f5";
    ctx.fillRect(0, 0, 300, 300);

    dots.forEach(dot => {
      const isShape = isNumber5(dot.x, dot.y, 300, 300);
      const [r, g, b] = isShape ? pair.colorB : pair.colorA;

      ctx.beginPath();
      ctx.arc(dot.x, dot.y, dot.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
      ctx.fill();
    });
  }, [dots, pair]);

  return (
    <button style={styles.gridCell} onClick={onClick}>
      <canvas
        ref={canvasRef}
        width={300}
        height={300}
        style={styles.gridCanvas}
      />
      <div style={styles.cellInfo}>
        <span style={styles.cellAngle}>{pair.hueA}° ↔ {pair.hueB}°</span>
      </div>
    </button>
  );
}

// ============================
// Width Measurement
// ============================

function WidthMeasurement({ pair, widthMeasurements, setWidthMeasurements, setStage }) {
  const [currentOffset, setCurrentOffset] = useState(0);
  const offsets = [0, 1, -1, 2, -2, 3, -3, 5, -5, 8, -8];

  return (
    <SingleWidthTest
      pair={pair}
      offset={offsets[currentOffset]}
      testNumber={currentOffset + 1}
      totalTests={offsets.length}
      onResult={(canDistinguish) => {
        const newMeasurement = {
          offset: offsets[currentOffset],
          canDistinguish: canDistinguish
        };

        const newMeasurements = [...widthMeasurements, newMeasurement];
        setWidthMeasurements(newMeasurements);

        if (currentOffset < offsets.length - 1) {
          setCurrentOffset(currentOffset + 1);
        } else {
          setStage("result");
        }
      }}
    />
  );
}

// ============================
// Single Width Test
// ============================

function SingleWidthTest({ pair, offset, testNumber, totalTests, onResult }) {
  const canvasRef = useRef(null);
  const [showingColorA, setShowingColorA] = useState(true);
  const [dots] = useState(() => generateDots(340, 340, 1800));

  const testHueA = (pair.hueA + offset + 360) % 360;
  const testHueB = (pair.hueB + offset + 360) % 360;

  const colorA = hslToRgb(testHueA, pair.saturation, pair.lightness);
  const colorB = hslToRgb(testHueB, pair.saturation, pair.lightness);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "#f5f5f5";
    ctx.fillRect(0, 0, 340, 340);

    const bgColor = showingColorA ? colorA : colorB;
    const fgColor = showingColorA ? colorB : colorA;

    dots.forEach(dot => {
      const isShape = isNumber5(dot.x, dot.y, 340, 340);
      const [r, g, b] = isShape ? fgColor : bgColor;

      ctx.beginPath();
      ctx.arc(dot.x, dot.y, dot.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
      ctx.fill();
    });
  }, [showingColorA, dots, colorA, colorB]);

  return (
    <div style={styles.container}>
      <div style={styles.phaseIndicator}>
        <span style={styles.phaseLabel}>4단계</span>
        혼동선 폭 측정
      </div>

      <div style={styles.progressBar}>
        <div style={{...styles.progressFill, width: `${(testNumber / totalTests) * 100}%`}} />
      </div>
      
      <h2 style={styles.title}>
        테스트 {testNumber}/{totalTests}
      </h2>

      <div style={styles.testInfo}>
        <span style={styles.testLabel2}>
          {offset > 0 ? '+' : ''}{offset}° 벗어남
        </span>
      </div>

      <p style={styles.desc}>
        이 두 색상을 <strong>구별할 수 있나요?</strong>
      </p>

      <div style={styles.canvasContainer}>
        <canvas
          ref={canvasRef}
          width={340}
          height={340}
          style={styles.canvas}
        />
      </div>

      <div style={styles.colorSwitcher}>
        <button
          style={{
            ...styles.colorButton,
            background: `rgb(${colorA.join(',')})`,
            border: showingColorA ? '4px solid #4f46e5' : '2px solid #e5e7eb'
          }}
          onClick={() => setShowingColorA(true)}
        >
          색상 A
        </button>
        <button
          style={{
            ...styles.colorButton,
            background: `rgb(${colorB.join(',')})`,
            border: !showingColorA ? '4px solid #4f46e5' : '2px solid #e5e7eb'
          }}
          onClick={() => setShowingColorA(false)}
        >
          색상 B
        </button>
      </div>

      <div style={styles.buttonGroup}>
        <button
          style={{...styles.primaryButton, flex: 1, background: '#10b981'}}
          onClick={() => onResult(true)}
        >
          ✓ 구별 가능
        </button>
        <button
          style={{...styles.primaryButton, flex: 1, background: '#ef4444'}}
          onClick={() => onResult(false)}
        >
          ✗ 구별 불가
        </button>
      </div>
    </div>
  );
}

// ============================
// Results
// ============================

function Results({ finalPair, widthMeasurements, setStage }) {
  const confused = widthMeasurements.filter(m => !m.canDistinguish);
  const maxWidth = confused.length > 0 
    ? Math.max(...confused.map(m => Math.abs(m.offset)))
    : 0;

  const severityLabel = 
    maxWidth === 0 ? "경도 (중심축만)" :
    maxWidth <= 1 ? "경도" :
    maxWidth <= 2 ? "경도-중등도" :
    maxWidth <= 3 ? "중등도" :
    maxWidth <= 5 ? "중등도-중증" : "중증";

  const profile = {
    confusionPair: finalPair,
    maxWidth: maxWidth,
    severityLabel: severityLabel,
    widthMeasurements: widthMeasurements,
    timestamp: new Date().toISOString()
  };

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  }, []);

  return (
    <div style={styles.container}>
      <div style={{...styles.resultIcon, background: "#fef3c7", color: "#f59e0b"}}>
        ✓
      </div>
      
      <h2 style={styles.title}>측정 완료</h2>
      
      <div style={styles.resultCard}>
        <div style={styles.resultRow}>
          <span style={styles.resultLabel}>혼동 색상 쌍</span>
          <span style={styles.resultValue}>
            {finalPair.hueA}° ↔ {finalPair.hueB}°
          </span>
        </div>

        <div style={styles.resultRow}>
          <span style={styles.resultLabel}>혼동선 폭</span>
          <span style={styles.resultValue}>
            ±{maxWidth}° 범위
          </span>
        </div>
        
        <div style={styles.resultRow}>
          <span style={styles.resultLabel}>심각도</span>
          <span style={styles.resultValue}>
            {severityLabel}
          </span>
        </div>
      </div>

      <div style={styles.confusionDisplay}>
        <h3 style={styles.sectionTitle}>발견된 혼동 색상</h3>
        <div style={styles.pairColors}>
          <div style={styles.colorBox}>
            <div style={{
              width: 80,
              height: 80,
              borderRadius: 12,
              background: `rgb(${finalPair.colorA.join(',')})`,
              border: '3px solid #fff',
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
            }} />
            <span style={styles.colorLabel}>{finalPair.hueA}°</span>
          </div>
          <span style={styles.vsLabel}>↔</span>
          <div style={styles.colorBox}>
            <div style={{
              width: 80,
              height: 80,
              borderRadius: 12,
              background: `rgb(${finalPair.colorB.join(',')})`,
              border: '3px solid #fff',
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
            }} />
            <span style={styles.colorLabel}>{finalPair.hueB}°</span>
          </div>
        </div>
      </div>

      <div style={styles.explanationCard}>
        <h3 style={styles.sectionTitle}>📊 결과 해석</h3>
        <p style={styles.explanationText}>
          3단계 점진 탐색을 통해 당신이 혼동하는 정확한 색상 쌍을 발견했습니다.
        </p>
        <p style={styles.explanationText}>
          이 데이터는 개인 맞춤 색상 보정 필터 제작에 사용됩니다.
          혼동 축에서 <strong>±{maxWidth}°</strong> 범위의 색상을 구별하기 어려워하는
          <strong> {severityLabel}</strong> 수준입니다.
        </p>
      </div>

      <div style={styles.buttonGroup}>
        <button
          style={{...styles.primaryButton, flex: 1}}
          onClick={() => {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
            alert('측정 결과가 저장되었습니다.\n이제 이미지 변환 페이지에서 필터를 적용할 수 있습니다.');
          }}
        >
          결과 저장
        </button>
        <button
          style={{...styles.secondaryButton, flex: 1}}
          onClick={() => {
            setStage("intro");
          }}
        >
          다시 측정
        </button>
      </div>
    </div>
  );
}

// ============================
// Styles
// ============================

const styles = {
  container: {
    maxWidth: 900,
    margin: "0 auto",
    padding: "40px 20px",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },
  header: {
    textAlign: "center",
    marginBottom: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: 800,
    color: "#111",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: "#6b7280",
  },
  desc: {
    fontSize: 15,
    color: "#4b5563",
    textAlign: "center",
    lineHeight: 1.6,
    marginBottom: 30,
  },
  infoCard: {
    background: "#f9fafb",
    border: "1px solid #e5e7eb",
    borderRadius: 16,
    padding: 24,
    marginBottom: 20,
  },
  infoTitle: {
    fontSize: 18,
    fontWeight: 700,
    marginBottom: 12,
    color: "#111",
  },
  infoText: {
    fontSize: 15,
    color: "#4b5563",
    lineHeight: 1.7,
    margin: 0,
  },
  infoList: {
    margin: 0,
    paddingLeft: 20,
    color: "#4b5563",
    lineHeight: 1.8,
    fontSize: 15,
  },
  savedProfileCard: {
    background: "#eff6ff",
    border: "2px solid #3b82f6",
    borderRadius: 16,
    padding: 24,
    marginBottom: 30,
  },
  savedProfileTitle: {
    fontSize: 18,
    fontWeight: 700,
    color: "#1e40af",
    marginBottom: 16,
    margin: 0,
  },
  savedProfileContent: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  savedProfileRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 12,
    background: "#fff",
    borderRadius: 8,
  },
  savedProfileLabel: {
    fontSize: 14,
    color: "#6b7280",
  },
  savedProfileValue: {
    fontSize: 14,
    fontWeight: 600,
    color: "#111",
  },
  noProfileCard: {
    background: "#f9fafb",
    border: "1px solid #e5e7eb",
    borderRadius: 16,
    padding: 24,
    marginBottom: 30,
    textAlign: "center",
  },
  noProfileText: {
    fontSize: 15,
    color: "#9ca3af",
    margin: 0,
  },
  exampleCard: {
    background: "#eff6ff",
    border: "1px solid #dbeafe",
    borderRadius: 12,
    padding: 20,
    marginBottom: 30,
  },
  exampleTitle: {
    fontSize: 15,
    fontWeight: 700,
    color: "#1e40af",
    margin: "0 0 8px 0",
  },
  exampleText: {
    fontSize: 14,
    color: "#1e40af",
    lineHeight: 1.8,
    margin: 0,
  },
  primaryButton: {
    width: "100%",
    padding: "16px",
    background: "#4f46e5",
    color: "#fff",
    border: "none",
    borderRadius: 12,
    fontSize: 16,
    fontWeight: 600,
    cursor: "pointer",
    transition: "all 0.2s",
  },
  secondaryButton: {
    width: "100%",
    padding: "14px",
    background: "#fff",
    color: "#4b5563",
    border: "2px solid #e5e7eb",
    borderRadius: 12,
    fontSize: 15,
    fontWeight: 500,
    cursor: "pointer",
    marginTop: 12,
  },
  note: {
    textAlign: "center",
    fontSize: 13,
    color: "#9ca3af",
    marginTop: 20,
  },
  gridInfo: {
    textAlign: "center",
    marginBottom: 20,
  },
  gridCount: {
    display: "inline-block",
    padding: "8px 16px",
    background: "#f3f4f6",
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
    color: "#374151",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, 1fr)",
    gap: 20,
    marginBottom: 30,
    maxWidth: 700,
    margin: "0 auto 30px",
  },
  gridCell: {
    background: "#fff",
    border: "3px solid #e5e7eb",
    borderRadius: 16,
    padding: 12,
    cursor: "pointer",
    transition: "all 0.2s",
  },
  gridCanvas: {
    width: "100%",
    height: "auto",
    borderRadius: 12,
    display: "block",
  },
  cellInfo: {
    marginTop: 12,
    textAlign: "center",
  },
  cellAngle: {
    fontSize: 13,
    color: "#6b7280",
    fontWeight: 600,
  },
  pagination: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    gap: 20,
    marginBottom: 20,
  },
  paginationButton: {
    padding: "12px 24px",
    background: "#fff",
    color: "#4f46e5",
    border: "2px solid #4f46e5",
    borderRadius: 10,
    fontSize: 15,
    fontWeight: 600,
    cursor: "pointer",
    transition: "all 0.2s",
  },
  pageIndicator: {
    fontSize: 15,
    fontWeight: 600,
    color: "#374151",
    minWidth: 80,
    textAlign: "center",
  },
  hint: {
    textAlign: "center",
    fontSize: 13,
    color: "#9ca3af",
    fontStyle: "italic",
  },
  phaseIndicator: {
    textAlign: "center",
    padding: "12px",
    background: "#eff6ff",
    borderRadius: 8,
    marginBottom: 20,
    fontSize: 15,
    fontWeight: 600,
    color: "#1e40af",
  },
  phaseLabel: {
    display: "inline-block",
    padding: "4px 12px",
    background: "#3b82f6",
    color: "#fff",
    borderRadius: 6,
    fontSize: 13,
    marginRight: 8,
  },
  progressBar: {
    width: "100%",
    height: 8,
    background: "#e5e7eb",
    borderRadius: 4,
    marginBottom: 30,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    background: "linear-gradient(90deg, #4f46e5, #7c3aed)",
    transition: "width 0.3s ease",
  },
  testInfo: {
    textAlign: "center",
    marginBottom: 20,
  },
  testLabel2: {
    display: "inline-block",
    padding: "8px 16px",
    background: "#f3f4f6",
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
    color: "#374151",
  },
  canvasContainer: {
    display: "flex",
    justifyContent: "center",
    marginBottom: 30,
  },
  canvas: {
    borderRadius: 16,
    boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
    border: "4px solid #fff",
    maxWidth: "100%",
    height: "auto",
  },
  colorSwitcher: {
    display: "flex",
    gap: 12,
    marginBottom: 30,
  },
  colorButton: {
    flex: 1,
    padding: "20px",
    borderRadius: 12,
    fontSize: 16,
    fontWeight: 600,
    color: "#fff",
    textShadow: "0 1px 2px rgba(0,0,0,0.3)",
    cursor: "pointer",
    transition: "all 0.2s",
  },
  buttonGroup: {
    display: "flex",
    gap: 12,
    marginBottom: 20,
  },
  resultIcon: {
    width: 80,
    height: 80,
    borderRadius: "50%",
    background: "#dbeafe",
    color: "#3b82f6",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 40,
    fontWeight: 800,
    margin: "0 auto 20px",
  },
  resultCard: {
    background: "#f9fafb",
    border: "1px solid #e5e7eb",
    borderRadius: 16,
    padding: 24,
    marginBottom: 20,
  },
  resultRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
    paddingBottom: 16,
    borderBottom: "1px solid #e5e7eb",
  },
  resultLabel: {
    fontSize: 15,
    color: "#6b7280",
  },
  resultValue: {
    fontSize: 16,
    fontWeight: 600,
    color: "#111",
    textAlign: "right",
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 700,
    color: "#111",
    marginBottom: 16,
  },
  confusionDisplay: {
    background: "#fff",
    border: "1px solid #e5e7eb",
    borderRadius: 12,
    padding: 24,
    marginBottom: 20,
  },
  pairColors: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    gap: 24,
  },
  colorBox: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 12,
  },
  colorLabel: {
    fontSize: 14,
    color: "#6b7280",
    fontWeight: 600,
  },
  vsLabel: {
    fontSize: 24,
    color: "#9ca3af",
    fontWeight: 600,
  },
  explanationCard: {
    background: "#eff6ff",
    border: "1px solid #dbeafe",
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
  },
  explanationText: {
    fontSize: 14,
    color: "#1e40af",
    lineHeight: 1.6,
    margin: "0 0 12px 0",
  },
};