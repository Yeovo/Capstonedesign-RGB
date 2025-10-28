import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import xkcdColors from '../assets/xkcd_color.json';

/* ---------- 색상 유틸 ---------- */
const rgb2xyz = (r,g,b)=>{
  const srgb=[r,g,b].map(v=>{v/=255; return v<=0.04045?v/12.92:Math.pow((v+0.055)/1.055,2.4)});
  const [R,G,B]=srgb;
  const X=R*0.4124564+G*0.3575761+B*0.1804375;
  const Y=R*0.2126729+G*0.7151522+B*0.0721750;
  const Z=R*0.0193339+G*0.1191920+B*0.9503041;
  return [X,Y,Z];
};
const xyz2lab=(X,Y,Z)=>{
  const ref=[0.95047,1,1.08883];
  const f=t=> t>Math.pow(6/29,3)? Math.cbrt(t):(t*(29/6)*(29/6)/3+4/29);
  const [xr,yr,zr]=[X/ref[0],Y/ref[1],Z/ref[2]];
  const fx=f(xr), fy=f(yr), fz=f(zr);
  return [116*fy-16, 500*(fx-fy), 200*(fy-fz)];
};
const rgb2lab=(r,g,b)=> xyz2lab(...rgb2xyz(r,g,b));
const labDist=(L1,a1,b1,L2,a2,b2)=>{
  const dL=L1-L2, da=a1-a2, db=b1-b2;
  return Math.sqrt(dL*dL + da*da + db*db);
};
const hex2rgb=(hex)=>{
  const h=hex.replace('#','');
  return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
};
const rgb2hex=(r,g,b)=> '#'+[r,g,b].map(v=>v.toString(16).padStart(2,'0')).join('').toUpperCase();

/* ---------- XKCD 색상 이름 찾기 ---------- */
const nearestXKCDName=(rgb)=>{
  const lab=rgb2lab(...rgb);
  let best={name:null,d:Infinity};
  for(const c of xkcdColors){
    const cRgb=hex2rgb(c.code);
    const d=labDist(...lab,...rgb2lab(...cRgb));
    if(d<best.d){ best={name:c.english,d} }
  }
  return best.name;
};

/* ---------- K-means 팔레트 추출 ---------- */
const extractPalette = async (imgUrl, clusters=5, sampleSize=200*200, iterations=10)=>{
  const canvas=document.createElement('canvas');
  const ctx=canvas.getContext('2d');
  const img=await new Promise((res,rej)=>{
    const i=new Image(); i.crossOrigin='anonymous';
    i.onload=()=>res(i); i.onerror=rej; i.src=imgUrl;
  });
  const ratio = img.width>320 ? 320/img.width:1;
  const w=Math.max(1,Math.round(img.width*ratio));
  const h=Math.max(1,Math.round(img.height*ratio));
  canvas.width=w; canvas.height=h; ctx.drawImage(img,0,0,w,h);
  const { data } = ctx.getImageData(0,0,w,h);
  const pixels=[];
  const step=Math.max(1,Math.floor((w*h)/sampleSize));
  for(let i=0;i<w*h;i+=step){
    const o=i*4,r=data[o],g=data[o+1],b=data[o+2],a=data[o+3];
    if(a<128) continue;
    pixels.push([r,g,b]);
  }
  if(!pixels.length) return [];
  const centers=[];
  for(let c=0;c<clusters;c++) centers.push(pixels[Math.floor(Math.random()*pixels.length)].slice());
  for(let it=0; it<iterations; it++){
    const sums=Array.from({length:clusters},()=>[0,0,0,0]);
    for(const p of pixels){
      let bi=0,bd=Infinity;
      for(let c=0;c<clusters;c++){
        const dr=p[0]-centers[c][0], dg=p[1]-centers[c][1], db=p[2]-centers[c][2], d=dr*dr+dg*dg+db*db;
        if(d<bd){ bd=d; bi=c }
      }
      const s=sums[bi]; s[0]+=p[0]; s[1]+=p[1]; s[2]+=p[2]; s[3]++;
    }
    for(let c=0;c<clusters;c++){
      if(sums[c][3]===0) centers[c]=pixels[Math.floor(Math.random()*pixels.length)].slice();
      else centers[c]=[
        Math.round(sums[c][0]/sums[c][3]),
        Math.round(sums[c][1]/sums[c][3]),
        Math.round(sums[c][2]/sums[c][3])
      ];
    }
  }
  const counts=Array(clusters).fill(0);
  for(const p of pixels){
    let bi=0,bd=Infinity;
    for(let c=0;c<clusters;c++){
      const dr=p[0]-centers[c][0], dg=p[1]-centers[c][1], db=p[2]-centers[c][2], d=dr*dr+dg*dg+db*db;
      if(d<bd){ bd=d; bi=c }
    }
    counts[bi]++;
  }
  const total=counts.reduce((a,b)=>a+b,0);
  return centers.map((rgb,i)=>({
    rgb,
    hex: rgb2hex(...rgb),
    pct: total?(counts[i]/total*100):0,
    name: nearestXKCDName(rgb)
  })).sort((a,b)=>b.pct-a.pct);
};

/* ---------- 색약 필터 ---------- */
const applyFilter=(r,g,b,mode)=>{
  if(mode==='none') return [r,g,b];
  if(mode==='protan') return [
    r*0.566 + g*0.433 + b*0,
    r*0.558 + g*0.442 + b*0,
    r*0 + g*0.242 + b*0.758
  ];
  if(mode==='deutan') return [
    r*0.625 + g*0.375 + b*0,
    r*0.7 + g*0.3 + b*0,
    r*0 + g*0.3 + b*0.7
  ];
  if(mode==='tritan') return [
    r*0.95 + g*0.05 + b*0,
    r*0 + g*0.433 + b*0.567,
    r*0 + g*0.475 + b*0.525
  ];
  return [r,g,b];
};

/* ---------- 메인 Result ---------- */
export default function Result(){
  const location = useLocation();
  const navigate = useNavigate();
  const { imageUrl } = location.state || {};
  const canvasRef = useRef(null);
  const [palette,setPalette] = useState([]);
  const [selectedIdx,setSelectedIdx] = useState(null);
  const [outlineMode,setOutlineMode] = useState(false);
  const [filterMode,setFilterMode] = useState('none');

  if(!imageUrl) return (
    <div style={{padding:20}}>
      <p>이미지가 전달되지 않았습니다.</p>
      <button onClick={()=>navigate('/')}>업로드 페이지로</button>
    </div>
  );

  useEffect(()=>{
    let mounted=true;
    (async()=>{
      const pal=await extractPalette(imageUrl,5);
      if(mounted) setPalette(pal);
    })();
    return ()=>{mounted=false};
  },[imageUrl]);

  useEffect(()=>{
    if(!canvasRef.current || !palette.length) return;
    (async()=>{
      const canvas=canvasRef.current;
      const ctx=canvas.getContext('2d');
      const img = await new Promise((res,rej)=>{
        const i=new Image(); i.crossOrigin='anonymous';
        i.onload=()=>res(i); i.onerror=rej; i.src=imageUrl;
      });
      const maxW=720;
      const ratio=img.width>maxW? maxW/img.width:1;
      const w=Math.round(img.width*ratio), h=Math.round(img.height*ratio);
      canvas.width=w; canvas.height=h;
      ctx.drawImage(img,0,0,w,h);
      const imgData=ctx.getImageData(0,0,w,h);
      const d=imgData.data;

      const paletteLab=palette.map(p=>rgb2lab(...p.rgb));
      const clusterMap=new Uint8Array(w*h);

      // 1️⃣ clusterMap 계산 (클러스터링 영역 고정)
      for(let i=0;i<d.length;i+=4){
        const r=d[i], g=d[i+1], b=d[i+2]; // 원본 RGB
        const lab=rgb2lab(r,g,b);
        let minDist=Infinity,minIdx=-1;
        paletteLab.forEach((pl, idx)=>{
          const dist=labDist(...lab,...pl);
          if(dist<minDist){ minDist=dist; minIdx=idx; }
        });
        clusterMap[i/4]=minIdx;
      }

      // 2️⃣ 필터 및 강조 적용
      for(let i=0;i<d.length;i+=4){
        let r=d[i], g=d[i+1], b=d[i+2];
        // 색약 필터
        [r,g,b] = applyFilter(r,g,b,filterMode);

        // 강조/흐리게
        const clusterIdx = clusterMap[i/4];
        if(selectedIdx === null || clusterIdx === selectedIdx){
          // 그대로 표시
        } else {
          const gray = Math.round(0.2126*r + 0.7152*g + 0.0722*b);
          r=g=b=gray;
        }

        d[i]=r; d[i+1]=g; d[i+2]=b;
      }

      // 3️⃣ 외곽선 강조
      if(outlineMode){
        const borderColor=[255,0,0];
        for(let y=1;y<h-1;y++){
          for(let x=1;x<w-1;x++){
            const idx=y*w+x;
            const c=clusterMap[idx];
            if(c!==clusterMap[idx-1]||c!==clusterMap[idx+1]||c!==clusterMap[idx-w]||c!==clusterMap[idx+w]){
              const o=idx*4;
              d[o]=borderColor[0]; d[o+1]=borderColor[1]; d[o+2]=borderColor[2];
            }
          }
        }
      }

      ctx.putImageData(imgData,0,0);
    })();
  },[imageUrl,palette,selectedIdx,outlineMode,filterMode]);

  return (
    <div style={{maxWidth:1000, margin:'0 auto', padding:20}}>
      <h2>색상 분석 결과</h2>

      {/* ✅ 토글 영역 */}
      <div style={{display:'flex', gap:20, alignItems:'center', marginBottom:12, flexWrap:'wrap'}}>
        {/* 필터 토글 */}
        <div style={{display:'flex', flexWrap:'wrap', gap:10, alignItems:'center'}}>
          <strong>필터:</strong>
          {['none','protan','deutan','tritan'].map(m=>(
            <button
              key={m}
              onClick={()=>setFilterMode(m)}
              style={{
                padding:'6px 12px', borderRadius:10, border:'1px solid #d1d5db', cursor:'pointer',
                background: filterMode===m?'#2d7ef7':'#fff',
                color: filterMode===m?'#fff':'#111', fontWeight:600
              }}
            >
              {m==='none'?'None': m==='protan'?'Protan': m==='deutan'?'Deutan':'Tritan'}
            </button>
          ))}
        </div>

        {/* 외곽선 토글 */}
        <div style={{display:'flex', alignItems:'center', gap:8}}>
          <span>외곽선 강조</span>
          <label style={{position:'relative', width:50, height:26, cursor:'pointer'}}>
            <input type="checkbox" checked={outlineMode} onChange={()=>setOutlineMode(o=>!o)} style={{display:'none'}}/>
            <span style={{
              position:'absolute', top:0,left:0,right:0,bottom:0,
              background: outlineMode?'#2d7ef7':'#ccc', borderRadius:26, transition:'0.3s'
            }}/>
            <span style={{
              position:'absolute', top:2, left:outlineMode?24:2, width:22,height:22,
              background:'#fff', borderRadius:'50%', transition:'0.3s', boxShadow:'0 1px 3px rgba(0,0,0,0.3)'
            }}/>
          </label>
        </div>
      </div>

      {/* ✅ 캔버스 + 팔레트 */}
      <div style={{display:'flex', alignItems:'flex-start', gap:20}}>
        <canvas ref={canvasRef} style={{border:'1px solid #ccc', borderRadius:8, maxWidth:'70%', height:'auto'}}/>

        <div style={{width:'30%'}}>
          <h3 style={{marginTop:0}}>팔레트</h3>
          <div style={{display:'flex', flexDirection:'column', gap:10, overflowY:'auto', maxHeight:'70vh'}}>
            {palette.map((p,i)=>(
              <div
                key={i}
                onClick={() => setSelectedIdx(prev => prev === i ? null : i)}
                style={{
                  cursor:'pointer', padding:8, borderRadius:8,
                  border: i===selectedIdx?'3px solid #2d7ef7':'1px solid #ccc',
                  background:'#fafafa'
                }}
              >
                <div style={{width:'100%', height:40, borderRadius:6, background:p.hex}}></div>
                <p style={{margin:'6px 0 0 0', fontSize:13}}>{p.name || '(이름 없음)'}</p>
                <code>{p.hex}</code><br/>
                <small>{p.pct.toFixed(1)}%</small>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
