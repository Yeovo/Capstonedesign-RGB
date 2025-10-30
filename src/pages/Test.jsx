import { useEffect, useMemo, useRef, useState } from 'react';

/**
 * 색각 민감도 스크리닝 프로토타입 (확장판)
 * - grid odd-one-out 모드만 구현 (3x3 중 다른 칸 클릭)
 * - axis:
 *    'a'     → 빨강-초록 계열(L/M 축)
 *    'b'     → 파랑-노랑 계열(S 축)
 *    'both'  → 전반 채도/대비 감지
 *
 * ⚠ 의학적 진단용 아님. 참고/연습/연구용.
 */

/* ===================== 색공간 유틸 ===================== */

function srgbToLinear(c) {
  const x = c / 255;
  return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
}
function linearToSrgb(x) {
  const v = x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
  return Math.round(Math.min(1, Math.max(0, v)) * 255);
}

function xyzToRgb(xyz) {
  const { X, Y, Z } = xyz;
  const R =  3.2404542*X -1.5371385*Y -0.4985314*Z;
  const G = -0.9692660*X +1.8760108*Y +0.0415560*Z;
  const B =  0.0556434*X -0.2040259*Y +1.0572252*Z;
  return {
    r: linearToSrgb(R),
    g: linearToSrgb(G),
    b: linearToSrgb(B),
  };
}

function rgbToXyz(rgb) {
  const R = srgbToLinear(rgb.r),
        G = srgbToLinear(rgb.g),
        B = srgbToLinear(rgb.b);
  const X = R*0.4124564 + G*0.3575761 + B*0.1804375;
  const Y = R*0.2126729 + G*0.7151522 + B*0.0721750;
  const Z = R*0.0193339 + G*0.1191920 + B*0.9503041;
  return { X, Y, Z };
}

function fLab(t) {
  return t > 0.008856 ? Math.cbrt(t) : (7.787 * t + 16/116);
}
function invfLab(t) {
  const t3 = t*t*t;
  return t3 > 0.008856 ? t3 : (t - 16/116)/7.787;
}

// XYZ <-> Lab (D65)
function xyzToLab(xyz) {
  const Xn=0.95047, Yn=1.00000, Zn=1.08883;
  const fx = fLab(xyz.X/Xn),
        fy = fLab(xyz.Y/Yn),
        fz = fLab(xyz.Z/Zn);
  return {
    L: 116*fy -16,
    a: 500*(fx - fy),
    b: 200*(fy - fz),
  };
}
function labToXyz(lab) {
  const { L,a,b } = lab;
  const fy = (L + 16)/116;
  const fx = fy + a/500;
  const fz = fy - b/200;
  const Xn=0.95047, Yn=1.00000, Zn=1.08883;
  return {
    X: Xn*invfLab(fx),
    Y: Yn*invfLab(fy),
    Z: Zn*invfLab(fz),
  };
}
function labToRgb(lab) {
  return xyzToRgb(labToXyz(lab));
}

/**
 * 축 방향으로 delta만큼 이동한 색 만들기.
 * axis: 'a' | 'b' | 'both'
 */
function makeVariantColors(baseLab, axis, delta) {
  const sameRGB = labToRgb(baseLab);

  let shiftedLab;
  if (axis === 'a') {
    shiftedLab = { ...baseLab, a: baseLab.a + delta };
  } else if (axis === 'b') {
    shiftedLab = { ...baseLab, b: baseLab.b + delta };
  } else {
    shiftedLab = {
      ...baseLab,
      a: baseLab.a + delta,
      b: baseLab.b + delta,
    };
  }

  const diffRGB = labToRgb(shiftedLab);
  return [sameRGB, diffRGB];
}

/**
 * 3x3 격자에서 하나만 diffRGB로 칠한다.
 */
function drawGrid(ctx, baseRGB, diffRGB, diffIndex) {
  const size = Math.min(ctx.canvas.width, ctx.canvas.height);
  const cell = size / 3;

  for (let i=0; i<9; i++){
    const x = (i%3)*cell;
    const y = Math.floor(i/3)*cell;
    const c = (i===diffIndex) ? diffRGB : baseRGB;
    ctx.fillStyle = `rgb(${c.r},${c.g},${c.b})`;
    ctx.fillRect(x,y,cell,cell);
  }
}

/* ===================== 문제 풀 정의 ===================== */

const QUESTIONS_TEMPLATE = [
  // L/M 축 palette 1
  { axis:'a', difficulty:'easy', palette:1, mode:'grid',
    baseLab:{ L:60, a:20, b:20 }, delta:10 },
  { axis:'a', difficulty:'mid',  palette:1, mode:'grid',
    baseLab:{ L:60, a:20, b:20 }, delta:6  },
  { axis:'a', difficulty:'hard', palette:1, mode:'grid',
    baseLab:{ L:60, a:20, b:20 }, delta:3  },

  // L/M 축 palette 2
  { axis:'a', difficulty:'easy', palette:2, mode:'grid',
    baseLab:{ L:55, a:30, b:25 }, delta:10 },
  { axis:'a', difficulty:'mid',  palette:2, mode:'grid',
    baseLab:{ L:55, a:30, b:25 }, delta:6  },
  { axis:'a', difficulty:'hard', palette:2, mode:'grid',
    baseLab:{ L:55, a:30, b:25 }, delta:3  },

  // S 축 palette 1
  { axis:'b', difficulty:'easy', palette:1, mode:'grid',
    baseLab:{ L:60, a:0,  b:5  }, delta:10 },
  { axis:'b', difficulty:'mid',  palette:1, mode:'grid',
    baseLab:{ L:60, a:0,  b:5  }, delta:6  },
  { axis:'b', difficulty:'hard', palette:1, mode:'grid',
    baseLab:{ L:60, a:0,  b:5  }, delta:3  },

  // S 축 palette 2
  { axis:'b', difficulty:'easy', palette:2, mode:'grid',
    baseLab:{ L:50, a:15, b:-30 }, delta:10 },
  { axis:'b', difficulty:'mid',  palette:2, mode:'grid',
    baseLab:{ L:50, a:15, b:-30 }, delta:6  },
  { axis:'b', difficulty:'hard', palette:2, mode:'grid',
    baseLab:{ L:50, a:15, b:-30 }, delta:3  },

  // 전반 대비 / 채도 민감도
  { axis:'both', difficulty:'easy', palette:1, mode:'grid',
    baseLab:{ L:60, a:2,  b:2  }, delta:8  },
  { axis:'both', difficulty:'mid',  palette:1, mode:'grid',
    baseLab:{ L:60, a:2,  b:2  }, delta:4  },
  { axis:'both', difficulty:'hard', palette:1, mode:'grid',
    baseLab:{ L:60, a:2,  b:2  }, delta:2  },
];

const SECONDS_PER_QUESTION = 22;

/* ===================== 메인 컴포넌트 ===================== */
export default function ColorVisionScreening() {
  // 질문 세트 초기화 (diffIndex 랜덤)
  const [questions] = useState(() =>
    QUESTIONS_TEMPLATE.map((q, idx) => ({
      ...q,
      id: `${q.axis}_${q.difficulty}_p${q.palette}_${idx}`,
      diffIndex: Math.floor(Math.random()*9),
    }))
  );

  const total = questions.length;

  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState([]);
  const [remaining, setRemaining] = useState(SECONDS_PER_QUESTION);
  const [running, setRunning] = useState(true);

  const startRef = useRef(Date.now());
  const canvasRef = useRef(null);

  const currentQ = questions[idx];
  const done = answers.length === total;

  // 캔버스 렌더링
  useEffect(() => {
    const cvs = canvasRef.current;
    if (!cvs) return;
    const ctx = cvs.getContext('2d');
    if (!ctx) return;

    const [baseRGB, diffRGB] = makeVariantColors(
      currentQ.baseLab,
      currentQ.axis,
      currentQ.delta
    );

    drawGrid(ctx, baseRGB, diffRGB, currentQ.diffIndex);
  }, [idx, currentQ]);

  // 타이머
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => {
      setRemaining((s) => {
        if (s <= 1) {
          clearInterval(t);
          submitAnswer(null); // 시간초과
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, running]);

  // 클릭 -> 몇 번째 칸?
  const handleCanvasClick = (e) => {
    if (!running) return;
    const cvs = canvasRef.current;
    if (!cvs) return;

    const rect = cvs.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const scaleX = cvs.width / rect.width;
    const scaleY = cvs.height / rect.height;
    const canvasX = clickX * scaleX;
    const canvasY = clickY * scaleY;

    const size = Math.min(cvs.width, cvs.height);
    const cell = size / 3;
    const col = Math.floor(canvasX / cell);
    const row = Math.floor(canvasY / cell);

    if (col < 0 || col > 2 || row < 0 || row > 2) return;
    const pickIndex = row*3 + col;

    submitAnswer(pickIndex);
  };

  // 제출
  const submitAnswer = (pickIndex) => {
    const ms = Date.now() - startRef.current;
    const correct = (pickIndex === currentQ.diffIndex);

    const ansRecord = {
      qid: currentQ.id,
      axis: currentQ.axis,
      difficulty: currentQ.difficulty,
      palette: currentQ.palette,
      diffIndex: currentQ.diffIndex,
      pickIndex,
      correct,
      ms,
    };

    setAnswers(prev => [...prev, ansRecord]);

    if (idx < total - 1) {
      setIdx(i => i + 1);
      setRemaining(SECONDS_PER_QUESTION);
      startRef.current = Date.now();
      setRunning(true);
    } else {
      setRunning(false);
    }
  };

  // 리스타트(데모용: 그냥 새로고침)
  const restart = () => {
    window.location.reload();
  };

  // 업로드 페이지 이동
  const goUpload = () => {
    // 라우터를 안 쓴 환경에서도 동작하도록 단순 이동 처리
    window.location.href = '/upload';
  };

  /* ===================== 결과 분석 =====================
     - axis='a' (빨강-초록) hard 난이도 정확도
     - axis='b' (파랑-노랑) hard 난이도 정확도
     기준으로 경고 메시지 선택
  */
  const report = useMemo(() => {
    if (!done) return null;

    function getHardAcc(axisName) {
      const subset = answers.filter(
        a => a.axis === axisName && a.difficulty === 'hard'
      );
      if (subset.length === 0) return null;
      const correctCnt = subset.filter(a=>a.correct).length;
      return correctCnt / subset.length;
    }

    const accA = getHardAcc('a');     // 적/녹
    const accB = getHardAcc('b');     // 청/황

    function classifyAxis(acc) {
      if (acc === null) return 'unknown';
      if (acc < 0.4) return 'severe';
      if (acc < 0.7) return 'mild';
      return 'ok';
    }

    const classA = classifyAxis(accA);
    const classB = classifyAxis(accB);

    let headline = '정상입니다(색각 이상이 없습니다).';
    let subNote =
      '이 테스트는 의학적 진단이 아니며 참고용입니다. 실제 색각 이상 여부는 전문 검사를 통해 확인하셔야 합니다.';

    const aProblem = (classA === 'severe' || classA === 'mild');
    const bProblem = (classB === 'severe' || classB === 'mild');

    if (aProblem && bProblem) {
      headline = '광범위한 색각 이상(전색약)이 의심됩니다.';
      subNote =
        '여러 색 축(빨강-초록 및 파랑-노랑 계열)에서 미세한 색 차이 구분이 어렵게 나타났습니다. 전문 시력 검사를 권장합니다.';
    } else if (aProblem) {
      headline = '적색약/녹색약이 의심됩니다.';
      subNote =
        '빨강-초록 계열 색 차이를 미세하게 구분하는 능력이 낮게 측정되었습니다. 전문 시력 검사를 권장합니다.';
    } else if (bProblem) {
      headline = '청색약이 의심됩니다.';
      subNote =
        '파랑-노랑 계열 색 차이를 미세하게 구분하는 능력이 낮게 측정되었습니다. 전문 시력 검사를 권장합니다.';
    }

    return {
      headline,
      subNote,
      accA,
      accB,
      answers,
    };
  }, [done, answers]);

  /* ===================== 렌더 ===================== */

  if (done && report) {
    return (
      <div style={{ maxWidth: 760 }}>
        <h2 style={{ fontSize:22, fontWeight:800, marginBottom:6 }}>
          결과
        </h2>

        {/* 최종 한 줄 요약 박스 */}
        <div style={{
          padding:16,
          border:'1px solid #2d7ef7',
          borderRadius:10,
          background:'rgba(45,126,247,0.06)'
        }}>
          <div style={{ fontSize:18, fontWeight:700, marginBottom:6 }}>
            {report.headline}
          </div>
          <div style={{ color:'#555', fontSize:14, lineHeight:1.4 }}>
            {report.subNote}
          </div>
        </div>

        {/* 버튼 영역 */}
        <div style={{ display:'flex', gap:8, marginTop:16 }}>
          <button onClick={restart} style={btn('#2d7ef7')}>
            다시 시작
          </button>
          <button onClick={goUpload} style={btn('#10b981')}>
            사진 업로드
          </button>
        </div>

        <p style={{ marginTop:20, fontSize:12, color:'#888', lineHeight:1.4 }}>
          ※ 본 도구는 시험용 프로토타입입니다. 의료적 진단이 아닙니다.
        </p>
      </div>
    );
  }

  // 진행 중 화면
  return (
    <div style={{ maxWidth:760 }}>
      <div style={{ display:'flex', alignItems:'baseline', gap:12 }}>
        <h2 style={{ fontSize:22, fontWeight:800, margin:0 }}>
          문항 #{idx+1} / {total}
        </h2>
        <span style={{ color:'#888' }}>남은 시간: {remaining}s</span>
      </div>

      <p style={{ marginTop:6, color:'#ccc', fontSize:14, lineHeight:1.4 }}>
        3x3 격자 중 다른 색으로 보이는 칸을 직접 클릭하세요.
      </p>

      <canvas
        ref={canvasRef}
        width={360}
        height={360}
        onClick={handleCanvasClick}
        style={{
          width:360,
          height:360,
          borderRadius:8,
          border:'1px solid #444',
          display:'block',
          background:'#111',
          cursor:'pointer'
        }}
      />

      <div style={{ marginTop:16 }}>
        <button
          onClick={()=>submitAnswer(null)}
          style={btn('#f59e0b')}
        >
          모르겠음 / 너무 비슷함
        </button>
      </div>

      <div style={{ marginTop:12, color:'#666', fontSize:12, lineHeight:1.4 }}>
        ※ 이 테스트는 의학적 진단용이 아니며, 결과는 참고용입니다.
      </div>
    </div>
  );
}

/* ===================== 헬퍼 스타일 ===================== */
function btn(bg){
  return {
    background:bg,
    color:'#fff',
    border:0,
    padding:'9px 14px',
    borderRadius:8,
    cursor:'pointer',
    fontSize:14,
    lineHeight:1.2
  };
}
