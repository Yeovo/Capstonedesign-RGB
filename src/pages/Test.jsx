import { useEffect, useMemo, useRef, useState } from 'react'

/**
 * Ishihara-like plate (랜덤 출제 버전)
 * - 숫자: 1~3자리 랜덤(원하면 설정에서 길이 조정)
 * - 팔레트: 여러 조합 중 매 문항 랜덤 선택
 * - 난이도(delta): 범위 내에서 랜덤 (작을수록 어려움)
 * - 의학적 진단 아님(시연/학습용)
 */

/* ===================== 설정 ===================== */
// 총 문항 수
const TOTAL_QUESTIONS = 8
// 문항당 제한 시간(초)
const SECONDS_PER_QUESTION = 25
// 숫자 길이 (예: [1,2,3]이면 1~3자리에서 랜덤)
const DIGIT_LENGTH_CANDIDATES = [1, 2, 3]
// 난이도 범위(Δ). 작을수록 어렵다.
const DELTA_RANGE = { min: 4, max: 12 }

// 출제 가능한 숫자(문자열). 0 포함 여부 결정 가능.
const DIGIT_POOL = '0123456789'

/* =============== 5x7 도트 숫자 마스크 =============== */
const DIGIT_5x7 = {
  '0': ['01110','10001','10011','10101','11001','10001','01110'],
  '1': ['00100','01100','00100','00100','00100','00100','01110'],
  '2': ['01110','10001','00001','00010','00100','01000','11111'],
  '3': ['11110','00001','00001','01110','00001','00001','11110'],
  '4': ['00010','00110','01010','10010','11111','00010','00010'],
  '5': ['11111','10000','11110','00001','00001','10001','01110'],
  '6': ['00110','01000','10000','11110','10001','10001','01110'],
  '7': ['11111','00001','00010','00100','01000','01000','01000'],
  '8': ['01110','10001','10001','01110','10001','10001','01110'],
  '9': ['01110','10001','10001','01111','00001','00010','01100'],
}

// "29" -> 5x7 + 간격으로 붙인 불리언 마스크
function buildMaskFromDigits(str, gap = 1) {
  const rows = 7
  const colsPerDigit = 5
  const totalCols = str.length * colsPerDigit + (str.length - 1) * gap
  const mask = Array.from({ length: rows }, () => Array(totalCols).fill(false))
  let offset = 0
  for (const ch of str) {
    const m = DIGIT_5x7[ch]
    if (!m) { offset += colsPerDigit + gap; continue }
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < colsPerDigit; c++) {
        if (m[r][c] === '1') mask[r][offset + c] = true
      }
    }
    offset += colsPerDigit + gap
  }
  return mask
}

/* ================= 팔레트 뱅크 =================
   - fg: 숫자(문양) 쪽 색군, bg: 배경 색군
   - l(명도)는 비슷하게, h/s 차이로 구별 (Ishihara 아이디어)
   - delta가 작을수록 두 팔레트 차이를 줄여 난이도 상승
*/
const paletteBank = [
  { key: 'orange-green',
    bg: { h: 28,  s: 70, l: 60 }, fg: { h: 130, s: 55, l: 58 } }, // 주황 vs 녹색
  { key: 'red-blue',
    bg: { h: 10,  s: 65, l: 60 }, fg: { h: 220, s: 60, l: 58 } }, // 적 vs 청
  { key: 'blue-yellow',
    bg: { h: 48,  s: 70, l: 62 }, fg: { h: 210, s: 65, l: 60 } }, // 황 vs 청
  { key: 'pink-teal',
    bg: { h: 335, s: 55, l: 63 }, fg: { h: 170, s: 50, l: 60 } }, // 분홍 vs 청록
  { key: 'brown-sky',
    bg: { h: 25,  s: 45, l: 58 }, fg: { h: 200, s: 55, l: 60 } }, // 갈색 vs 하늘
  { key: 'olive-purple',
    bg: { h: 70,  s: 45, l: 58 }, fg: { h: 275, s: 45, l: 60 } }, // 올리브 vs 보라
  { key: 'salmon-mint',
    bg: { h: 12,  s: 60, l: 62 }, fg: { h: 150, s: 50, l: 60 } }, // 살몬 vs 민트
  { key: 'grayish-green',
    bg: { h: 30,  s: 25, l: 58 }, fg: { h: 130, s: 25, l: 60 } }, // 저채도 (난이도↑)
]

const clamp = (v,a,b)=>Math.max(a,Math.min(b,v))
const hsl = (h,s,l)=>`hsl(${h}deg ${s}% ${l}%)`

function makePalettesFromBase(base, delta) {
  // delta가 작을수록 s(채도) 차이를 줄여 구별 어렵게
  const reduceS = Math.max(0, 14 - delta)
  const jitter = (n, spread)=> n + (Math.random()*2-1)*spread

  const mkSet = (b) => Array.from({length:6}, (_,i)=>hsl(
    clamp(jitter(b.h + (i-3)*2.5, 3), 0, 360),
    clamp(jitter(b.s + (i-3)*2 - reduceS, 4), 0, 100),
    clamp(jitter(b.l + (i-3)*1.5, 3), 0, 100),
  ))

  return { bgSet: mkSet(base.bg), fgSet: mkSet(base.fg) }
}

/* =============== 랜덤 출제 유틸 =============== */
function randInt(min, max) { return Math.floor(Math.random()*(max-min+1))+min }
function pick(arr){ return arr[Math.floor(Math.random()*arr.length)] }

function randomAnswer() {
  const len = pick(DIGIT_LENGTH_CANDIDATES)
  let s = ''
  for (let i=0;i<len;i++) s += pick(DIGIT_POOL)
  // 맨 앞 0을 피하고 싶다면 아래 주석 해제
  // if (s.length>1 && s[0]==='0') s = String(randInt(1,9)) + s.slice(1)
  return s
}

function generateQuestion(i) {
  return {
    id: `q${i+1}`,
    answer: randomAnswer(),
    delta: randInt(DELTA_RANGE.min, DELTA_RANGE.max),
    paletteKey: pick(paletteBank).key,
    seconds: SECONDS_PER_QUESTION,
    seed: i + 1,
  }
}

/* ================= 캔버스 렌더러 ================= */
function IshiharaPlate({ size = 440, answer, delta, paletteKey, seed }) {
  const ref = useRef(null)
  const mask = useMemo(()=>buildMaskFromDigits(answer, 2),[answer])
  const palettes = useMemo(()=>{
    const base = paletteBank.find(p=>p.key===paletteKey) || paletteBank[0]
    return makePalettesFromBase(base, delta)
  },[paletteKey, delta])

  useEffect(()=>{
    const cvs = ref.current
    const ctx = cvs.getContext('2d')
    const W = size, H = size
    cvs.width = W; cvs.height = H

    // 의사 난수(재현성 조금 유지)
    let s = seed || 1
    const rand = ()=> (s = (s*1664525 + 1013904223) % 4294967296)/4294967296

    const cx = W/2, cy = H/2
    const R = Math.min(W,H)*0.45

    // 배경
    ctx.fillStyle = '#fff'; ctx.fillRect(0,0,W,H)

    // 스텐실 배치
    const rows = mask.length, cols = mask[0].length
    const cell = (R*1.8)/Math.max(rows,cols) // 숫자 크기
    const startX = cx - (cols*cell)/2
    const startY = cy - (rows*cell)/2

    const { bgSet, fgSet } = palettes

    const dots = Math.floor(R*R*0.09) // 밀도
    for (let i=0;i<dots;i++){
      // 원 안 임의 위치
      const t = 2*Math.PI*rand()
      const r = R*Math.sqrt(rand())
      const x = cx + r*Math.cos(t)
      const y = cy + r*Math.sin(t)

      // 숫자 영역인지 확인
      const c = Math.floor((x - startX)/cell)
      const rIdx = Math.floor((y - startY)/cell)
      const inDigit = rIdx>=0 && rIdx<rows && c>=0 && c<cols ? mask[rIdx][c] : false

      const clr = inDigit ? fgSet[Math.floor(rand()*fgSet.length)]
                          : bgSet[Math.floor(rand()*bgSet.length)]
      ctx.fillStyle = clr
      const radius = 4 + rand()*7
      ctx.beginPath()
      ctx.arc(x+(rand()-0.5)*2, y+(rand()-0.5)*2, radius, 0, Math.PI*2)
      ctx.fill()
    }

    // 외곽 링
    ctx.strokeStyle = '#d1d5db'; ctx.lineWidth = 3
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI*2); ctx.stroke()
  },[size, answer, delta, paletteKey, seed, palettes, mask])

  return <canvas ref={ref} style={{ width:size, height:size, display:'block' }} />
}

/* ================= 메인 컴포넌트 ================= */
export default function Test() {
  // 시작 시 한 번에 전 문항을 랜덤 생성
  const [questions] = useState(()=>Array.from({length: TOTAL_QUESTIONS}, (_,i)=>generateQuestion(i)))
  const [idx, setIdx] = useState(0)
  const [input, setInput] = useState('')
  const [answers, setAnswers] = useState([]) // {id, answer, input, correct, timeMs, delta, paletteKey}
  const [remaining, setRemaining] = useState(questions[0].seconds)
  const [running, setRunning] = useState(true)
  const startedRef = useRef(Date.now())

  const q = questions[idx]
  const total = questions.length
  const done = answers.length === total

  // 타이머
  useEffect(()=>{
    if (!running) return
    const t = setInterval(()=>{
      setRemaining(s=>{
        if (s<=1){
          clearInterval(t)
          submit('') // 미응답 처리
          return 0
        }
        return s-1
      })
    },1000)
    return ()=>clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[idx, running])

  const submit = (val) => {
    const timeMs = Date.now() - startedRef.current
    const user = val.trim()
    const correct = user === q.answer
    setAnswers(prev => [...prev, {
      id: q.id, answer: q.answer, input: user, correct, timeMs,
      delta: q.delta, paletteKey: q.paletteKey
    }])

    if (idx < total-1){
      setIdx(i=>i+1)
      setInput('')
      setRemaining(questions[idx+1].seconds)
      startedRef.current = Date.now()
      setRunning(true)
    } else {
      setRunning(false)
    }
  }

  const restart = () => {
    // 새 시험을 완전 랜덤으로 다시 생성
    const fresh = Array.from({length: TOTAL_QUESTIONS}, (_,i)=>generateQuestion(i))
    setIdx(0)
    setInput('')
    setAnswers([])
    setRemaining(fresh[0].seconds)
    setRunning(true)
    startedRef.current = Date.now()
    // questions 자체를 갱신하려면 별도 state가 필요하지만,
    // 간단히 페이지 리로드로도 가능. 여기서는 다시 생성해서 사용:
    window.location.reload() // 가장 간단한 방법 (상태/팔레트/숫자 전부 새로)
  }

  const correctCount = answers.filter(a=>a.correct).length

  if (done){
    return (
      <div style={{ maxWidth: 780 }}>
        <h2 style={{ fontSize:22, fontWeight:700, marginBottom:8 }}>결과 요약 (프로토타입)</h2>
        <p style={{ color:'#666', marginTop:0 }}>
          ※ 본 테스트는 <b>의학적 진단 목적이 아닌</b> UI 프로토타입입니다.
        </p>

        <div style={{ border:'1px solid #e5e7eb', borderRadius:10, padding:12, marginBottom:12 }}>
          <div>총 문항: {total}</div>
          <div>정답 수: {correctCount}</div>
          <div>평균 응답 시간: {Math.round(answers.reduce((s,a)=>s+a.timeMs,0)/total)} ms</div>
        </div>

        <details>
          <summary>상세 보기</summary>
          <ul style={{ marginTop:8 }}>
            {answers.map((a,i)=>(
              <li key={a.id} style={{ fontFamily:'monospace' }}>
                #{i+1} id={a.id} target={a.answer} input={a.input || '(미응답)'}
                {' '}correct={String(a.correct)} time={a.timeMs}ms
                {' '}delta={a.delta} palette={a.paletteKey}
              </li>
            ))}
          </ul>
        </details>

        <div style={{ display:'flex', gap:8, marginTop:12 }}>
          <button onClick={downloadJSON.bind(null, answers)} style={btn('#10b981')}>결과 JSON 다운로드</button>
          <button onClick={restart} style={btn('#2d7ef7')}>새로 시작(랜덤)</button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 780 }}>
      <div style={{ display:'flex', alignItems:'baseline', gap:12 }}>
        <h2 style={{ fontSize:22, fontWeight:700, margin:0 }}>
          문항 #{idx+1} / {total}
        </h2>
        <span style={{ color:'#666' }}>남은 시간: {remaining}s</span>
      </div>

      <div style={{ margin:'8px 0 14px', color:'#444' }}>
        원형 점무늬 안에 보이는 <b>숫자</b>를 입력하세요. (1~3자리 랜덤)
      </div>

      <IshiharaPlate
        size={440}
        answer={q.answer}
        delta={q.delta}
        paletteKey={q.paletteKey}
        seed={q.seed}
      />

      <div style={{ display:'flex', gap:8, marginTop:12 }}>
        <input
          value={input}
          onChange={(e)=>setInput(e.target.value)}
          placeholder="예: 12 / 8 / 345"
          maxLength={3}
          style={{ border:'1px solid #d1d5db', borderRadius:8, padding:'8px 10px', width:140 }}
        />
        <button onClick={()=>submit(input)} style={btn('#2d7ef7')}>제출</button>
        <button onClick={()=>submit('')} style={btn('#f59e0b')}>모르겠음</button>
      </div>

      <p style={{ color:'#6b7280', marginTop:10, fontSize:12 }}>
        팔레트/난이도/숫자가 매 문항 랜덤 출제됩니다. (Δ가 작을수록 더 어려움)
      </p>
    </div>
  )
}

/* =============== 헬퍼 =============== */
function btn(bg){
  return { background:bg, color:'#fff', border:0, padding:'9px 14px', borderRadius:8, cursor:'pointer' }
}
function downloadJSON(answers){
  const payload = {
    version: 'week6-ishihara-random-1',
    at: new Date().toISOString(),
    answers,
    disclaimer: '본 결과는 프로토타입으로 의학적 진단이 아닙니다.'
  }
  const blob = new Blob([JSON.stringify(payload,null,2)], {type:'application/json'})
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = 'ishihara_like_random_results.json'; a.click()
  URL.revokeObjectURL(url)
}
