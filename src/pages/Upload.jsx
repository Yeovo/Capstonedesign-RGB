import { useEffect, useRef, useState } from 'react'

/**
 * 8주차: 색상칩 선택 강조 + 필터 토글 UI (라이트 테마 크기 업 적용)
 * - 팔레트 색상칩 클릭 → 선택된 색을 Lab 거리 기준으로 하이라이트
 * - 필터 토글: None / Protan / Deutan / Tritan (근사, 시연용)
 * - 허용치(ΔE 유사) 슬라이더로 강조 강도 조절
 * - 레이아웃/타이포 확대: 미리보기/칩/표/제목 크기 업
 */

export default function Upload() {
  const [imageUrl, setImageUrl] = useState(null)
  const [fileInfo, setFileInfo] = useState(null)
  const [palette, setPalette] = useState([])       // [{hex, rgb:[r,g,b], name, pct}]
  const [k, setK] = useState(5)
  const [selectedIdx, setSelectedIdx] = useState(null)
  const [filterMode, setFilterMode] = useState('none') // none | protan | deutan | tritan
  const [tolerance, setTolerance] = useState(25)       // 강조 허용치 (ΔE 근사)

  const dropRef = useRef(null)
  const paletteCanvasRef = useRef(null)   // 팔레트 계산용
  const previewCanvasRef = useRef(null)   // 하이라이트 미리보기용

  /* ---------------------- 업로드 UI ---------------------- */
  const resetBorder = () => { if (dropRef.current) dropRef.current.style.border = '2px dashed #d1d5db' }
  const handleFile = (file) => {
    if (!file) return
    if (!file.type.startsWith('image/')) { alert('이미지 파일만 업로드할 수 있어요.'); return }
    const url = URL.createObjectURL(file)
    setImageUrl(url)
    setFileInfo({ name: file.name, sizeKB: (file.size / 1024).toFixed(1) + ' KB', type: file.type })
    setSelectedIdx(null)
  }
  const onInputChange = (e) => handleFile(e.target.files?.[0])
  const onDrop = (e) => { e.preventDefault(); handleFile(e.dataTransfer.files?.[0]); resetBorder() }
  const onDragOver = (e) => { e.preventDefault(); if (dropRef.current) dropRef.current.style.border = '2px solid #2d7ef7' }
  const onDragLeave = () => resetBorder()
  const clearAll = () => { setImageUrl(null); setFileInfo(null); setPalette([]); setSelectedIdx(null) }

  /* ---------------------- 색 이름(라이트) & 유틸 ---------------------- */
  const NAME_TABLE = [
    { name: '빨강', rgb: [220,38,38] }, { name: '주황', rgb: [234,88,12] }, { name: '호박', rgb: [245,158,11] },
    { name: '노랑', rgb: [250,204,21] }, { name: '라임', rgb: [132,204,22] }, { name: '초록', rgb: [34,197,94] },
    { name: '청록', rgb: [20,184,166] }, { name: '시안', rgb: [6,182,212] }, { name: '하늘', rgb: [14,165,233] },
    { name: '파랑', rgb: [37,99,235] }, { name: '남색', rgb: [79,70,229] }, { name: '보라', rgb: [124,58,237] },
    { name: '자주', rgb: [147,51,234] }, { name: '핑크', rgb: [236,72,153] }, { name: '로즈', rgb: [244,63,94] },
    { name: '갈색', rgb: [120,72,48] }, { name: '올리브', rgb: [128,128,64] }, { name: '회색', rgb: [120,120,120] },
    { name: '검정', rgb: [20,20,20] }, { name: '흰색', rgb: [245,245,245] },
  ]
  const toHex = (r,g,b)=> '#'+[r,g,b].map(v=>v.toString(16).padStart(2,'0')).join('').toUpperCase()

  // sRGB -> XYZ -> Lab
  const rgb2xyz = (r,g,b) => {
    const srgb=[r,g,b].map(v=>{ v/=255; return v<=0.04045? v/12.92 : Math.pow((v+0.055)/1.055,2.4) })
    const [R,G,B]=srgb
    const X=R*0.4124564 + G*0.3575761 + B*0.1804375
    const Y=R*0.2126729 + G*0.7151522 + B*0.0721750
    const Z=R*0.0193339 + G*0.1191920 + B*0.9503041
    return [X,Y,Z]
  }
  const xyz2lab = (X,Y,Z) => {
    const ref=[0.95047,1.00000,1.08883]
    const f=(t)=> t>Math.pow(6/29,3)? Math.cbrt(t) : (t*(29/6)*(29/6)/3 + 4/29)
    const [xr,yr,zr]=[X/ref[0],Y/ref[1],Z/ref[2]]
    const fx=f(xr), fy=f(yr), fz=f(zr)
    return [116*fy-16, 500*(fx-fy), 200*(fy-fz)]
  }
  const rgb2lab = (r,g,b)=> xyz2lab(...rgb2xyz(r,g,b))
  const labDist = (L1,a1,b1,L2,a2,b2)=> {
    const dL=L1-L2, da=a1-a2, db=b1-b2
    return Math.sqrt(dL*dL + da*da + db*db)
  }
  const nearestName = (rgb) => {
    const [L1,a1,b1] = rgb2lab(...rgb)
    let best={ name:'기타', d:Infinity }
    for (const cand of NAME_TABLE) {
      const [L2,a2,b2]=rgb2lab(...cand.rgb)
      const d = (L1-L2)**2 + (a1-a2)**2 + (b1-b2)**2
      if (d<best.d) best={ name:cand.name, d }
    }
    return best.name
  }

  /* ---------------------- 간단 K-means 팔레트 ---------------------- */
  const extractPalette = async (imgUrl, clusters=5, sampleSize=200*200, iterations=10) => {
    if (!paletteCanvasRef.current) return []
    const img = await loadImage(imgUrl)
    const cvs = paletteCanvasRef.current, ctx = cvs.getContext('2d')
    const maxW = 320
    const ratio = img.width > maxW ? maxW / img.width : 1
    const w = Math.max(1, Math.round(img.width*ratio))
    const h = Math.max(1, Math.round(img.height*ratio))
    cvs.width = w; cvs.height = h
    ctx.drawImage(img, 0, 0, w, h)
    const { data } = ctx.getImageData(0,0,w,h)

    const pixels=[]
    const step=Math.max(1, Math.floor((w*h)/sampleSize))
    for(let i=0;i<w*h;i+=step){
      const o=i*4; const r=data[o], g=data[o+1], b=data[o+2], a=data[o+3]
      if (a<128) continue
      const lum=0.2126*r+0.7152*g+0.0722*b
      if (lum<8 || lum>247) continue
      pixels.push([r,g,b])
    }
    if (!pixels.length) return []

    const centers=[]
    for(let c=0;c<clusters;c++) centers.push(pixels[Math.floor(Math.random()*pixels.length)].slice())
    for(let it=0; it<iterations; it++){
      const sums=Array.from({length:clusters},()=>[0,0,0,0])
      for(const p of pixels){
        let bi=0, bd=Infinity
        for(let c=0;c<clusters;c++){
          const dr=p[0]-centers[c][0], dg=p[1]-centers[c][1], db=p[2]-centers[c][2]
          const d=dr*dr+dg*dg+db*db
          if (d<bd){ bd=d; bi=c }
        }
        const s=sums[bi]; s[0]+=p[0]; s[1]+=p[1]; s[2]+=p[2]; s[3]++
      }
      for(let c=0;c<clusters;c++){
        if (sums[c][3]===0) centers[c]=pixels[Math.floor(Math.random()*pixels.length)].slice()
        else centers[c]=[ Math.round(sums[c][0]/sums[c][3]), Math.round(sums[c][1]/sums[c][3]), Math.round(sums[c][2]/sums[c][3]) ]
      }
    }
    const counts=Array(clusters).fill(0)
    for(const p of pixels){
      let bi=0, bd=Infinity
      for(let c=0;c<clusters;c++){
        const dr=p[0]-centers[c][0], dg=p[1]-centers[c][1], db=p[2]-centers[c][2]
        const d=dr*dr+dg*dg+db*db
        if (d<bd){ bd=d; bi=c }
      }
      counts[bi]++
    }
    const total=counts.reduce((a,b)=>a+b,0)
    return centers.map((rgb,i)=>{
      const pct= total? (counts[i]/total)*100 : 0
      return { rgb, hex: toHex(rgb[0],rgb[1],rgb[2]), name: nearestName(rgb), pct }
    }).sort((a,b)=> b.pct - a.pct)
  }

  const loadImage = (src) => new Promise((res, rej)=>{ const img=new Image(); img.crossOrigin='anonymous'; img.onload=()=>res(img); img.onerror=rej; img.src=src })

  // 이미지가 바뀌거나 k가 바뀌면 팔레트 재계산
  useEffect(()=>{
    let mounted=true
    if (!imageUrl) return
    ;(async()=>{
      const pal = await extractPalette(imageUrl, k)
      if (mounted) setPalette(pal)
    })()
    return ()=>{ mounted=false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageUrl, k])

  /* ---------------------- 하이라이트 캔버스 렌더 ---------------------- */
  useEffect(()=>{
    if (!imageUrl || !previewCanvasRef.current) return
    ;(async()=>{
      const canvas = previewCanvasRef.current
      const ctx = canvas.getContext('2d')
      const img = await loadImage(imageUrl)

      // ✅ 미리보기 최대 폭 확대: 720px
      const maxW = 720
      const ratio = img.width > maxW ? maxW / img.width : 1
      const w = Math.max(1, Math.round(img.width * ratio))
      const h = Math.max(1, Math.round(img.height * ratio))
      canvas.width = w; canvas.height = h

      // (1) 원본 그리기
      ctx.clearRect(0,0,w,h)
      ctx.drawImage(img, 0, 0, w, h)
      let imgData = ctx.getImageData(0,0,w,h)
      let d = imgData.data

      // (2) 색약 필터 근사 적용
      const applyFilter = (r,g,b, mode) => {
        if (mode==='none') return [r,g,b]
        if (mode==='protan') return [
          r*0.566 + g*0.433 + b*0.0,
          r*0.558 + g*0.442 + b*0.0,
          r*0.0   + g*0.242 + b*0.758,
        ]
        if (mode==='deutan') return [
          r*0.625 + g*0.375 + b*0.0,
          r*0.7   + g*0.3   + b*0.0,
          r*0.0   + g*0.3   + b*0.7,
        ]
        if (mode==='tritan') return [
          r*0.95  + g*0.05  + b*0.0,
          r*0.0   + g*0.433 + b*0.567,
          r*0.0   + g*0.475 + b*0.525,
        ]
        return [r,g,b]
      }

      // (3) 강조(선택 색과 가까운 픽셀 제외는 흐리게)
      let targetLab = null
      if (selectedIdx!=null && palette[selectedIdx]) {
        const [tr,tg,tb] = palette[selectedIdx].rgb
        targetLab = rgb2lab(tr, tg, tb)
      }

      for (let i=0; i<d.length; i+=4) {
        let r=d[i], g=d[i+1], b=d[i+2], a=d[i+3]
        ;[r,g,b] = applyFilter(r,g,b, filterMode)

        if (targetLab) {
          const [L,a1,b1] = rgb2lab(r,g,b)
          const dist = labDist(L,a1,b1, ...targetLab)
          if (dist > tolerance) {
            const gray = Math.round(0.2126*r + 0.7152*g + 0.0722*b)
            r = Math.round((r + gray*2) / 3)
            g = Math.round((g + gray*2) / 3)
            b = Math.round((b + gray*2) / 3)
          }
        }
        d[i]=r; d[i+1]=g; d[i+2]=b; d[i+3]=a
      }

      ctx.putImageData(imgData, 0, 0)
      if (selectedIdx!=null) {
        ctx.strokeStyle = 'rgba(45,126,247,0.9)'
        ctx.lineWidth = 2
        ctx.strokeRect(1,1,w-2,h-2)
      }
    })()
  }, [imageUrl, palette, selectedIdx, filterMode, tolerance])

  /* ---------------------- UI ---------------------- */
  return (
    <div style={{ maxWidth: 1240, margin: '0 auto' }}>
      <h2 style={{ fontSize:34, fontWeight:800, color:'#111', margin:'10px 0 12px' }}>
        이미지 업로드 + 색상 강조 & 필터 토글
      </h2>

      {/* 업로드 영역 */}
      <div
        ref={dropRef}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        style={{ border:'2px dashed #d1d5db', borderRadius:12, padding:20, textAlign:'center', marginTop:12, background:'#fafafa' }}
      >
        <p style={{ marginBottom:12, color:'#333' }}>이미지를 드래그하거나 버튼을 눌러 선택하세요</p>
        <input id="fileInput" type="file" accept="image/*" onChange={onInputChange} style={{ display:'none' }} />
        <label htmlFor="fileInput" style={{ background:'#2d7ef7', color:'#fff', padding:'12px 18px', borderRadius:10, cursor:'pointer', fontWeight:600 }}>
          파일 선택
        </label>
      </div>

      {/* 본문 */}
      {imageUrl && (
        <div style={{ display:'grid', gridTemplateColumns:'1.6fr 1fr', gap:20, marginTop:20 }}>
          {/* 좌: 하이라이트 미리보기 + 컨트롤 */}
          <div>
            {/* 필터 토글 */}
            <div style={{ display:'flex', flexWrap:'wrap', gap:10, alignItems:'center', marginBottom:10 }}>
              <strong>필터:</strong>
              {['none','protan','deutan','tritan'].map(m => (
                <button
                  key={m}
                  onClick={()=>setFilterMode(m)}
                  style={{
                    padding:'8px 12px', borderRadius:10, border: '1px solid #d1d5db', cursor:'pointer',
                    background: filterMode===m ? '#2d7ef7' : '#fff',
                    color: filterMode===m ? '#fff' : '#111', fontWeight:600
                  }}
                >
                  {m==='none'?'None': m==='protan'?'Protan': m==='deutan'?'Deutan':'Tritan'}
                </button>
              ))}
              <div style={{ marginLeft:12, color:'#333' }}>
                <label>강조 허용치(±):&nbsp;
                  <input type="range" min={8} max={40} value={tolerance} onChange={(e)=>setTolerance(parseInt(e.target.value))}
                         style={{ verticalAlign:'middle' }} />
                  &nbsp;<code>{tolerance}</code>
                </label>
              </div>
            </div>

            {/* 하이라이트 캔버스 미리보기 (폭 자동, 내부 해상도 720 기준) */}
            <canvas ref={previewCanvasRef} style={{ width:'100%', borderRadius:12, border:'1px solid #e5e7eb', background:'#fff' }} />

            {fileInfo && (
              <div style={{ marginTop:10, color:'#444', fontSize:15 }}>
                📁 {fileInfo.name} · {fileInfo.sizeKB} · {fileInfo.type}
              </div>
            )}
          </div>

          {/* 우: 팔레트 패널 */}
          <div>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <h3 style={{ margin:0, fontSize:20 }}>팔레트 (k={k})</h3>
              <label style={{ color:'#333' }}>개수:&nbsp;
                <select value={k} onChange={(e)=>setK(parseInt(e.target.value))}>
                  {[3,4,5,6,7,8].map(n=> <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
            </div>

            {/* 칩 바 (크기 업) */}
            <div style={{ display:'flex', gap:10, flexWrap:'wrap', margin:'12px 0' }}>
              {palette.map((c, i)=>(
                <button
                  key={i}
                  onClick={()=> setSelectedIdx(i===selectedIdx ? null : i)}
                  title={`${c.hex} • ${c.name} • ${c.pct.toFixed(1)}%`}
                  style={{
                    width:56, height:56, borderRadius:10, border: '3px solid',
                    borderColor: i===selectedIdx ? '#2d7ef7' : '#e5e7eb',
                    outline:'none', cursor:'pointer', background:c.hex
                  }}
                />
              ))}
            </div>

            {/* 상세 표 (폰트/패딩 업) */}
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:16 }}>
              <thead>
                <tr style={{ borderBottom:'1px solid #e5e7eb' }}>
                  <th style={{ width:48, padding:'10px 0' }}></th>
                  <th style={{ textAlign:'left', padding:'10px 0' }}>HEX</th>
                  <th style={{ textAlign:'left', padding:'10px 0' }}>RGB</th>
                  <th style={{ textAlign:'left', padding:'10px 0' }}>색</th>
                  <th style={{ textAlign:'right', padding:'10px 0' }}>점유율</th>
                </tr>
              </thead>
              <tbody>
                {palette.length===0 ? (
                  <tr><td colSpan={5} style={{ padding:'12px 0', color:'#666' }}>팔레트를 계산 중이거나 결과가 없습니다.</td></tr>
                ) : palette.map((c,i)=>(
                  <tr key={i} style={{ borderBottom:'1px solid #f1f5f9', background: i===selectedIdx ? 'rgba(45,126,247,0.08)' : 'transparent' }}>
                    <td style={{ padding:'10px 0' }}>
                      <span style={{ display:'inline-block', width:26, height:26, borderRadius:8, border:'1px solid #e5e7eb', background:c.hex }} />
                    </td>
                    <td style={{ padding:'10px 0' }}><code>{c.hex}</code></td>
                    <td style={{ padding:'10px 0' }}><code>({c.rgb[0]}, {c.rgb[1]}, {c.rgb[2]})</code></td>
                    <td style={{ padding:'10px 0' }}>{c.name}</td>
                    <td style={{ padding:'10px 0', textAlign:'right' }}>{c.pct.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 내부 계산 캔버스(숨김) */}
      <canvas ref={paletteCanvasRef} style={{ display:'none' }} />
    </div>
  )
}
