import { useEffect, useMemo, useRef, useState } from 'react'

/**
 * Ishihara-like 검사 (시연용 판정 버전)
 * - 문항을 deutan/protan/control로 태깅
 * - 해당 유형 문항에서 오답/미응답일 때 유형 점수 가산
 * - 최종 휴리스틱 판정: Deutan/Protan/정상 범위/불충분
 * ⚠ 의료용 진단이 아님 (학습·데모 목적)
 */

/* ===================== 시험 설계 ===================== */
// 총 문항(예: 12문항) — 난이도(delta: 작을수록 어렵게)
const QUESTIONS = [
  // Deutan 타깃(녹색계 혼동 유도 팔레트)
  { id: 'D1', type: 'deutan', answer: '12', delta: 9,  paletteKey: 'orange-green' },
  { id: 'D2', type: 'deutan', answer: '8',  delta: 7,  paletteKey: 'olive-purple' },
  { id: 'D3', type: 'deutan', answer: '29', delta: 6,  paletteKey: 'salmon-mint' },
  { id: 'D4', type: 'deutan', answer: '45', delta: 5,  paletteKey: 'grayish-green' },

  // Protan 타깃(적색계 혼동 유도 팔레트)
  { id: 'P1', type: 'protan', answer: '6',  delta: 9,  paletteKey: 'red-blue' },
  { id: 'P2', type: 'protan', answer: '73', delta: 7,  paletteKey: 'pink-teal' },
  { id: 'P3', type: 'protan', answer: '5',  delta: 6,  paletteKey: 'blue-yellow' },
  { id: 'P4', type: 'protan', answer: '16', delta: 5,  paletteKey: 'brown-sky' },

  // Control(중립 — 모두가 보기 쉬운 편)
  { id: 'C1', type: 'control', answer: '7',  delta: 12, paletteKey: 'orange-green' },
  { id: 'C2', type: 'control', answer: '3',  delta: 12, paletteKey: 'red-blue' },
  { id: 'C3', type: 'control', answer: '9',  delta: 12, paletteKey: 'blue-yellow' },
  { id: 'C4', type: 'control', answer: '0',  delta: 12, paletteKey: 'pink-teal' },
]

const SECONDS_PER_QUESTION = 22

/* ================= 팔레트(유형별 난색/냉색 조합) ================= */
const paletteBank = [
  { key: 'orange-green', bg: { h: 28,  s: 70, l: 60 }, fg: { h: 130, s: 55, l: 58 } }, // 주황 vs 녹색 (deutan 타깃)
  { key: 'olive-purple', bg: { h: 70,  s: 45, l: 58 }, fg: { h: 275, s: 45, l: 60 } }, // 올리브 vs 보라 (deutan)
  { key: 'salmon-mint',  bg: { h: 12,  s: 60, l: 62 }, fg: { h: 150, s: 50, l: 60 } }, // 살몬 vs 민트 (deutan)
  { key: 'grayish-green',bg: { h: 30,  s: 25, l: 58 }, fg: { h: 130, s: 25, l: 60 } }, // 저채도 녹/갈 (deutan)

  { key: 'red-blue',     bg: { h: 10,  s: 65, l: 60 }, fg: { h: 220, s: 60, l: 58 } }, // 적 vs 청 (protan)
  { key: 'pink-teal',    bg: { h: 335, s: 55, l: 63 }, fg: { h: 170, s: 50, l: 60 } }, // 분홍 vs 청록 (protan)
  { key: 'blue-yellow',  bg: { h: 48,  s: 70, l: 62 }, fg: { h: 210, s: 65, l: 60 } }, // 황 vs 청 (protan)
  { key: 'brown-sky',    bg: { h: 25,  s: 45, l: 58 }, fg: { h: 200, s: 55, l: 60 } }, // 갈 vs 하늘 (protan)
]

const hsl = (h,s,l)=>`hsl(${h}deg ${s}% ${l}%)`
const clamp = (v,a,b)=>Math.max(a,Math.min(b,v))
function makePalettesFromBase(base, delta) {
  // delta가 작을수록 채도차 축소 → 구별 어려움
  const reduceS = Math.max(0, 14 - delta)
  const jitter = (n, spread)=> n + (Math.random()*2-1)*spread
  const mk = (b)=> Array.from({length:6},(_,i)=>hsl(
    clamp(jitter(b.h + (i-3)*2.5,3),0,360),
    clamp(jitter(b.s + (i-3)*2 - reduceS,4),0,100),
    clamp(jitter(b.l + (i-3)*1.5,3),0,100),
  ))
  return { bgSet: mk(base.bg), fgSet: mk(base.fg) }
}

/* ================= 숫자 스텐실 ================= */
const DIGIT_5x7 = {
  '0':['01110','10001','10011','10101','11001','10001','01110'],
  '1':['00100','01100','00100','00100','00100','00100','01110'],
  '2':['01110','10001','00001','00010','00100','01000','11111'],
  '3':['11110','00001','00001','01110','00001','00001','11110'],
  '4':['00010','00110','01010','10010','11111','00010','00010'],
  '5':['11111','10000','11110','00001','00001','10001','01110'],
  '6':['00110','01000','10000','11110','10001','10001','01110'],
  '7':['11111','00001','00010','00100','01000','01000','01000'],
  '8':['01110','10001','10001','01110','10001','10001','01110'],
  '9':['01110','10001','10001','01111','00001','00010','01100'],
}
function buildMaskFromDigits(str, gap=1){
  const rows=7, colsPer=5
  const totalCols = str.length*colsPer + (str.length-1)*gap
  const mask = Array.from({length:rows},()=>Array(totalCols).fill(false))
  let off=0
  for (const ch of str){
    const m = DIGIT_5x7[ch]; if(!m){ off+=colsPer+gap; continue }
    for(let r=0;r<rows;r++) for(let c=0;c<colsPer;c++)
      if(m[r][c]==='1') mask[r][off+c]=true
    off+=colsPer+gap
  }
  return mask
}

/* ================= 플레이트 그리기 ================= */
function IshiharaPlate({ size=420, answer, delta, paletteKey, seed }) {
  const ref = useRef(null)
  const mask = useMemo(()=>buildMaskFromDigits(answer,2),[answer])
  const palettes = useMemo(()=>{
    const base = paletteBank.find(p=>p.key===paletteKey) || paletteBank[0]
    return makePalettesFromBase(base, delta)
  },[paletteKey, delta])

  useEffect(()=>{
    const cvs = ref.current
    const ctx = cvs.getContext('2d')
    const W=size,H=size; cvs.width=W; cvs.height=H
    let s = (seed||1) >>> 0
    const rand = ()=> (s = (s*1664525 + 1013904223) % 4294967296)/4294967296

    const cx=W/2, cy=H/2, R=Math.min(W,H)*0.45
    ctx.fillStyle='#111'; ctx.fillRect(0,0,W,H) // 어두운 배경(디스플레이 편차 완화)
    const rows=mask.length, cols=mask[0].length
    const cell=(R*1.8)/Math.max(rows,cols)
    const sx=cx-(cols*cell)/2, sy=cy-(rows*cell)/2

    const {bgSet, fgSet}=palettes
    const dots=Math.floor(R*R*0.09)
    for(let i=0;i<dots;i++){
      const t=2*Math.PI*rand(), r=R*Math.sqrt(rand())
      const x=cx + r*Math.cos(t), y=cy + r*Math.sin(t)
      const c=Math.floor((x-sx)/cell), rr=Math.floor((y-sy)/cell)
      const inDigit = rr>=0&&rr<rows&&c>=0&&c<cols ? mask[rr][c] : false
      const clr=inDigit? fgSet[Math.floor(rand()*fgSet.length)] : bgSet[Math.floor(rand()*bgSet.length)]
      ctx.fillStyle=clr
      const rad=4+rand()*7
      ctx.beginPath(); ctx.arc(x+(rand()-0.5)*2, y+(rand()-0.5)*2, rad, 0, Math.PI*2); ctx.fill()
    }
    // 테두리
    ctx.strokeStyle='#d1d5db'; ctx.lineWidth=3
    ctx.beginPath(); ctx.arc(cx,cy,R,0,Math.PI*2); ctx.stroke()
  },[size, answer, delta, paletteKey, seed, palettes, mask])

  return <canvas ref={ref} style={{ width:size, height:size, display:'block', borderRadius:12 }} />
}

/* ================= 메인 컴포넌트 ================= */
export default function Test(){
  const [idx, setIdx] = useState(0)
  const [input, setInput] = useState('')
  const [answers, setAnswers] = useState([]) // {id,type,answer,input,correct,ms,delta}
  const [remaining, setRemaining] = useState(SECONDS_PER_QUESTION)
  const [running, setRunning] = useState(true)
  const startRef = useRef(Date.now())

  const q = QUESTIONS[idx]
  const total = QUESTIONS.length
  const done = answers.length === total

  // 타이머
  useEffect(()=>{
    if (!running) return
    const t = setInterval(()=>{
      setRemaining(s=>{
        if (s<=1){ clearInterval(t); submit('') ; return 0 }
        return s-1
      })
    }, 1000)
    return ()=>clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[idx, running])

  const submit = (val)=>{
    const ms = Date.now() - startRef.current
    const user = (val||'').trim()
    const correct = user === q.answer
    setAnswers(prev => [...prev, { id:q.id, type:q.type, answer:q.answer, input:user, correct, ms, delta:q.delta }])
    if (idx < total-1){
      setIdx(i=>i+1); setInput(''); setRemaining(SECONDS_PER_QUESTION)
      startRef.current = Date.now(); setRunning(true)
    } else {
      setRunning(false)
    }
  }

  const restart = ()=>{
    setIdx(0); setInput(''); setAnswers([]); setRemaining(SECONDS_PER_QUESTION)
    startRef.current = Date.now(); setRunning(true)
  }

  /* ---------- 최종 판정 로직(휴리스틱) ---------- */
  const result = useMemo(()=>{
    if (!done) return null
    const deutanWrong = answers.filter(a=>a.type==='deutan' && !a.correct).length
    const protanWrong = answers.filter(a=>a.type==='protan' && !a.correct).length
    const controlWrong = answers.filter(a=>a.type==='control' && !a.correct).length

    // 기준선(문항 4개씩): 2개 이상 틀리면 해당 유형 가능성 ↑
    let label = '정상 범위 가능성'
    let note  = '시연용 추정입니다. 정확한 검사는 전문기관을 이용하세요.'
    if (Math.max(deutanWrong, protanWrong) === 0 && controlWrong === 0) {
      label = '정상 범위 가능성'
    } else if (deutanWrong >= 2 && deutanWrong - protanWrong >= 1) {
      label = '녹색계 색각 이상(Deutan) 가능성'
    } else if (protanWrong >= 2 && protanWrong - deutanWrong >= 1) {
      label = '적색계 색각 이상(Protan) 가능성'
    } else if (controlWrong >= 2) {
      label = '판정 불충분 (디스플레이/조명/거리 등 영향 가능)'
      note  = '조도/거리/화면 설정을 바꾸고 다시 시도해보세요.'
    } else {
      label = '불분명 — 추가 검사 권장'
    }

    return {
      label, note,
      deutanWrong, protanWrong, controlWrong,
      avgMs: Math.round(answers.reduce((s,a)=>s+a.ms, 0)/answers.length)
    }
  }, [done, answers])

  /* ------------------- UI ------------------- */
  if (done && result){
    return (
      <div style={{ maxWidth: 760 }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 6 }}>결과 요약 (프로토타입)</h2>
        <p style={{ color:'#aaa', marginTop: 0 }}>
          ※ 본 테스트는 <b>의학적 진단 목적이 아닌</b> UI 프로토타입입니다.
        </p>

        <div style={{ padding: 14, border: '1px solid #2d7ef7', borderRadius: 10, background: 'rgba(45,126,247,0.06)' }}>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>{result.label}</div>
          <div style={{ color:'#555' }}>{result.note}</div>
        </div>

        <div style={{ marginTop: 12, padding: 12, border: '1px solid #e5e7eb', borderRadius: 10 }}>
          <div>총 문항: {total}</div>
          <div>평균 응답 시간: {result.avgMs} ms</div>
          <div>오답(또는 미응답): Deutan {result.deutanWrong} / Protan {result.protanWrong} / Control {result.controlWrong}</div>
        </div>

        <details style={{ marginTop: 10 }}>
          <summary>상세 보기</summary>
          <ul style={{ marginTop: 8 }}>
            {answers.map((a,i)=>(
              <li key={a.id} style={{ fontFamily:'monospace' }}>
                #{i+1} [{a.type}] target={a.answer} input={a.input || '(미응답)'} correct={String(a.correct)} time={a.ms}ms Δ={a.delta}
              </li>
            ))}
          </ul>
        </details>

        <div style={{ display:'flex', gap: 8, marginTop: 12 }}>
          <button onClick={restart} style={btn('#2d7ef7')}>다시 시작</button>
          <button onClick={()=>downloadJSON({answers, result})} style={btn('#10b981')}>결과 JSON 다운로드</button>
        </div>
      </div>
    )
  }

  // 진행 화면
  const plateSeed = idx + 1
  return (
    <div style={{ maxWidth: 760 }}>
      <div style={{ display:'flex', alignItems:'baseline', gap:12 }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>문항 #{idx+1} / {total}</h2>
        <span style={{ color:'#888' }}>남은 시간: {remaining}s</span>
      </div>
      <p style={{ marginTop: 6, color:'#ccc' }}>보이는 숫자를 입력하세요. (정확한 진단이 아닌 시연용입니다)</p>

      <IshiharaPlate
        size={420}
        answer={q.answer}
        delta={q.delta}
        paletteKey={q.paletteKey}
        seed={plateSeed}
      />

      <div style={{ display:'flex', gap:8, marginTop: 12 }}>
        <input
          value={input}
          onChange={(e)=>setInput(e.target.value)}
          placeholder="예: 12"
          maxLength={2}
          style={{ border:'1px solid #374151', background:'#111', color:'#eee', borderRadius:8, padding:'8px 10px', width:120 }}
        />
        <button onClick={()=>submit(input)} style={btn('#2d7ef7')}>제출</button>
        <button onClick={()=>submit('')} style={btn('#f59e0b')}>모르겠음</button>
      </div>
    </div>
  )
}

/* --------------- 헬퍼 --------------- */
function btn(bg){ return { background:bg, color:'#fff', border:0, padding:'9px 14px', borderRadius:8, cursor:'pointer' } }
function downloadJSON(payload){
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type:'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href=url; a.download='ishihara_like_result.json'; a.click()
  URL.revokeObjectURL(url)
}
