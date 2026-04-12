// ═══════════════════════════════════════════════════════════════════════════
//  NACIONAL AUTOTRANSPORTE — ERP TMS v9
//  Todas las correcciones aplicadas — ver changelog en apps-script.gs
// ═══════════════════════════════════════════════════════════════════════════
const { useState, useEffect, useRef } = React;

const SHEETS_URL = window.SHEETS_URL || "PEGA_TU_URL_AQUI";
const USAR_SHEETS = SHEETS_URL !== "PEGA_TU_URL_AQUI";
const STORAGE_KEY = "nal_erp_v9";

const ld = () => { try{const r=localStorage.getItem(STORAGE_KEY);return r?JSON.parse(r):null;}catch{return null;} };
const sd = (d) => { try{localStorage.setItem(STORAGE_KEY,JSON.stringify(d));}catch{} };
const initData = () => { const s=ld(); if(s&&s.v===9)return s; return {v:9,resumen:null,cajasList:[],viajesList:[],lastSync:""}; };

const apiGet = async (tab) => { const r=await fetch(`${SHEETS_URL}?tab=${encodeURIComponent(tab)}`); const j=await r.json(); return Array.isArray(j)?j:(j.data||j); };
const apiPost = async (tab,rows) => { await fetch(SHEETS_URL,{method:"POST",mode:"no-cors",headers:{"Content-Type":"application/json"},body:JSON.stringify({tab,action:"replace",rows})}); };

// ── HELPERS ───────────────────────────────────────────────────────────────────
const $n = v => parseFloat(String(v||"0").replace(/[$,]/g,""))||0;
const C  = {TELLO:"#3b82f6",CRISTIAN:"#10b981",JULIO:"#f59e0b"};
const cc = (c="") => { const u=c.toUpperCase(); if(u.includes("TELLO"))return C.TELLO; if(u.includes("CRISTIAN")||u.includes("ZUÑIGA")||u.includes("ZUNIGA"))return C.CRISTIAN; if(u.includes("JULIO")||u.includes("HERNANDEZ"))return C.JULIO; return"#6366f1"; };
const ck = (c="") => { const u=c.toUpperCase(); if(u.includes("TELLO"))return"TELLO"; if(u.includes("CRISTIAN")||u.includes("ZUÑIGA")||u.includes("ZUNIGA"))return"CRISTIAN"; if(u.includes("JULIO")||u.includes("HERNANDEZ"))return"JULIO"; return null; };
const ec = (e="") => { const s=e.toLowerCase(); if(s.includes("vta")||s.includes("facturando")||s.includes("trn")||s.includes("mov")||s.includes("entregado")||s.includes("finalizado")||s.includes("terminado"))return"#10b981"; if(s.includes("dco"))return"#3b82f6"; if(s.includes("dso"))return"#64748b"; if(s.includes("lib"))return"#a855f7"; if(s.includes("cp")||s.includes("rm")||s.includes("sg")||s.includes("mtto")||s.includes("siniestro")||s.includes("reparac"))return"#f59e0b"; if(s.includes("so")||s.includes("sin operador"))return"#475569"; if(s.includes("ind"))return"#ef4444"; if(s.includes("per")||s.includes("permiso"))return"#a855f7"; if(s.includes("cargada"))return"#10b981"; if(s.includes("dañada")||s.includes("no localizada"))return"#ef4444"; if(s.includes("disponible"))return"#3b82f6"; return"#64748b"; };
const Badge = ({text,small}) => <span style={{background:ec(text)+"22",color:ec(text),border:`1px solid ${ec(text)}44`,borderRadius:5,padding:small?"1px 5px":"2px 7px",fontSize:small?9:10,fontWeight:700,letterSpacing:.5,textTransform:"uppercase",whiteSpace:"nowrap"}}>{text}</span>;
const fmt$ = v => v>=1000000?`$${(v/1000000).toFixed(2)}M`:v>=1000?`$${(v/1000).toFixed(0)}K`:`$${Math.round(v).toLocaleString()}`;
const fmtPct = (a,b) => b>0?((a/b)*100).toFixed(1)+"%" : "—";
const pBar = (pct,h=5) => <div style={{height:h,background:"#1e293b",borderRadius:3,overflow:"hidden"}}><div style={{height:"100%",width:`${Math.min(+pct,100)}%`,background:+pct>=100?"#10b981":+pct>=70?"#f59e0b":"#ef4444",borderRadius:3,transition:"width .4s"}}/></div>;
const toCSV = (rows,cols) => cols.join(",")+"\n"+rows.map(r=>cols.map(c=>`"${r[c]??''}"`).join(",")).join("\n");
const dlCSV = (c,fn) => { const b=new Blob([c],{type:"text/csv;charset=utf-8;"}); const a=document.createElement("a"); a.href=URL.createObjectURL(b); a.download=fn; a.click(); };
const esOp = m => { const u=String(m||"").toUpperCase(); return u.startsWith("VTA")||u.startsWith("TRN")||u.startsWith("MOV")||u.startsWith("LIB"); };

// ── BASE COMPONENTS ───────────────────────────────────────────────────────────
const Input=({label,value,onChange,type="text",options,required})=>(<div style={{display:"flex",flexDirection:"column",gap:4}}><label style={{fontSize:11,color:"#64748b",textTransform:"uppercase",letterSpacing:.8}}>{label}{required&&<span style={{color:"#ef4444"}}> *</span>}</label>{options?<select value={value||""} onChange={e=>onChange(e.target.value)} style={{background:"#0f172a",border:"1px solid #1e293b",borderRadius:7,padding:"8px 10px",color:"#f1f5f9",fontSize:12,outline:"none"}}><option value="">— Seleccionar —</option>{options.map(o=><option key={o} value={o}>{o}</option>)}</select>:<input type={type} value={value||""} onChange={e=>onChange(e.target.value)} style={{background:"#0f172a",border:"1px solid #1e293b",borderRadius:7,padding:"8px 10px",color:"#f1f5f9",fontSize:12,outline:"none"}}/>}</div>);

const Modal=({title,onClose,children,wide})=>(
  <div style={{position:"fixed",inset:0,background:"#000d",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
    <div style={{background:"#0d1829",border:"1px solid #1e293b",borderRadius:14,width:"100%",maxWidth:wide?960:580,maxHeight:"92vh",overflow:"auto"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"16px 20px",borderBottom:"1px solid #1e293b",position:"sticky",top:0,background:"#0d1829",zIndex:1}}>
        <div style={{color:"#f1f5f9",fontWeight:700,fontSize:14}}>{title}</div>
        <button onClick={onClose} style={{background:"none",border:"none",color:"#64748b",fontSize:22,cursor:"pointer"}}>×</button>
      </div>
      <div style={{padding:20}}>{children}</div>
    </div>
  </div>
);

const SyncBanner=({state,onSync,lastSync})=>{const cfg={idle:{bg:"#0a1628",border:"#1e3a5f",col:"#3b82f6",text:USAR_SHEETS?`☁️ Google Sheets${lastSync?" · "+lastSync:""}`:"💾 Local — configura tu URL en index.html"},syncing:{bg:"#0a1f0f",border:"#10b98140",col:"#10b981",text:"🔄 Sincronizando con Sheets..."},ok:{bg:"#0a1f0f",border:"#10b98140",col:"#10b981",text:"✅ Datos actualizados"},error:{bg:"#1f0a0a",border:"#ef444440",col:"#ef4444",text:"⚠️ Error — revisa tu URL de Apps Script"}};const c=cfg[state]||cfg.idle;return <div style={{background:c.bg,border:`1px solid ${c.border}`,borderRadius:9,padding:"8px 14px",display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}><span style={{color:c.col,fontSize:12}}>{c.text}</span>{USAR_SHEETS&&<button onClick={onSync} disabled={state==="syncing"} style={{background:"#1e293b",border:"none",borderRadius:6,padding:"4px 12px",color:"#94a3b8",fontSize:11,cursor:"pointer"}}>🔄 Sincronizar</button>}</div>;};

const LineChart=({data,keys,colors,labelKey,height=90,title})=>{
  if(!data||data.length<2) return null;
  const allVals=data.flatMap(d=>keys.map(k=>d[k]||0));
  const maxV=Math.max(...allVals,1); const W=320,H=height;
  return(<div>{title&&<div style={{color:"#475569",fontSize:10,textTransform:"uppercase",letterSpacing:1,marginBottom:6}}>{title}</div>}
    <svg viewBox={`0 0 ${W} ${H+20}`} style={{width:"100%",height:height+20,overflow:"visible"}}>
      {keys.map((k,ki)=>{const col=colors[ki]||"#6366f1";const pts=data.map((d,i)=>`${(i/(data.length-1))*W},${H-((d[k]||0)/maxV)*(H-15)-5}`).join(" ");return(<g key={k}><polyline fill="none" stroke={col} strokeWidth="2" points={pts} strokeDasharray={ki>0?"4,2":"none"}/>{data.map((d,i)=>d[k]>0&&(<g key={i}><circle cx={(i/(data.length-1))*W} cy={H-((d[k]||0)/maxV)*(H-15)-5} r="3" fill={col}/>{i===data.length-1&&<text x={(i/(data.length-1))*W-2} y={H-((d[k]||0)/maxV)*(H-15)-10} textAnchor="end" fill={col} fontSize="8" fontWeight="700">{fmt$(d[k])}</text>}</g>))}</g>);})}
      {data.map((d,i)=><text key={i} x={(i/(data.length-1))*W} y={H+15} textAnchor="middle" fill="#475569" fontSize="8">{d[labelKey]}</text>)}
    </svg>
    <div style={{display:"flex",gap:10,justifyContent:"center",marginTop:4,flexWrap:"wrap"}}>{keys.map((k,ki)=><div key={k} style={{display:"flex",alignItems:"center",gap:3}}><div style={{width:8,height:2,background:colors[ki],borderRadius:2}}/><span style={{color:"#64748b",fontSize:9}}>{k}</span></div>)}</div>
  </div>);
};

// ── TABLA DETALLE UNIVERSAL ───────────────────────────────────────────────────
const TablaDetalle=({rows,cols})=>(
  <div style={{overflowX:"auto"}}>
    <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
      <thead><tr style={{borderBottom:"2px solid #1e293b"}}>{cols.map(c=><th key={c.k} style={{textAlign:"left",padding:"7px 10px",color:"#475569",fontSize:9,textTransform:"uppercase",whiteSpace:"nowrap"}}>{c.l}</th>)}</tr></thead>
      <tbody>{(rows||[]).map((r,i)=>(
        <tr key={i} style={{borderBottom:"1px solid #0d1626",background:i%2===0?"#080e1c":"transparent"}}>
          {cols.map(c=>(
            <td key={c.k} style={{padding:"8px 10px",maxWidth:c.mw||180,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",color:c.col?c.col(r):"#94a3b8",fontWeight:c.bold?700:400,fontFamily:c.mono?"monospace":"inherit",fontSize:c.fs||12}}>
              {c.render?c.render(r):r[c.k]||"—"}
            </td>
          ))}
        </tr>
      ))}</tbody>
    </table>
  </div>
);

const COLS_UNIDAD = [
  {k:"unidad",l:"Unidad",col:()=>"#f1f5f9",bold:true,mono:true},
  {k:"operador",l:"Operador",mw:150},
  {k:"coordinador",l:"Coord",render:r=><span style={{color:cc(r.coordinador||""),fontWeight:700,fontSize:10}}>{(r.coordinador||"").split(" ")[0]}</span>},
  {k:"motivo",l:"Motivo",render:r=><Badge text={r.motivo||""} small/>},
  {k:"ubicacion",l:"Ubicación",mw:120,col:()=>"#64748b",fs:10},
  {k:"cliente",l:"Cliente",mw:110,col:()=>"#94a3b8"},
  {k:"circuito",l:"Circuito",col:()=>"#a78bfa",bold:true,fs:10},
  {k:"comentarios",l:"Comentarios",mw:160,col:()=>"#64748b",fs:10},
];

// ── INDICADORES DE EQUIPO ─────────────────────────────────────────────────────
const Indicadores=({data})=>{
  const res=data.resumen;
  if(!res) return <div style={{color:"#475569",textAlign:"center",padding:40}}>Toca 🔄 Sincronizar para cargar datos</div>;
  const {indicadores:ind,venta,flota,cajas,otif,entregas}=res;
  if(!ind) return null;

  const KPI=({label,val,sub,col="#3b82f6",icon,size=22,border})=>(
    <div style={{background:"#0a1628",border:`1px solid ${col}${border?"60":"25"}`,borderRadius:11,padding:"14px 16px",position:"relative",overflow:"hidden"}}>
      <div style={{position:"absolute",top:0,left:0,right:0,height:2,background:col}}/>
      <div style={{fontSize:14}}>{icon}</div>
      <div style={{fontSize:size,fontWeight:900,color:col,lineHeight:1.1,marginTop:4}}>{val}</div>
      <div style={{fontSize:10,color:"#64748b",textTransform:"uppercase",letterSpacing:.8,marginTop:2}}>{label}</div>
      {sub&&<div style={{fontSize:10,color:"#334155",marginTop:2}}>{sub}</div>}
    </div>
  );

  const pctVs = parseFloat(ind.pctVsAnt||0);
  const vsCol  = pctVs>=0?"#10b981":"#ef4444";

  return(
    <div style={{display:"flex",flexDirection:"column",gap:18}}>
      <div>
        <div style={{color:"#475569",fontSize:11,textTransform:"uppercase",letterSpacing:2}}>Semana {ind.weekNum} en curso</div>
        <div style={{color:"#f1f5f9",fontSize:20,fontWeight:900,marginTop:2}}>📊 Indicadores Equipo Nacionales</div>
        <div style={{color:"#334155",fontSize:10,marginTop:2}}>Actualizado al: {venta?.latestDate} · Comparativo vs Sem {ind.prevWeekNum}</div>
      </div>

      {/* Venta semana */}
      <div style={{background:"#0a1628",border:"1px solid #10b98130",borderRadius:12,padding:16}}>
        <div style={{fontSize:11,color:"#64748b",textTransform:"uppercase",letterSpacing:.8,marginBottom:10}}>💵 Venta Semana {ind.weekNum} vs Semana {ind.prevWeekNum}</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12,marginBottom:12}}>
          <div style={{background:"#0d1626",borderRadius:9,padding:14,textAlign:"center"}}>
            <div style={{color:"#10b981",fontWeight:900,fontSize:26}}>{fmt$(ind.ventaSemana)}</div>
            <div style={{color:"#64748b",fontSize:10,marginTop:2}}>Semana {ind.weekNum} actual</div>
          </div>
          <div style={{background:"#0d1626",borderRadius:9,padding:14,textAlign:"center"}}>
            <div style={{color:"#475569",fontWeight:900,fontSize:26}}>{fmt$(ind.ventaSemAnt)}</div>
            <div style={{color:"#64748b",fontSize:10,marginTop:2}}>Semana {ind.prevWeekNum} anterior</div>
          </div>
          <div style={{background:vsCol+"15",border:`1px solid ${vsCol}40`,borderRadius:9,padding:14,textAlign:"center"}}>
            <div style={{color:vsCol,fontWeight:900,fontSize:26}}>{pctVs>=0?"+":""}{ind.pctVsAnt}%</div>
            <div style={{color:"#64748b",fontSize:10,marginTop:2}}>{pctVs>=0?"▲ Crecimiento":"▼ Caída"} vs semana ant.</div>
            <div style={{color:"#334155",fontSize:9,marginTop:1}}>Δ {fmt$(ind.ventaSemana-ind.ventaSemAnt)}</div>
          </div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
          {["TELLO","CRISTIAN","JULIO"].map(k=>{
            const col=C[k];
            const s=venta?.semana?.[k]||0, a=venta?.semAnt?.[k]||0;
            const pv=a>0?((s-a)/a*100).toFixed(1):null;
            return(
              <div key={k} style={{background:col+"10",border:`1px solid ${col}30`,borderRadius:8,padding:"10px 12px"}}>
                <div style={{color:col,fontWeight:900,fontSize:16}}>{fmt$(s)}</div>
                <div style={{color:"#475569",fontSize:9}}>{k}</div>
                {pv!==null&&<div style={{color:parseFloat(pv)>=0?"#10b981":"#ef4444",fontSize:9,marginTop:2}}>{parseFloat(pv)>=0?"+":""}{pv}% vs ant.</div>}
              </div>
            );
          })}
        </div>
      </div>

      {/* KPIs en grid */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:10}}>
        <KPI icon="🎯" label={`OTIF Sem ${ind.weekNum} (${ind.totalViajesSem} viajes)`} val={`${ind.pctOTIF}%`} col={parseFloat(ind.pctOTIF)>=85?"#10b981":"#ef4444"} sub={`Meta 85% — ${ind.totalViajesSem} viajes sem.`}/>
        <KPI icon="🔴" label={`Entregas Vencidas / ${ind.totalEntregas} total`} val={`${ind.entregasVencidas} / ${ind.totalEntregas}`} col={ind.entregasVencidas>0?"#ef4444":"#10b981"} sub={`${ind.totalEntregas>0?((ind.entregasVencidas/ind.totalEntregas)*100).toFixed(1):0}% de entregas vencidas`}/>
        <KPI icon="🚛" label="Flota Activa (Operando)" val={`${ind.flotaActiva} / ${ind.flotaTotal}`} col="#10b981" sub={`${ind.flotaDCO} DCO · ${ind.flotaNoUsada} no usadas`}/>
        <KPI icon="📦" label="Cajas en Uso / Total" val={`${ind.cajasEnUso} / ${ind.cajasTotal}`} col="#6366f1" sub={`${ind.cajasLibres} disponibles`}/>
        <KPI icon="🪑" label="Vacantes Actuales" val={ind.vacantesTotal} col="#64748b" sub={`SO: ${flota?.vacantes?.SO||0} · IND: ${flota?.vacantes?.IND||0} · PER: ${flota?.vacantes?.PER||0}`}/>
        <KPI icon="⛽" label="Diesel Semana" val={fmt$(ind.dieselSemana)} col="#f59e0b" sub={`${((ind.dieselLitros||0)/1000).toFixed(1)}K litros registrados`}/>
      </div>

      {/* Nota alertas seguimiento */}
      <div style={{background:"#0a1628",border:"1px solid #3b82f630",borderRadius:10,padding:"12px 16px",fontSize:11,color:"#3b82f6"}}>
        ℹ️ Para el seguimiento de alertas ve a la sección <b>🔔 Alertas</b> donde puedes filtrar por tipo y marcar acciones tomadas.
      </div>
    </div>
  );
};

// ── DASHBOARD ─────────────────────────────────────────────────────────────────
const Dashboard=({data,setTab})=>{
  const res=data.resumen;
  const [modalVenc,setModalVenc]=useState(false);
  if(!res) return <div style={{color:"#475569",textAlign:"center",padding:40,fontSize:13}}>Toca 🔄 <b>Sincronizar</b> para cargar los datos desde Google Sheets</div>;
  const {flota,venta,diesel,otif,cajas,entregas,coordinadores}=res;

  return(
    <div style={{display:"flex",flexDirection:"column",gap:18}}>
      <div>
        <div style={{color:"#475569",fontSize:11,letterSpacing:2,textTransform:"uppercase"}}>Torre de Control · Sem {res.weekNum} · {flota?.fecha}</div>
        <div style={{color:"#f1f5f9",fontSize:20,fontWeight:900,marginTop:2}}>Nacional Autotransporte</div>
        <div style={{color:"#334155",fontSize:10,marginTop:2}}>Datos al: {flota?.fecha} · {flota?.total||0} unidades · Sem {res.weekNum}</div>
      </div>

      {/* Entregas vencidas — con total y botón ver más */}
      {entregas?.totalVencidas>0&&(
        <div style={{background:"#1f0a0a",border:"1px solid #ef444450",borderLeft:"4px solid #ef4444",borderRadius:9,padding:"12px 14px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
            <div style={{color:"#ef4444",fontWeight:700,fontSize:13}}>
              🔴 {entregas.totalVencidas} entregas VENCIDAS de {entregas.totalViajes} total · {entregas.pctCumplimiento}% OTIF cumplimiento
            </div>
            <button onClick={()=>setModalVenc(true)} style={{background:"#ef444420",border:"1px solid #ef444460",borderRadius:6,padding:"4px 10px",color:"#ef4444",fontSize:10,cursor:"pointer",fontWeight:700,whiteSpace:"nowrap"}}>Ver {entregas.totalVencidas} ↗</button>
          </div>
          <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
            {(entregas.vencidas||[]).slice(0,3).map((v,i)=>(
              <div key={i} style={{background:"#2d0a0a",borderRadius:7,padding:"6px 10px",fontSize:10}}>
                <span style={{color:"#f1f5f9",fontWeight:700}}>🚛 {v.unidad}</span>
                <span style={{color:"#ef4444",marginLeft:6}}>{v.cliente}</span>
                <span style={{color:"#a78bfa",marginLeft:6,fontWeight:700,fontSize:9}}>{v.circuito||"Sin circuito"}</span>
                <span style={{color:cc(v.coordinador),marginLeft:6,fontSize:9}}>{(v.coordinador||"").split(" ")[0]}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {modalVenc&&<Modal title={`🔴 ${entregas?.totalVencidas} Entregas Vencidas — ${entregas?.pctCumplimiento}% OTIF`} onClose={()=>setModalVenc(false)} wide>
        <TablaDetalle rows={entregas?.vencidas||[]} cols={[
          {k:"unidad",l:"Unidad",col:()=>"#f1f5f9",bold:true,mono:true},
          {k:"caja",l:"Caja",col:()=>"#94a3b8"},
          {k:"cliente",l:"Cliente",mw:110,col:()=>"#94a3b8"},
          {k:"coordinador",l:"Coord",render:r=><span style={{color:cc(r.coordinador||""),fontWeight:700}}>{(r.coordinador||"").split(" ")[0]}</span>},
          {k:"circuito",l:"Circuito",col:()=>"#a78bfa",bold:true},
          {k:"cita",l:"Cita Desc.",col:()=>"#ef4444",bold:true},
          {k:"estatus",l:"Estatus",render:r=><Badge text={r.estatus||""} small/>},
          {k:"comentarios",l:"Comentarios",mw:150,col:()=>"#64748b",fs:10},
        ]}/>
      </Modal>}

      {/* Flota + Cajas */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        <div style={{background:"#0a1628",border:"1px solid #3b82f630",borderRadius:11,padding:14}}>
          <div style={{fontSize:11,color:"#64748b",textTransform:"uppercase",letterSpacing:.8,marginBottom:8}}>🚛 Flota · {flota?.fecha}</div>
          <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:8}}>
            <div style={{flex:1}}><div style={{height:8,background:"#1e293b",borderRadius:4,overflow:"hidden"}}><div style={{height:"100%",width:`${flota?.pctUtilizacion||0}%`,background:"#10b981",borderRadius:4}}/></div></div>
            <span style={{color:"#10b981",fontWeight:900,fontSize:20}}>{flota?.pctUtilizacion||0}%</span>
          </div>
          <div style={{color:"#475569",fontSize:10,marginBottom:8}}>{flota?.enOperacion||0} operando / {flota?.total||0} total · {flota?.resumen?.DCO||0} DCO</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:4}}>
            {[["VTA",flota?.resumen?.VTA||0,"#10b981"],["TRN",flota?.resumen?.TRN||0,"#3b82f6"],["MOV",flota?.resumen?.MOV||0,"#10b981"],["LIB",flota?.resumen?.LIB||0,"#a855f7"],["DCO",flota?.resumen?.DCO||0,"#3b82f6"],["DSO",flota?.resumen?.DSO||0,"#64748b"],["CP",flota?.enCP?.CP||0,"#f59e0b"],["RM",flota?.resumen?.RM||0,"#ef4444"],["SG",flota?.resumen?.SG||0,"#ef4444"],["SO",flota?.resumen?.SO||0,"#64748b"],["IND",flota?.resumen?.IND||0,"#ef4444"],["PER",flota?.resumen?.PER||0,"#a855f7"]].map(([l,v,col])=>(
              <div key={l} style={{background:col+"15",borderRadius:5,padding:"4px",textAlign:"center"}}>
                <div style={{color:col,fontWeight:900,fontSize:14}}>{v}</div>
                <div style={{color:"#475569",fontSize:8}}>{l}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{background:"#0a1628",border:"1px solid #10b98130",borderRadius:11,padding:14}}>
          <div style={{fontSize:11,color:"#64748b",textTransform:"uppercase",letterSpacing:.8,marginBottom:8}}>📦 Cajas · {cajas?.total||0} total</div>
          <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:8}}>
            <div style={{flex:1}}><div style={{height:8,background:"#1e293b",borderRadius:4,overflow:"hidden"}}><div style={{height:"100%",width:`${cajas?.pctCargadas||0}%`,background:"#10b981",borderRadius:4}}/></div></div>
            <span style={{color:"#10b981",fontWeight:900,fontSize:20}}>{cajas?.pctCargadas||0}%</span>
          </div>
          <div style={{color:"#475569",fontSize:10,marginBottom:8}}>{cajas?.resumen?.Cargada||0} cargadas / {cajas?.total||0}</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:4}}>
            {[["Cargadas",cajas?.resumen?.Cargada||0,"#10b981"],["Disponibles",cajas?.resumen?.Disponible||0,"#3b82f6"],["Tránsito",cajas?.resumen?.Transito||0,"#6366f1"],["Dañadas",cajas?.resumen?.Dañada||0,"#ef4444"],["No loc.",cajas?.resumen?.NoLocalizada||0,"#f97316"],["Vacías",cajas?.resumen?.Vacia||0,"#64748b"],["Siniestro",cajas?.resumen?.Siniestro||0,"#ef4444"],["Venta",cajas?.resumen?.Venta||0,"#64748b"],["TOTAL",cajas?.total||0,"#f1f5f9"]].map(([l,v,col])=>(
              <div key={l} style={{background:col+"15",borderRadius:5,padding:"4px",textAlign:"center"}}>
                <div style={{color:col,fontWeight:900,fontSize:14}}>{v}</div>
                <div style={{color:"#475569",fontSize:8}}>{l}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Vacantes */}
      <div style={{background:"#0a1628",border:"1px solid #64748b40",borderRadius:11,padding:14}}>
        <div style={{fontSize:11,color:"#64748b",textTransform:"uppercase",letterSpacing:.8,marginBottom:10}}>🪑 Vacantes — {flota?.vacantes?.total||0} totales</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,textAlign:"center",marginBottom:8}}>
          {[["SO — Sin Operador",flota?.vacantes?.SO||0,"#64748b"],["IND — Indisciplina",flota?.vacantes?.IND||0,"#ef4444"],["PER — Permiso",flota?.vacantes?.PER||0,"#a855f7"]].map(([l,v,col])=>(
            <div key={l} style={{background:col+"15",border:`1px solid ${col}33`,borderRadius:8,padding:"10px 6px"}}>
              <div style={{color:col,fontWeight:900,fontSize:24}}>{v}</div>
              <div style={{color:"#64748b",fontSize:9,textTransform:"uppercase"}}>{l}</div>
            </div>
          ))}
        </div>
        <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
          {(flota?.vacantes?.detalle||[]).map((u,i)=>(
            <span key={i} style={{background:"#64748b15",border:"1px solid #64748b33",borderRadius:5,padding:"2px 7px",fontSize:9,color:"#94a3b8",fontFamily:"monospace"}}>
              {u.unidad} <span style={{color:"#475569",fontFamily:"sans-serif"}}>{u.motivo}</span>
            </span>
          ))}
        </div>
      </div>

      {/* Venta — desde Estatus_diario */}
      <div style={{background:"#0a1628",border:"1px solid #10b98130",borderRadius:11,padding:14}}>
        <div style={{fontSize:11,color:"#64748b",textTransform:"uppercase",letterSpacing:.8,marginBottom:10}}>💵 Venta ({venta?.latestDate}) — desde Estatus Diario · Sem {res.weekNum}</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,textAlign:"center",marginBottom:12}}>
          {[["TELLO","Tello",C.TELLO],["CRISTIAN","Cristian",C.CRISTIAN],["JULIO","Julio",C.JULIO],["TOTAL","TOTAL","#f1f5f9"]].map(([k,l,col])=>(
            <div key={k} style={{background:col+"10",borderRadius:8,padding:"10px 6px"}}>
              <div style={{color:col,fontWeight:900,fontSize:l==="TOTAL"?18:14}}>{fmt$(venta?.hoy?.[k]||0)}</div>
              <div style={{color:"#475569",fontSize:9,marginTop:2}}>📅 Hoy · {l}</div>
              <div style={{color:"#334155",fontSize:8,marginTop:1}}>Sem: {fmt$(venta?.semana?.[k]||0)}</div>
            </div>
          ))}
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:10}}>
          {[["TELLO","Tello",C.TELLO],["CRISTIAN","Cristian",C.CRISTIAN],["JULIO","Julio",C.JULIO]].map(([k,l,col])=>(
            <div key={k}><div style={{display:"flex",justifyContent:"space-between",fontSize:9,color:"#64748b",marginBottom:2}}><span>{l}</span><span style={{color:col,fontWeight:700}}>{venta?.cumpl?.[k]||0}%</span></div>{pBar(venta?.cumpl?.[k]||0)}<div style={{color:"#334155",fontSize:8,marginTop:1}}>Meta: {fmt$((res?.meta||{})[k]||0)}</div></div>
          ))}
        </div>
        <LineChart data={venta?.diasSemana||[]} keys={["TELLO","CRISTIAN","JULIO"]} colors={[C.TELLO,C.CRISTIAN,C.JULIO]} labelKey="dia" height={85} title="Tendencia diaria por coordinador"/>
      </div>

      {/* OTIF */}
      <div style={{background:"#0a1628",border:"1px solid #6366f130",borderRadius:11,padding:14}}>
        <div style={{fontSize:11,color:"#64748b",textTransform:"uppercase",letterSpacing:.8,marginBottom:10}}>🎯 OTIF · Sem {res.weekNum} — {otif?.totalSem||0} viajes</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,textAlign:"center"}}>
          {[[`${otif?.pctSem||0}%`,"OTIF Sem",+(otif?.pctSem||0)>=85?"#10b981":"#ef4444","Meta 85%"],[otif?.onTimeSem||0,"A Tiempo Sem","#10b981",`de ${otif?.totalSem||0}`],[otif?.late||0,"Tardías Total","#ef4444","histórico"],[otif?.sinFecha||0,"Sin Fecha","#64748b","sin cita"]].map(([v,l,col,sub])=>(
            <div key={l} style={{background:col+"10",borderRadius:8,padding:"10px 6px",textAlign:"center"}}>
              <div style={{color:col,fontWeight:900,fontSize:l.includes("OTIF")?20:16}}>{v}</div>
              <div style={{color:"#64748b",fontSize:9,marginTop:2}}>{l}</div>
              <div style={{color:"#334155",fontSize:8}}>{sub}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Diesel */}
      <div style={{background:"#0a1628",border:"1px solid #f59e0b30",borderRadius:11,padding:14}}>
        <div style={{fontSize:11,color:"#64748b",textTransform:"uppercase",letterSpacing:.8,marginBottom:8}}>⛽ Diesel Sem {res.weekNum}</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,textAlign:"center"}}>
          {[["Costo",fmt$(diesel?.total||0),"#f59e0b"],["Litros",(diesel?.litros||0)>0?`${((diesel?.litros||0)/1000).toFixed(1)}K L`:"—","#6366f1"],["Registros",`${diesel?.registros||0}`,"#64748b"]].map(([l,v,col])=>(
            <div key={l} style={{background:col+"10",borderRadius:8,padding:"10px 6px"}}><div style={{color:col,fontWeight:900,fontSize:14}}>{v}</div><div style={{color:"#475569",fontSize:9,marginTop:2}}>{l}</div></div>
          ))}
        </div>
      </div>

      {/* KPIs coordinadores — SO corregido desde Estatus_diario */}
      <div style={{color:"#475569",fontSize:11,textTransform:"uppercase",letterSpacing:1}}>👥 KPIs por Coordinador</div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:12}}>
        {["TELLO","CRISTIAN","JULIO"].map(k=>{
          const c=coordinadores?.[k]; if(!c) return null;
          const col=C[k];
          return(
            <div key={k} style={{background:"#0a1628",border:`1px solid ${col}30`,borderRadius:12,padding:14}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                <div style={{width:10,height:10,borderRadius:"50%",background:col,boxShadow:`0 0 8px ${col}`}}/>
                <div style={{color:"#f1f5f9",fontWeight:800,fontSize:13}}>{c.nombre}</div>
                <div style={{marginLeft:"auto",background:col+"20",color:col,borderRadius:6,padding:"2px 8px",fontSize:11,fontWeight:700}}>{c.eficiencia}%</div>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:10,marginBottom:2}}>
                <span style={{color:"#64748b"}}>Venta HOY</span><span style={{color:col,fontWeight:700}}>{fmt$(c.ventaHoy)}</span>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:10,marginBottom:4}}>
                <span style={{color:"#64748b"}}>Venta Semana</span><span style={{color:col,fontWeight:700}}>{fmt$(c.ventaSemana)}</span>
              </div>
              {pBar(c.cumplMeta)}
              <div style={{color:"#334155",fontSize:8,marginTop:2,marginBottom:8,textAlign:"right"}}>{c.cumplMeta}% de meta · Meta: {fmt$(c.metaSemana)}</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:4,marginBottom:6}}>
                {[["Activas",c.activas,"#10b981"],["DCO",c.dco,"#3b82f6"],["DSO",c.dso,"#64748b"],["LIB",c.lib,"#a855f7"],["SO/Vac",c.vacantes,"#64748b"],["MTTO",c.mtto,"#f59e0b"]].map(([l,v,col2])=>(
                  <div key={l} style={{background:col2+"15",borderRadius:5,padding:"4px",textAlign:"center"}}>
                    <div style={{color:col2,fontWeight:900,fontSize:13}}>{v}</div>
                    <div style={{color:"#475569",fontSize:8}}>{l}</div>
                  </div>
                ))}
              </div>
              {c.circuitos?.length>0&&<div style={{fontSize:9,color:"#334155"}}>Circuitos: <span style={{color:col}}>{c.circuitos.join(" · ")}</span></div>}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ── ALERTAS — iconos filtro + detalle por tipo ────────────────────────────────
const Alertas=({data})=>{
  const res=data.resumen;
  const [filtro,setFiltro]=useState(null);
  const [seguidos,setSeguidos]=useState({});
  const toggle=(i)=>setSeguidos(p=>({...p,[i]:!p[i]}));

  const alertas=[];
  (res?.entregas?.vencidas||[]).forEach((v,i)=>alertas.push({tipo:"Entrega Vencida",icon:"📦",col:"#ef4444",unidad:v.unidad,caja:v.caja,op:v.cliente,coord:(v.coordinador||"").split(" ")[0],desc:`Cita: ${v.cita} — Circuito: ${v.circuito||"Sin circuito"}`,accion:"Contactar cliente y coordinar nueva cita de descarga",fecha:v.cita||""}));
  (res?.flota?.grupos?.CP||[]).forEach(e=>alertas.push({tipo:"CP — Correctivo",icon:"🔧",col:"#f59e0b",unidad:e.unidad,op:e.operador,coord:(e.coordinador||"").split(" ")[0],desc:e.comentarios||"En taller correctivo",accion:"Verificar fecha estimada de salida con taller",fecha:res?.flota?.fecha||""}));
  (res?.flota?.grupos?.RM||[]).forEach(e=>alertas.push({tipo:"RM — Rep. Mayor",icon:"🔩",col:"#ef4444",unidad:e.unidad,op:e.operador,coord:(e.coordinador||"").split(" ")[0],desc:e.comentarios||"Reparación mayor en proceso",accion:"Solicitar estimado de costo y tiempo al taller",fecha:res?.flota?.fecha||""}));
  (res?.flota?.grupos?.SG||[]).forEach(e=>alertas.push({tipo:"SG — Siniestro",icon:"💥",col:"#ef4444",unidad:e.unidad,op:e.operador,coord:(e.coordinador||"").split(" ")[0],desc:e.comentarios||"Siniestro/Garantía",accion:"Escalar con aseguradora y documentar avance",fecha:res?.flota?.fecha||""}));
  (res?.alertasMtto||[]).forEach(a=>alertas.push({tipo:`⏱ MTTO Excedido`,icon:"⚠️",col:"#ef4444",unidad:a.unidad,op:a.operador,coord:(a.coordinador||"").split(" ")[0],desc:`${a.tipo} · ${a.diasEnMtto}d de ${a.limiteEsperado}d límite · ${a.comentarios}`,accion:a.accion,fecha:res?.flota?.fecha||""}));
  (res?.flota?.grupos?.SO||[]).slice(0,8).forEach(e=>alertas.push({tipo:"Sin Operador",icon:"👤",col:"#64748b",unidad:e.unidad,op:"VACANTE",coord:(e.coordinador||"").split(" ")[0],desc:e.comentarios||"Sin operador asignado",accion:"Asignar operador de la bolsa disponible",fecha:res?.flota?.fecha||""}));
  (res?.flota?.grupos?.IND||[]).forEach(e=>alertas.push({tipo:"IND — Indisciplina",icon:"⚠️",col:"#ef4444",unidad:e.unidad,op:e.operador,coord:(e.coordinador||"").split(" ")[0],desc:e.comentarios||"Sanción activa",accion:"Revisar con RRHH y aplicar proceso disciplinario",fecha:res?.flota?.fecha||""}));
  (data.cajasList||[]).filter(c=>c.Estatus==="Dañada").forEach(c=>alertas.push({tipo:"Caja Dañada",icon:"📦",col:"#f97316",unidad:"—",caja:c.Caja,op:"—",coord:(c.Coordinador||"").split(" ")[0],desc:`${c["Ciudad / Ubicación"]} · ${c.Comentarios||""}`,accion:"Programar reparación o baja del inventario",fecha:""}));
  (data.cajasList||[]).filter(c=>c.Estatus==="No localizada").forEach(c=>alertas.push({tipo:"Caja No Localizada",icon:"🔍",col:"#ef4444",unidad:"—",caja:c.Caja,op:"—",coord:(c.Coordinador||"").split(" ")[0],desc:c.Comentarios||"No localizada",accion:"Investigar última ubicación — contactar operador",fecha:""}));

  // Tipos únicos para íconos de filtro
  const tipos=[...new Set(alertas.map(a=>a.tipo))];
  const porTipo={};
  tipos.forEach(t=>{ porTipo[t]=alertas.filter(a=>a.tipo===t); });

  const lista=filtro?alertas.filter(a=>a.tipo===filtro):alertas;
  const seguidos_n=Object.values(seguidos).filter(Boolean).length;

  return(
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      {/* Resumen seguimiento */}
      <div style={{background:"#0a1628",border:"1px solid #3b82f630",borderRadius:10,padding:"10px 14px",display:"flex",gap:16,flexWrap:"wrap",alignItems:"center"}}>
        <div><span style={{color:"#f1f5f9",fontWeight:700,fontSize:16}}>{alertas.length}</span><span style={{color:"#64748b",fontSize:11,marginLeft:4}}>Alertas totales</span></div>
        <div><span style={{color:"#10b981",fontWeight:700,fontSize:16}}>{seguidos_n}</span><span style={{color:"#64748b",fontSize:11,marginLeft:4}}>Con seguimiento</span></div>
        <div><span style={{color:alertas.length>0?(seguidos_n/alertas.length*100).toFixed(0)+">"?"#10b981":"#f59e0b":"#10b981",fontWeight:700,fontSize:16}}>{alertas.length>0?((seguidos_n/alertas.length)*100).toFixed(0):100}%</span><span style={{color:"#64748b",fontSize:11,marginLeft:4}}>seguimiento</span></div>
        {filtro&&<button onClick={()=>setFiltro(null)} style={{marginLeft:"auto",background:"#1e293b",border:"none",borderRadius:6,padding:"4px 10px",color:"#94a3b8",fontSize:11,cursor:"pointer"}}>✕ Limpiar filtro</button>}
      </div>

      {/* ICONOS FILTRO por tipo */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(120px,1fr))",gap:8}}>
        {tipos.map(t=>{
          const grp=porTipo[t];
          const col=grp[0]?.col||"#64748b";
          const ic=grp[0]?.icon||"🔔";
          const sel=filtro===t;
          return(
            <div key={t} onClick={()=>setFiltro(sel?null:t)} style={{background:sel?col+"30":col+"15",border:`2px solid ${sel?col:col+"40"}`,borderRadius:10,padding:"10px 8px",cursor:"pointer",textAlign:"center",transition:"all .15s"}}>
              <div style={{fontSize:22}}>{ic}</div>
              <div style={{color:col,fontWeight:900,fontSize:20,lineHeight:1}}>{grp.length}</div>
              <div style={{color:sel?"#f1f5f9":"#64748b",fontSize:8,textTransform:"uppercase",letterSpacing:.5,marginTop:2,lineHeight:1.2}}>{t.replace("—","·")}</div>
            </div>
          );
        })}
      </div>

      {/* Lista de alertas */}
      <div style={{color:"#475569",fontSize:11}}>{lista.length} alertas {filtro?`· Filtro: ${filtro}`:""}</div>
      {lista.length===0&&<div style={{color:"#334155",textAlign:"center",padding:24,fontSize:13}}>✅ Sin alertas en esta categoría</div>}
      {lista.map((a,i)=>{
        const idx=alertas.indexOf(a);
        const col=a.col;
        const visto=seguidos[idx];
        return(
          <div key={i} style={{background:"#0a1628",border:`1px solid ${col}25`,borderLeft:`3px solid ${visto?"#10b981":col}`,borderRadius:8,padding:"12px 14px",opacity:visto?0.65:1}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
              <div style={{flex:1}}>
                <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:4,flexWrap:"wrap"}}>
                  <Badge text={a.tipo}/>
                  {a.fecha&&<span style={{color:"#334155",fontSize:10}}>{a.fecha}</span>}
                  {visto&&<span style={{color:"#10b981",fontSize:9,fontWeight:700}}>✅ Con seguimiento</span>}
                </div>
                <div style={{color:"#cbd5e1",fontSize:12,fontWeight:700,marginBottom:2}}>{a.op}</div>
                <div style={{color:"#475569",fontSize:11,marginBottom:4}}>{a.unidad&&a.unidad!=="—"&&<span>🚛 {a.unidad} </span>}{a.caja&&<span>📦 {a.caja} </span>}— {a.desc}</div>
                <div style={{background:"#0d1626",borderRadius:6,padding:"5px 10px",fontSize:10,color:"#3b82f6"}}>💡 <b>Acción sugerida:</b> {a.accion}</div>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:6,marginLeft:12,alignItems:"flex-end"}}>
                <span style={{color:cc(a.coord||""),fontSize:10,fontWeight:700}}>{a.coord}</span>
                <button onClick={()=>toggle(idx)} style={{background:visto?"#10b98120":"#1e293b",border:`1px solid ${visto?"#10b981":"#334155"}`,borderRadius:6,padding:"3px 8px",color:visto?"#10b981":"#64748b",fontSize:9,cursor:"pointer",fontWeight:700,whiteSpace:"nowrap"}}>
                  {visto?"✅ Atendida":"Marcar seguimiento"}
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ── COORDINADORES — click en números + cajas detalle ─────────────────────────
const Coordinadores=({data})=>{
  const res=data.resumen;
  const [selCoord,setSelCoord]=useState("TELLO");
  const [modal,setModal]=useState(null);
  const [modalCajas,setModalCajas]=useState(false);
  if(!res) return <div style={{color:"#475569",textAlign:"center",padding:40}}>Sincroniza para cargar datos</div>;
  const coords=res.coordinadores||{};
  const c=coords[selCoord]; if(!c) return null;
  const col=C[selCoord];

  const NumClick=({label,count,detalle,color:c2,icon})=>(
    <div style={{background:(c2||col)+"15",borderRadius:8,padding:"8px 6px",textAlign:"center",cursor:detalle&&count>0?"pointer":"default",border:detalle&&count>0?`1px solid ${c2||col}40`:"1px solid transparent"}}
         onClick={()=>detalle&&count>0&&setModal({title:`${icon} ${label} — ${c.nombre}`,rows:detalle,cols:COLS_UNIDAD})}>
      <div style={{color:c2||col,fontWeight:900,fontSize:22}}>{count}</div>
      <div style={{color:"#475569",fontSize:9,textTransform:"uppercase"}}>{label}</div>
      {detalle&&count>0&&<div style={{color:"#334155",fontSize:7,marginTop:1}}>↗ ver detalle</div>}
    </div>
  );

  return(
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      {modal&&<Modal title={modal.title} onClose={()=>setModal(null)} wide><TablaDetalle rows={modal.rows} cols={modal.cols}/></Modal>}
      {modalCajas&&<Modal title={`📦 Cajas de ${c.nombre} (${c.totalCajas})`} onClose={()=>setModalCajas(false)} wide>
        <TablaDetalle rows={c.cajasDetalle||[]} cols={[
          {k:"caja",l:"Caja",col:()=>"#f1f5f9",bold:true,mono:true},
          {k:"estatus",l:"Estatus",render:r=><Badge text={r.estatus||""} small/>},
          {k:"cliente",l:"Cliente",mw:110,col:()=>"#94a3b8"},
          {k:"ciudad",l:"Ciudad",mw:110,col:()=>"#64748b"},
          {k:"comentarios",l:"Comentarios",mw:160,col:()=>"#64748b",fs:10},
        ]}/>
      </Modal>}
      {/* Tabs */}
      <div style={{display:"flex",gap:8}}>
        {["TELLO","CRISTIAN","JULIO"].map(k=>(
          <button key={k} onClick={()=>setSelCoord(k)} style={{flex:1,padding:"10px",borderRadius:8,border:`1px solid ${selCoord===k?C[k]:"#1e293b"}`,background:selCoord===k?C[k]+"20":"#0a1628",color:selCoord===k?C[k]:"#475569",fontSize:12,cursor:"pointer",fontWeight:700}}>
            {(coords[k]?.nombre||"").split(" ")[0]} {(coords[k]?.nombre||"").split(" ").slice(-1)}
          </button>
        ))}
      </div>
      <div style={{background:"#0a1628",border:`1px solid ${col}30`,borderRadius:12,padding:16}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
          <div style={{width:12,height:12,borderRadius:"50%",background:col,boxShadow:`0 0 8px ${col}`}}/>
          <div style={{color:"#f1f5f9",fontWeight:800,fontSize:16}}>{c.nombre}</div>
          <div style={{marginLeft:"auto",background:col+"20",color:col,borderRadius:6,padding:"3px 10px",fontSize:13,fontWeight:700}}>{c.eficiencia}% ef.</div>
        </div>
        {/* Venta desde Estatus_diario */}
        <div style={{marginBottom:12}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><span style={{color:"#64748b",fontSize:11}}>📅 Venta HOY</span><span style={{color:col,fontWeight:700,fontSize:13}}>{fmt$(c.ventaHoy)}</span></div>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><span style={{color:"#64748b",fontSize:11}}>📆 Venta Semana</span><span style={{color:col,fontWeight:700,fontSize:13}}>{fmt$(c.ventaSemana)}</span></div>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}><span style={{color:"#64748b",fontSize:11}}>Meta semana</span><span style={{color:"#334155",fontSize:11}}>{fmt$(c.metaSemana)}</span></div>
          {pBar(c.cumplMeta,8)}<div style={{color:"#475569",fontSize:10,marginTop:3}}>{c.cumplMeta}% de meta</div>
        </div>
        {/* Unidades clickeables */}
        <div style={{color:"#475569",fontSize:10,textTransform:"uppercase",letterSpacing:.8,marginBottom:6}}>🚛 {c.totalUnidades} Unidades <span style={{color:"#334155",fontSize:8"}}>(clic = detalle)</span></div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:6,marginBottom:12}}>
          <NumClick label="Activas"   count={c.activas}  detalle={c.activasDetalle} color="#10b981" icon="✅"/>
          <NumClick label="DCO"       count={c.dco}       detalle={c.dcoDetalle?.filter(u=>String(u.motivo||"").toUpperCase().startsWith("DCO"))} color="#3b82f6" icon="🔵"/>
          <NumClick label="DSO"       count={c.dso}       detalle={c.dcoDetalle?.filter(u=>String(u.motivo||"").toUpperCase().startsWith("DSO"))} color="#64748b" icon="📌"/>
          <NumClick label="LIB"       count={c.lib}       detalle={[]} color="#a855f7" icon="🔓"/>
          <NumClick label="Vacantes"  count={c.vacantes}  detalle={c.unidadesVacantes?.map(u=>({...u,ubicacion:"—",cliente:"—",circuito:"—",operador:"VACANTE"}))} color="#64748b" icon="🪑"/>
          <NumClick label="MTTO"      count={c.mtto}      detalle={c.mttoDetalle} color="#f59e0b" icon="🔧"/>
        </div>
        {/* Vacantes detalle */}
        {(c.unidadesVacantes||[]).length>0&&(
          <div style={{background:"#64748b15",borderRadius:8,padding:"8px 10px",marginBottom:10}}>
            <div style={{color:"#94a3b8",fontSize:10,fontWeight:700,marginBottom:4}}>⚠️ Vacantes ({c.unidadesVacantes.length})</div>
            {c.unidadesVacantes.map(u=><div key={u.unidad} style={{display:"flex",gap:8,fontSize:10,marginBottom:2}}><span style={{color:"#f1f5f9",fontFamily:"monospace",fontWeight:700}}>{u.unidad}</span><Badge text={u.motivo||""} small/><span style={{color:"#64748b"}}>{u.comentarios}</span></div>)}
          </div>
        )}
        {/* Cajas clickeables */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
          <div style={{color:"#475569",fontSize:10,textTransform:"uppercase",letterSpacing:.8}}>📦 {c.totalCajas} Cajas</div>
          <button onClick={()=>setModalCajas(true)} style={{background:col+"20",border:`1px solid ${col}40`,borderRadius:6,padding:"3px 8px",color:col,fontSize:9,cursor:"pointer",fontWeight:700}}>Ver todas ↗</button>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:6,marginBottom:10}}>
          {[["Cargadas",c.cajasCargadas,"#10b981"],["Disponibles",c.cajasDisponibles,"#3b82f6"],["Dañadas",c.cajasDañadas,"#ef4444"],["No loc.",c.cajasNoLocaliz,"#f97316"],["Vacías",c.cajasVacia||0,"#64748b"]].map(([l,v,col2])=>(
            <div key={l} style={{background:col2+"15",borderRadius:7,padding:"6px",textAlign:"center"}}><div style={{color:col2,fontWeight:900,fontSize:16}}>{v}</div><div style={{color:"#475569",fontSize:8}}>{l}</div></div>
          ))}
        </div>
        {c.circuitos?.length>0&&<div style={{marginBottom:8}}><div style={{color:"#475569",fontSize:10,marginBottom:4}}>Circuitos: <span style={{color:col,fontWeight:700}}>{c.circuitos.join(" · ")}</span></div></div>}
        {c.clientes?.length>0&&(<div><div style={{color:"#475569",fontSize:10,textTransform:"uppercase",letterSpacing:.8,marginBottom:6}}>Clientes activos</div><div style={{display:"flex",flexWrap:"wrap",gap:6}}>{c.clientes.map((cl,i)=><div key={i} style={{background:col+"10",border:`1px solid ${col}25`,borderRadius:7,padding:"5px 10px",fontSize:10}}><span style={{color:col,fontWeight:700}}>{cl.nombre}</span><span style={{color:"#475569",marginLeft:5}}>{cl.ciudad}</span></div>)}</div></div>)}
      </div>
    </div>
  );
};

// ── TRACKER — circuito dinámico, todas las operando ───────────────────────────
const CIRC_VISUAL = {
  "Reynosa - Bajio":{ paradas:["Reynosa","Mty","Saltillo","SLP","Ags","Qro","Bajío"], siguiente:"Regreso Reynosa o Adient", color:"#3b82f6" },
  "Remolacha":      { paradas:["Reynosa","Pharr TX","McAllen TX","Harlingen TX"],      siguiente:"Reynosa o Carrier MTY",      color:"#10b981" },
  "DX":             { paradas:["Nuevo Laredo","Laredo TX","Dallas TX"],                siguiente:"Regreso NLD o Mty-Bajio",    color:"#f59e0b" },
  "Adient":         { paradas:["Reynosa","Saltillo","Arteaga","Ramos"],                siguiente:"Remolacha o Reynosa-Bajio",  color:"#a855f7" },
  "Mty-Bajio":      { paradas:["Monterrey","Saltillo","SLP","Bajío"],                  siguiente:"DX o Remolacha",            color:"#6366f1" },
  "Nld-Bajio":      { paradas:["Nuevo Laredo","Mty","Saltillo","Bajío"],               siguiente:"DX o Reynosa-Bajio",        color:"#ef4444" },
  "Carrier":        { paradas:["Monterrey","Nuevo León"],                              siguiente:"Mty-Bajio o Remolacha",     color:"#f97316" },
};

const Tracker=({data})=>{
  const res=data.resumen;
  const [q,setQ]=useState(""); const [entregados,setEntregados]=useState({});
  if(!res) return <div style={{color:"#475569",textAlign:"center",padding:40}}>Sincroniza para cargar datos</div>;
  const grupos=res.flota?.grupos||{};
  const enRuta=[...(grupos.VTA||[]),...(grupos.TRN||[]),...(grupos.MOV||[]),...(grupos.LIB||[])];
  const lista=enRuta.filter(e=>{const tx=q.toLowerCase();return !q||(e.unidad+e.operador+e.circuito+e.ruta+e.coordinador).toLowerCase().includes(tx);});
  return(
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
        <div style={{color:"#475569",fontSize:11,textTransform:"uppercase",letterSpacing:1.5}}>🛣️ Tracker — {enRuta.length} Operando · {res.flota?.fecha}</div>
        <input placeholder="🔍 Filtrar..." value={q} onChange={e=>setQ(e.target.value)} style={{background:"#0a1628",border:"1px solid #1e293b",borderRadius:8,padding:"7px 12px",color:"#f1f5f9",fontSize:12,outline:"none",minWidth:160}}/>
      </div>
      {lista.length===0&&<div style={{color:"#334155",fontSize:13,textAlign:"center",padding:24}}>Sin resultados</div>}
      {lista.map((e,idx)=>{
        const cfg=CIRC_VISUAL[e.circuito]||CIRC_VISUAL[e.ruta]||{paradas:["Origen","Ruta","Destino"],siguiente:"Ver hoja Circuitos",color:"#6366f1"};
        const viajeInfo=(data.viajesList||[]).find(v=>String(v.Unidad)===e.unidad);
        const ent=entregados[e.unidad]||false;
        return(
          <div key={e.unidad+idx} style={{background:"#0a1628",border:`1px solid ${ent?"#10b981":cfg.color}30`,borderRadius:12,padding:14}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
              <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                <span style={{color:"#f1f5f9",fontWeight:900,fontFamily:"monospace",fontSize:15}}>{e.unidad}</span>
                <span style={{color:"#64748b",fontSize:10}}>{(e.operador||"").split(" ").slice(0,2).join(" ")}</span>
                <Badge text={e.motivo} small/>
                {e.circuito&&e.circuito!=="Sin circuito"&&<span style={{background:cfg.color+"20",color:cfg.color,borderRadius:5,padding:"1px 6px",fontSize:9,fontWeight:700}}>{e.circuito}</span>}
                {e.monto>0&&<span style={{color:"#10b981",fontSize:10,fontWeight:700}}>{fmt$(e.monto)}</span>}
              </div>
              <div style={{display:"flex",gap:6,alignItems:"center"}}>
                <button onClick={()=>setEntregados(p=>({...p,[e.unidad]:!p[e.unidad]}))} style={{background:ent?"#10b981":"#1e293b",border:`1px solid ${ent?"#10b981":"#334155"}`,borderRadius:6,padding:"3px 8px",color:ent?"#fff":"#94a3b8",fontSize:9,cursor:"pointer",fontWeight:700}}>{ent?"✅ Entregado":"⬜ Entregar"}</button>
                <span style={{color:cc(e.coordinador),fontSize:10,fontWeight:700}}>{(e.coordinador||"").split(" ")[0]}</span>
              </div>
            </div>
            {(e.ubicacion||e.ruta||viajeInfo?.Destino||e.cliente)&&(
              <div style={{display:"flex",gap:10,marginBottom:8,flexWrap:"wrap",fontSize:10}}>
                {e.ubicacion&&<span style={{color:"#94a3b8"}}>📍 {e.ubicacion}</span>}
                {viajeInfo?.Origen&&<span style={{color:"#64748b"}}>Desde: {viajeInfo.Origen}</span>}
                {viajeInfo?.Destino&&<span style={{color:"#10b981",fontWeight:700}}>→ {viajeInfo.Destino}</span>}
                {(e.cliente||viajeInfo?.Cliente)&&<span style={{color:"#64748b"}}>{e.cliente||viajeInfo?.Cliente}</span>}
              </div>
            )}
            {/* Timeline — ícono grande */}
            <div style={{overflowX:"auto"}}>
              <div style={{display:"flex",alignItems:"center",minWidth:cfg.paradas.length*100,paddingBottom:6}}>
                {cfg.paradas.map((p2,pi)=>{
                  const esAct=pi===1,esAnt=pi<1;
                  return(<React.Fragment key={pi}>
                    <div style={{display:"flex",flexDirection:"column",alignItems:"center",minWidth:90,zIndex:2}}>
                      <div style={{width:esAct?40:16,height:esAct?40:16,borderRadius:"50%",background:esAct?cfg.color:esAnt?cfg.color+"80":"#1e293b",border:esAct?`3px solid ${cfg.color}`:`2px solid ${esAnt?cfg.color+"60":"#1e293b"}`,boxShadow:esAct?`0 0 16px ${cfg.color}80`:"none",display:"flex",alignItems:"center",justifyContent:"center"}}>
                        {esAct&&<span style={{fontSize:24}}>🚛</span>}
                        {!esAct&&esAnt&&<span style={{color:"#fff",fontSize:10,fontWeight:900}}>✓</span>}
                      </div>
                      <div style={{color:esAct?"#f1f5f9":esAnt?"#475569":"#334155",fontSize:8,marginTop:5,textAlign:"center",fontWeight:esAct?700:400,whiteSpace:"nowrap"}}>{p2}</div>
                    </div>
                    {pi<cfg.paradas.length-1&&<div style={{flex:1,height:3,background:pi<1?cfg.color+"80":"#1e293b",minWidth:24,position:"relative",top:-16,flexShrink:0}}/>}
                  </React.Fragment>);
                })}
              </div>
            </div>
            <div style={{background:"#060d1a",borderRadius:7,padding:"6px 12px",marginTop:4,display:"flex",justifyContent:"space-between",alignItems:"center",gap:6,flexWrap:"wrap"}}>
              {e.comentarios&&<span style={{color:"#94a3b8",fontSize:9}}>{e.comentarios.slice(0,70)}</span>}
              <span style={{color:cfg.color,fontSize:10,fontWeight:700}}>➡️ {cfg.siguiente}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ── MANTENIMIENTO — solo CP, RM, SG + alertas tiempo excedido ────────────────
const Mantenimiento=({data})=>{
  const res=data.resumen;
  if(!res) return <div style={{color:"#475569",textAlign:"center",padding:40}}>Sincroniza para cargar datos</div>;
  const grupos=res.flota?.grupos||{};
  const [selTab,setSelTab]=useState("CP");
  const [modal,setModal]=useState(null);
  const alertasMtto=res.alertasMtto||[];

  const CONF=[
    {k:"CP",l:"CP — Correctivo/Prev.",col:"#f59e0b",ic:"🔧",desc:"Correctivo preventivo en taller"},
    {k:"RM",l:"RM — Reparación Mayor",col:"#ef4444",ic:"🔩",desc:"Reparación mayor — fuera de operación"},
    {k:"SG",l:"SG — Siniestro/Garantía",col:"#ef4444",ic:"💥",desc:"Siniestro o reparación en garantía"},
  ];
  const cfg=CONF.find(c=>c.k===selTab)||CONF[0];
  const filas=grupos[selTab]||[];

  return(
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      <div style={{background:"#0a1628",border:"1px solid #1e3a5f",borderRadius:8,padding:"8px 12px",fontSize:11,color:"#3b82f6"}}>
        ℹ️ MTTO = CP + RM + SG únicamente · LIB (liberar descarga) va en Tracker/Unidades
      </div>
      {/* Alertas tiempo excedido */}
      {alertasMtto.length>0&&(
        <div style={{background:"#1f0f0a",border:"1px solid #ef444440",borderRadius:10,padding:"12px 14px"}}>
          <div style={{color:"#ef4444",fontWeight:700,fontSize:12,marginBottom:8}}>⏱ {alertasMtto.length} unidades EXCEDEN tiempo estimado en MTTO</div>
          {alertasMtto.map((a,i)=>(
            <div key={i} style={{background:"#2d0a0a",borderRadius:7,padding:"8px 10px",marginBottom:6,fontSize:10}}>
              <span style={{color:"#f1f5f9",fontWeight:700,fontFamily:"monospace"}}>{a.unidad}</span>
              <Badge text={a.tipo} small/> &nbsp;
              <span style={{color:"#ef4444",fontWeight:700}}>{a.diasEnMtto}d de {a.limiteEsperado}d límite</span>
              <span style={{color:"#64748b",marginLeft:6}}>{a.comentarios}</span>
              <div style={{color:"#f59e0b",marginTop:4}}>💡 {a.accion}</div>
            </div>
          ))}
        </div>
      )}
      {/* Iconos de tipo */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
        {CONF.map(c=>(
          <div key={c.k} onClick={()=>setSelTab(c.k)} style={{background:selTab===c.k?c.col+"30":c.col+"15",border:`2px solid ${c.col}${selTab===c.k?"80":"30"}`,borderRadius:10,padding:"12px 8px",cursor:"pointer",textAlign:"center"}}>
            <div style={{fontSize:24}}>{c.ic}</div>
            <div style={{color:c.col,fontWeight:900,fontSize:26}}>{(grupos[c.k]||[]).length}</div>
            <div style={{color:"#475569",fontSize:9,textTransform:"uppercase"}}>{c.k}</div>
          </div>
        ))}
      </div>
      <div style={{background:"#0a1628",border:`1px solid ${cfg.col}30`,borderRadius:11,padding:14}}>
        <div style={{color:cfg.col,fontWeight:700,fontSize:13,marginBottom:4}}>{cfg.ic} {cfg.l} — {filas.length} unidades</div>
        <div style={{color:"#475569",fontSize:10,marginBottom:10}}>{cfg.desc}</div>
        {filas.length===0?<div style={{color:"#334155",textAlign:"center",padding:16}}>Sin unidades en esta categoría</div>:(
          <TablaDetalle rows={filas} cols={[
            {k:"unidad",l:"Unidad",col:()=>"#f1f5f9",bold:true,mono:true},
            {k:"operador",l:"Operador",mw:140,col:()=>"#94a3b8"},
            {k:"coordinador",l:"Coord",render:r=><span style={{color:cc(r.coordinador||""),fontWeight:700}}>{(r.coordinador||"").split(" ")[0]}</span>},
            {k:"motivo",l:"Motivo",render:r=><Badge text={r.motivo||""} small/>},
            {k:"circuito",l:"Circuito",col:()=>"#a78bfa",bold:true,fs:10},
            {k:"comentarios",l:"Comentarios",mw:200,col:()=>"#64748b",fs:10},
          ]}/>
        )}
      </div>
    </div>
  );
};

// ── DISTRIBUCIÓN — circuitos dinámicos ────────────────────────────────────────
const Distribucion=({data})=>{
  const res=data.resumen;
  if(!res) return <div style={{color:"#475569",textAlign:"center",padding:40}}>Sincroniza para cargar datos</div>;
  const {flota,coordinadores}=res;
  const grupos=flota?.grupos||{};
  const totalActivas=(flota?.resumen?.VTA||0)+(flota?.resumen?.TRN||0)+(flota?.resumen?.MOV||0)+(flota?.resumen?.LIB||0);
  const [modal,setModal]=useState(null);

  // Mapa por circuito
  const circMap={};
  Object.values(grupos).flat().forEach(e=>{
    const ci=e.circuito||"Sin circuito";
    if(!circMap[ci])circMap[ci]={total:0,enRuta:0,disp:0,mtto:0,sinOp:0,unidades:[]};
    circMap[ci].total++;
    const m=String(e.motivo||"").toUpperCase();
    if(esOp(m))circMap[ci].enRuta++;
    else if(m.startsWith("DCO")||m.startsWith("DSO"))circMap[ci].disp++;
    else if(m.startsWith("CP")||m.startsWith("RM")||m.startsWith("SG"))circMap[ci].mtto++;
    else circMap[ci].sinOp++;
    circMap[ci].unidades.push(e);
  });

  return(
    <div style={{display:"flex",flexDirection:"column",gap:20}}>
      {modal&&<Modal title={modal.title} onClose={()=>setModal(null)} wide><TablaDetalle rows={modal.rows} cols={COLS_UNIDAD}/></Modal>}
      <div style={{color:"#475569",fontSize:10,textTransform:"uppercase",letterSpacing:1}}>Datos del {flota?.fecha} · {flota?.total} unidades · <span style={{color:"#10b981",fontWeight:700}}>{totalActivas} Operando</span></div>
      {/* Por coordinador */}
      <div>
        <div style={{color:"#475569",fontSize:11,textTransform:"uppercase",letterSpacing:1.5,marginBottom:10}}>👥 Por Coordinador</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:10}}>
          {["TELLO","CRISTIAN","JULIO"].map(k=>{
            const c=coordinadores?.[k]; if(!c) return null; const col=C[k];
            return(
              <div key={k} style={{background:"#0a1628",border:`1px solid ${col}30`,borderRadius:12,padding:16}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                  <div style={{width:10,height:10,borderRadius:"50%",background:col,boxShadow:`0 0 8px ${col}`}}/>
                  <div style={{color:"#f1f5f9",fontWeight:800,fontSize:14}}>{c.nombre}</div>
                  <div style={{marginLeft:"auto",background:col+"20",color:col,borderRadius:6,padding:"2px 8px",fontSize:12,fontWeight:700}}>{c.totalUnidades}</div>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6,textAlign:"center",marginBottom:10}}>
                  {[["Activas",c.activas,"#10b981"],["DCO",c.dco,"#3b82f6"],["Mtto",c.mtto,"#f59e0b"],["Vacantes",c.vacantes,"#64748b"]].map(([l,v,col2])=>(
                    <div key={l} style={{background:col2+"15",borderRadius:7,padding:"6px 4px"}}>
                      <div style={{color:col2,fontWeight:900,fontSize:18}}>{v}</div>
                      <div style={{color:"#475569",fontSize:9,textTransform:"uppercase"}}>{l}</div>
                    </div>
                  ))}
                </div>
                <div style={{borderTop:"1px solid #1e293b",paddingTop:8,display:"flex",justifyContent:"space-between"}}>
                  <div style={{fontSize:9,color:"#64748b"}}>Eficiencia: <span style={{color:col,fontWeight:700}}>{c.eficiencia}%</span></div>
                  <div style={{fontSize:9,color:"#334155"}}>Hoy: <span style={{color:col,fontWeight:700}}>{fmt$(c.ventaHoy)}</span></div>
                </div>
                {c.circuitos?.length>0&&<div style={{marginTop:6,fontSize:9,color:"#334155"}}>Circuitos: <span style={{color:col}}>{c.circuitos.join(" · ")}</span></div>}
              </div>
            );
          })}
        </div>
      </div>
      {/* Por circuito dinámico */}
      <div>
        <div style={{color:"#475569",fontSize:11,textTransform:"uppercase",letterSpacing:1.5,marginBottom:10}}>🔁 Por Circuito (Circuitos + Viajes)</div>
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
            <thead><tr style={{borderBottom:"2px solid #1e293b"}}>{["Circuito","Total","Oper.","Disp.","Mtto","Sin Op","% Op.","Siguiente","Detalle"].map(h=><th key={h} style={{textAlign:"left",padding:"8px 10px",color:"#475569",fontSize:9,textTransform:"uppercase",whiteSpace:"nowrap"}}>{h}</th>)}</tr></thead>
            <tbody>{Object.entries(circMap).sort((a,b)=>b[1].total-a[1].total).map(([ci,v],i)=>{
              const pct=v.total>0?((v.enRuta/v.total)*100).toFixed(0):0;
              const cfg2=CIRC_VISUAL[ci];
              return(
                <tr key={ci} style={{borderBottom:"1px solid #0d1626",background:i%2===0?"#080e1c":"transparent"}}>
                  <td style={{padding:"9px 10px",color:"#f1f5f9",fontWeight:700,maxWidth:140,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{ci}</td>
                  <td style={{padding:"9px 10px",color:"#94a3b8",fontWeight:700}}>{v.total}</td>
                  <td style={{padding:"9px 10px"}}><span style={{color:"#10b981",fontWeight:700}}>{v.enRuta}</span></td>
                  <td style={{padding:"9px 10px"}}><span style={{color:"#3b82f6",fontWeight:700}}>{v.disp}</span></td>
                  <td style={{padding:"9px 10px"}}><span style={{color:"#f59e0b",fontWeight:700}}>{v.mtto}</span></td>
                  <td style={{padding:"9px 10px"}}><span style={{color:"#64748b",fontWeight:700}}>{v.sinOp}</span></td>
                  <td style={{padding:"9px 10px"}}><div style={{display:"flex",alignItems:"center",gap:4}}><div style={{width:40,height:4,background:"#1e293b",borderRadius:2,overflow:"hidden"}}><div style={{height:"100%",width:`${pct}%`,background:+pct>=70?"#10b981":+pct>=40?"#f59e0b":"#ef4444",borderRadius:2}}/></div><span style={{color:+pct>=70?"#10b981":+pct>=40?"#f59e0b":"#ef4444",fontWeight:700,fontSize:11}}>{pct}%</span></div></td>
                  <td style={{padding:"9px 10px",color:cfg2?cfg2.color:"#475569",fontSize:9}}>{cfg2?"➡️ "+cfg2.siguiente:"—"}</td>
                  <td style={{padding:"9px 10px"}}><button onClick={()=>setModal({title:`${ci} — ${v.total} unidades`,rows:v.unidades,cols:COLS_UNIDAD})} style={{background:"#1e293b",border:"none",borderRadius:6,padding:"3px 8px",color:"#94a3b8",cursor:"pointer",fontSize:9}}>Ver ↗</button></td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// ── UNIDADES — íconos filtro + desglose + detalle ─────────────────────────────
const Tractos=({data})=>{
  const res=data.resumen;
  const [q,setQ]=useState(""); const [coordFil,setCoordFil]=useState(""); const [mFil,setMFil]=useState("");
  const [modal,setModal]=useState(null);
  if(!res) return <div style={{color:"#475569",textAlign:"center",padding:40}}>Sincroniza para cargar datos</div>;
  const grupos=res.flota?.grupos||{};
  const venta=res.venta;
  const allU=Object.values(grupos).flat();

  const TIPOSOBJ=[
    {k:"VTA",l:"VTA",col:"#10b981",ic:"💰"},
    {k:"TRN",l:"TRN",col:"#3b82f6",ic:"🔄"},
    {k:"MOV",l:"MOV",col:"#10b981",ic:"🚛"},
    {k:"LIB",l:"LIB",col:"#a855f7",ic:"🔓"},
    {k:"DCO",l:"DCO",col:"#3b82f6",ic:"🔵"},
    {k:"DSO",l:"DSO",col:"#64748b",ic:"📌"},
    {k:"CP",l:"CP",col:"#f59e0b",ic:"🔧"},
    {k:"RM",l:"RM",col:"#ef4444",ic:"🔩"},
    {k:"SG",l:"SG",col:"#ef4444",ic:"💥"},
    {k:"SO",l:"SO",col:"#64748b",ic:"👤"},
    {k:"IND",l:"IND",col:"#ef4444",ic:"⚠️"},
    {k:"PER",l:"PER",col:"#a855f7",ic:"📋"},
  ];

  const lista=allU.filter(e=>{
    const tx=q.toLowerCase();
    return(!q||(e.unidad+e.operador+e.ruta+e.circuito).toLowerCase().includes(tx))
      &&(!coordFil||ck(e.coordinador)===coordFil)
      &&(!mFil||String(e.motivo||"").toUpperCase().startsWith(mFil));
  });

  return(
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      {modal&&<Modal title={modal.title} onClose={()=>setModal(null)} wide><TablaDetalle rows={modal.rows} cols={COLS_UNIDAD}/></Modal>}
      {/* Venta */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,textAlign:"center"}}>
        {[["TELLO","Tello",C.TELLO],["CRISTIAN","Cristian",C.CRISTIAN],["JULIO","Julio",C.JULIO],["TOTAL","Total","#f1f5f9"]].map(([k,l,col])=>(
          <div key={k} style={{background:col+"10",border:`1px solid ${col}30`,borderRadius:9,padding:"10px 6px"}}>
            <div style={{color:col,fontWeight:900,fontSize:14}}>{fmt$(venta?.hoy?.[k]||0)}</div>
            <div style={{color:"#475569",fontSize:9}}>📅 {l} hoy</div>
            <div style={{color:"#334155",fontSize:8}}>Sem: {fmt$(venta?.semana?.[k]||0)}</div>
          </div>
        ))}
      </div>
      {/* ÍCONOS por tipo — click para filtrar y ver detalle */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(70px,1fr))",gap:6}}>
        {TIPOSOBJ.map(t=>{
          const cnt=(grupos[t.k]||[]).length;
          const sel=mFil===t.k;
          return(
            <div key={t.k} onClick={()=>{setMFil(sel?"":t.k); if(!sel)setModal({title:`${t.ic} ${t.l} — ${cnt} unidades`,rows:grupos[t.k]||[],cols:COLS_UNIDAD});}}
              style={{background:sel?t.col+"30":t.col+"15",border:`2px solid ${t.col}${sel?"80":"30"}`,borderRadius:9,padding:"8px 6px",cursor:"pointer",textAlign:"center"}}>
              <div style={{fontSize:16}}>{t.ic}</div>
              <div style={{color:t.col,fontWeight:900,fontSize:18}}>{cnt}</div>
              <div style={{color:"#475569",fontSize:8,textTransform:"uppercase"}}>{t.l}</div>
              <div style={{color:"#334155",fontSize:7}}>↗ ver</div>
            </div>
          );
        })}
      </div>
      <div style={{background:"#0a1628",border:"1px solid #1e3a5f",borderRadius:8,padding:"8px 12px",fontSize:11,color:"#3b82f6"}}>
        ℹ️ {allU.length} unidades del {res.flota?.fecha} · Activas (Operando): {res.flota?.enOperacion||0}
      </div>
      {/* Filtros */}
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
        <input placeholder="🔍 Buscar unidad, operador, circuito..." value={q} onChange={e=>setQ(e.target.value)} style={{flex:1,minWidth:180,background:"#0a1628",border:"1px solid #1e293b",borderRadius:8,padding:"8px 12px",color:"#f1f5f9",fontSize:12,outline:"none"}}/>
        <select value={coordFil} onChange={e=>setCoordFil(e.target.value)} style={{background:"#0a1628",border:"1px solid #1e293b",borderRadius:8,padding:"8px 10px",color:"#f1f5f9",fontSize:12,outline:"none"}}>
          <option value="">Todos</option><option value="TELLO">Tello</option><option value="CRISTIAN">Cristian</option><option value="JULIO">Julio</option>
        </select>
        {mFil&&<button onClick={()=>setMFil("")} style={{background:"#1e293b",border:"none",borderRadius:8,padding:"8px 12px",color:"#94a3b8",fontSize:11,cursor:"pointer"}}>✕ {mFil}</button>}
        <button onClick={()=>dlCSV(toCSV(allU,["unidad","operador","coordinador","motivo","ruta","circuito","ubicacion","cliente","monto","comentarios"]),"unidades.csv")} style={{background:"#1e3a2f",border:"1px solid #10b98144",borderRadius:8,padding:"8px 12px",color:"#10b981",fontSize:11,cursor:"pointer",fontWeight:700}}>⬇️ CSV</button>
      </div>
      <div style={{color:"#475569",fontSize:11}}>{lista.length} unidades</div>
      <TablaDetalle rows={lista} cols={COLS_UNIDAD}/>
    </div>
  );
};

// ── CAJAS — patio correcto ────────────────────────────────────────────────────
const Cajas=({data,setData})=>{
  const [q,setQ]=useState(""); const [coordFil,setCoordFil]=useState(""); const [eFil,setEFil]=useState(""); const [pFil,setPFil]=useState("");
  const [editando,setEditando]=useState(null); const [form,setForm]=useState({});
  const [modalPatio,setModalPatio]=useState(null);
  const lista2=(data.cajasList||[]).filter(c=>{const tx=q.toLowerCase();return(!q||(c.Caja+c.Cliente+c["Ciudad / Ubicación"]).toLowerCase().includes(tx))&&(!coordFil||String(c.Coordinador||"").toUpperCase().includes(coordFil))&&(!eFil||c.Estatus===eFil)&&(!pFil||c["Ciudad / Ubicación"]===pFil);});
  const resumen={};(data.cajasList||[]).forEach(c=>{resumen[c.Estatus]=(resumen[c.Estatus]||0)+1;});
  const guardar=()=>{const upd={...data,cajasList:(data.cajasList||[]).map(c=>c.Caja===editando?{...c,...form}:c)};setData(upd);sd(upd);setEditando(null);if(USAR_SHEETS)apiPost("Control_Cajas",upd.cajasList);};
  const cajasRes=data.resumen?.cajas;
  const patiosData=(cajasRes?.porPatio||[]);

  return(
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      {modalPatio&&<Modal title={`📦 ${modalPatio.patio} — ${modalPatio.total} cajas`} onClose={()=>setModalPatio(null)} wide>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(90px,1fr))",gap:6,marginBottom:12}}>
          {[["Cargada","#10b981"],["Disponible","#3b82f6"],["Dañada","#ef4444"],["NoLocalizada","#f97316"],["Vacia","#64748b"],["Transito","#6366f1"],["Siniestro","#ef4444"],["Venta","#64748b"]].map(([k,col])=>modalPatio[k]>0&&(
            <div key={k} style={{background:col+"15",borderRadius:7,padding:"8px",textAlign:"center"}}><div style={{color:col,fontWeight:900,fontSize:18}}>{modalPatio[k]}</div><div style={{color:"#475569",fontSize:9}}>{k}</div></div>
          ))}
        </div>
        <TablaDetalle rows={modalPatio.cajas||[]} cols={[
          {k:"caja",l:"Caja",col:()=>"#f1f5f9",bold:true,mono:true},
          {k:"estatus",l:"Estatus",render:r=><Badge text={r.estatus||""} small/>},
          {k:"cliente",l:"Cliente",mw:110,col:()=>"#94a3b8"},
          {k:"coordinador",l:"Coord",mw:80,col:()=>"#64748b"},
          {k:"comentarios",l:"Comentarios",mw:160,col:()=>"#64748b",fs:10},
        ]}/>
      </Modal>}
      {editando&&<Modal title={`Editar ${editando}`} onClose={()=>setEditando(null)}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          <Input label="Estatus" value={form.Estatus||""} onChange={v=>setForm(f=>({...f,Estatus:v}))} options={["Cargada","Disponible","En patio","En tránsito","Dañada","Siniestro","No localizada","Vacia","Venta"]}/>
          <Input label="Ciudad / Ubicación" value={form["Ciudad / Ubicación"]||""} onChange={v=>setForm(f=>({...f,"Ciudad / Ubicación":v}))}/>
          <Input label="Cliente" value={form.Cliente||""} onChange={v=>setForm(f=>({...f,Cliente:v}))}/>
          <Input label="Coordinador" value={form.Coordinador||""} onChange={v=>setForm(f=>({...f,Coordinador:v}))} options={["Juan Jose Tello","Cristian Zuñiga","Julio Hernandez"]}/>
          <Input label="Comentarios" value={form.Comentarios||""} onChange={v=>setForm(f=>({...f,Comentarios:v}))}/>
        </div>
        <button onClick={guardar} style={{marginTop:14,width:"100%",background:"#3b82f6",border:"none",borderRadius:8,padding:"10px",color:"#fff",fontWeight:700,cursor:"pointer"}}>💾 Guardar {USAR_SHEETS?"+ Sync":""}</button>
      </Modal>}
      {/* Resumen global por estatus */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(85px,1fr))",gap:6}}>
        {Object.entries(resumen).map(([k,v])=>(
          <div key={k} onClick={()=>setEFil(eFil===k?"":k)} style={{background:eFil===k?ec(k)+"30":ec(k)+"15",border:`1px solid ${ec(k)}${eFil===k?"80":"33"}`,borderRadius:8,padding:"8px 10px",cursor:"pointer",textAlign:"center"}}>
            <div style={{color:ec(k),fontWeight:900,fontSize:18}}>{v}</div>
            <div style={{color:"#475569",fontSize:9,textTransform:"uppercase"}}>{k}</div>
          </div>
        ))}
      </div>
      {/* Por patio — totales correctos con click para detalle */}
      {patiosData.length>0&&(
        <div>
          <div style={{color:"#475569",fontSize:11,textTransform:"uppercase",letterSpacing:1,marginBottom:8}}>📍 Distribución por Patio (click = detalle)</div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            {patiosData.map(p=>(
              <div key={p.patio} onClick={()=>{setPFil(pFil===p.patio?"":p.patio);setModalPatio(pFil===p.patio?null:p);}}
                style={{background:pFil===p.patio?"#1e3a5f":"#0a1628",border:`1px solid ${pFil===p.patio?"#3b82f6":"#1e293b"}`,borderRadius:8,padding:"8px 12px",cursor:"pointer",minWidth:100}}>
                <div style={{color:"#3b82f6",fontWeight:900,fontSize:18}}>{p.total}</div>
                <div style={{color:"#f1f5f9",fontSize:10,fontWeight:700}}>{p.patio}</div>
                <div style={{color:"#475569",fontSize:9,marginTop:2}}>
                  {p.Cargada>0&&<span style={{color:"#10b981",marginRight:4}}>C:{p.Cargada}</span>}
                  {p.Disponible>0&&<span style={{color:"#3b82f6",marginRight:4}}>D:{p.Disponible}</span>}
                  {p.Dañada>0&&<span style={{color:"#ef4444",marginRight:4}}>X:{p.Dañada}</span>}
                  {p.NoLocalizada>0&&<span style={{color:"#f97316"}}>NL:{p.NoLocalizada}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {/* Búsqueda */}
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
        <input placeholder="🔍 Buscar caja..." value={q} onChange={e=>setQ(e.target.value)} style={{flex:1,minWidth:180,background:"#0a1628",border:"1px solid #1e293b",borderRadius:8,padding:"8px 12px",color:"#f1f5f9",fontSize:12,outline:"none"}}/>
        <select value={coordFil} onChange={e=>setCoordFil(e.target.value)} style={{background:"#0a1628",border:"1px solid #1e293b",borderRadius:8,padding:"8px 10px",color:"#f1f5f9",fontSize:12,outline:"none"}}>
          <option value="">Todos</option><option value="TELLO">Tello</option><option value="CRISTIAN">Cristian</option><option value="JULIO">Julio</option>
        </select>
        <button onClick={()=>dlCSV(toCSV(data.cajasList||[],["Caja","Tipo","Coordinador","Ciudad / Ubicación","Estatus","Cliente","Comentarios"]),"cajas.csv")} style={{background:"#1e3a2f",border:"1px solid #10b98144",borderRadius:8,padding:"8px 12px",color:"#10b981",fontSize:11,cursor:"pointer",fontWeight:700}}>⬇️ CSV</button>
      </div>
      <div style={{color:"#475569",fontSize:11}}>{lista2.length} de {(data.cajasList||[]).length} cajas</div>
      <div style={{overflowX:"auto"}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
          <thead><tr style={{borderBottom:"2px solid #1e293b"}}>{["Caja","Tipo","Coord","Ciudad","Estatus","Cliente","Comentarios",""].map(h=><th key={h} style={{textAlign:"left",padding:"8px 10px",color:"#475569",fontSize:10,textTransform:"uppercase",whiteSpace:"nowrap"}}>{h}</th>)}</tr></thead>
          <tbody>{lista2.map((c,i)=>(
            <tr key={(c.Caja||"")+i} style={{borderBottom:"1px solid #0d1626",background:i%2===0?"#080e1c":"transparent"}}>
              <td style={{padding:"9px 10px",color:"#f1f5f9",fontWeight:800,fontFamily:"monospace"}}>{c.Caja}</td>
              <td style={{padding:"9px 10px",color:"#64748b"}}>{c.Tipo}</td>
              <td style={{padding:"9px 10px"}}><span style={{color:cc(c.Coordinador||""),fontWeight:700,fontSize:11}}>{(c.Coordinador||"").split(" ")[0]}</span></td>
              <td style={{padding:"9px 10px",color:"#94a3b8",maxWidth:110,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c["Ciudad / Ubicación"]}</td>
              <td style={{padding:"9px 10px"}}><Badge text={c.Estatus||""}/></td>
              <td style={{padding:"9px 10px",color:"#94a3b8",maxWidth:110,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.Cliente}</td>
              <td style={{padding:"9px 10px",color:"#94a3b8",fontSize:11,maxWidth:160,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.Comentarios||"—"}</td>
              <td style={{padding:"9px 10px"}}><button onClick={()=>{setEditando(c.Caja);setForm({...c});}} style={{background:"#1e293b",border:"none",borderRadius:6,padding:"4px 10px",color:"#94a3b8",cursor:"pointer",fontSize:11}}>✏️</button></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
};

// ── VIAJES — solo semana en curso ─────────────────────────────────────────────
const Viajes=({data})=>{
  const [q,setQ]=useState(""); const [coordFil,setCoordFil]=useState("");
  // Usar viajesSemana (solo semana en curso del servidor)
  const viajesSrc=data.resumen?.viajesSemana||data.viajesList||[];
  const viajes=viajesSrc.filter(v=>{const t=q.toLowerCase();return(!q||(String(v.Unidad)+v.Cliente+v.Coordinador+v.Caja).toLowerCase().includes(t))&&(!coordFil||ck(v.Coordinador)===coordFil);});
  const otif=data.resumen?.otif;
  const $v=v=>$n(v["Venta real"]||v["Monto"]||v["Venta"]||0);
  const finalizados=viajes.filter(v=>["Finalizado","Entregado","TERMINADO"].some(s=>(v["Estatus viaje"]||"").toLowerCase().includes(s.toLowerCase())));
  const totV=finalizados.reduce((s,v)=>s+$v(v),0);
  const weekNum=data.resumen?.weekNum||"";
  return(
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      <div style={{background:"#0a1628",border:"1px solid #1e3a5f",borderRadius:8,padding:"8px 12px",fontSize:11,color:"#3b82f6"}}>
        📋 Semana {weekNum} en curso — {viajesSrc.length} viajes registrados
      </div>
      {/* OTIF */}
      <div style={{background:"#0a1628",border:"1px solid #6366f130",borderRadius:11,padding:12}}>
        <div style={{color:"#6366f1",fontWeight:700,fontSize:13,marginBottom:8}}>🎯 OTIF Sem {weekNum} — {otif?.pctSem||0}% cumplimiento ({otif?.totalSem||0} viajes)</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6,textAlign:"center"}}>
          {[[`${otif?.pctSem||0}%`,"OTIF Sem",+(otif?.pctSem||0)>=85?"#10b981":"#ef4444"],[otif?.onTimeSem||0,"A tiempo","#10b981"],[otif?.late||0,"Tardías","#ef4444"],[otif?.sinFecha||0,"Sin fecha","#64748b"]].map(([v,l,col])=>(
            <div key={l} style={{background:col+"10",borderRadius:7,padding:"8px 4px"}}><div style={{color:col,fontWeight:900,fontSize:l.includes("OTIF")?18:14}}>{v}</div><div style={{color:"#475569",fontSize:9}}>{l}</div></div>
          ))}
        </div>
      </div>
      {finalizados.length>0&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
        <div style={{background:"#0a1628",border:"1px solid #10b98130",borderRadius:10,padding:"12px"}}><div style={{color:"#10b981",fontWeight:900,fontSize:18}}>{fmt$(totV)}</div><div style={{color:"#475569",fontSize:10}}>💵 Venta ({finalizados.length} viajes finalizados)</div></div>
        <div style={{background:"#0a1628",border:"1px solid #3b82f630",borderRadius:10,padding:"12px"}}><div style={{color:"#3b82f6",fontWeight:900,fontSize:18}}>{finalizados.length}</div><div style={{color:"#475569",fontSize:10}}>✅ Viajes finalizados sem {weekNum}</div></div>
      </div>}
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
        <input placeholder="🔍 Buscar..." value={q} onChange={e=>setQ(e.target.value)} style={{flex:1,minWidth:160,background:"#0a1628",border:"1px solid #1e293b",borderRadius:8,padding:"8px 12px",color:"#f1f5f9",fontSize:12,outline:"none"}}/>
        <select value={coordFil} onChange={e=>setCoordFil(e.target.value)} style={{background:"#0a1628",border:"1px solid #1e293b",borderRadius:8,padding:"8px 10px",color:"#f1f5f9",fontSize:12,outline:"none"}}>
          <option value="">Todos</option><option value="TELLO">Tello</option><option value="CRISTIAN">Cristian</option><option value="JULIO">Julio</option>
        </select>
        <button onClick={()=>dlCSV(toCSV(viajes,["Semana","Fecha de carga","Coordinador","Unidad","Caja","Cliente","Origen","Destino","Estatus viaje","Km cargados","Venta real","Cita descarga","Fecha descarga","Observaciones"]),"viajes_sem"+weekNum+".csv")} style={{background:"#1e3a2f",border:"1px solid #10b98144",borderRadius:8,padding:"8px 12px",color:"#10b981",fontSize:11,cursor:"pointer",fontWeight:700}}>⬇️ CSV</button>
      </div>
      <div style={{color:"#475569",fontSize:11}}>{viajes.length} viajes</div>
      <div style={{overflowX:"auto"}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
          <thead><tr style={{borderBottom:"2px solid #1e293b"}}>{["Coord","Unidad","Caja","Cliente","Origen","Destino","Estatus","Km","Venta Real","Circuito","F.Carga","Cita Desc.","F.Descarga","OTIF"].map(h=><th key={h} style={{textAlign:"left",padding:"7px 8px",color:"#475569",fontSize:9,textTransform:"uppercase",whiteSpace:"nowrap"}}>{h}</th>)}</tr></thead>
          <tbody>{viajes.map((v,i)=>{
            const ent=["finalizado","entregado","terminado"].some(s=>(v["Estatus viaje"]||"").toLowerCase().includes(s));
            return(
              <tr key={i} style={{borderBottom:"1px solid #0d1626",background:i%2===0?"#080e1c":"transparent"}}>
                <td style={{padding:"8px 8px"}}><span style={{color:cc(v.Coordinador||""),fontWeight:700,fontSize:10}}>{(v.Coordinador||"").split(" ")[0]}</span></td>
                <td style={{padding:"8px 8px",color:"#f1f5f9",fontFamily:"monospace",fontWeight:700}}>{v.Unidad}</td>
                <td style={{padding:"8px 8px",color:"#94a3b8",fontFamily:"monospace"}}>{v.Caja}</td>
                <td style={{padding:"8px 8px",color:"#94a3b8",maxWidth:90,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{v.Cliente}</td>
                <td style={{padding:"8px 8px",color:"#64748b",fontSize:9}}>{v.Origen}</td>
                <td style={{padding:"8px 8px",color:"#64748b",fontSize:9}}>{v.Destino}</td>
                <td style={{padding:"8px 8px"}}><Badge text={v["Estatus viaje"]||""} small/></td>
                <td style={{padding:"8px 8px",color:"#64748b"}}>{v["Km cargados"]||"—"}</td>
                <td style={{padding:"8px 8px",color:$v(v)>0?"#10b981":"#334155",fontWeight:$v(v)>0?700:400}}>{$v(v)>0?fmt$($v(v)):"—"}</td>
                <td style={{padding:"8px 8px",color:"#a78bfa",fontSize:9,fontWeight:700}}>{v.Circuito||"—"}</td>
                <td style={{padding:"8px 8px",color:"#64748b",fontSize:9}}>{v["Fecha de carga"]||"—"}</td>
                <td style={{padding:"8px 8px",color:"#64748b",fontSize:9}}>{v["Cita descarga"]||"—"}</td>
                <td style={{padding:"8px 8px",color:"#64748b",fontSize:9}}>{v["Fecha descarga"]||"—"}</td>
                <td style={{padding:"8px 8px",color:ent?"#10b981":"#64748b",fontWeight:700}}>{ent?"✅":"—"}</td>
              </tr>
            );
          })}</tbody>
        </table>
      </div>
    </div>
  );
};

// ── RANKING ───────────────────────────────────────────────────────────────────
const RankingOperadores=({data})=>{
  const res=data.resumen;
  const [q,setQ]=useState(""); const [sortKey,setSortKey]=useState("rendimientoKmLt"); const [sortDir,setSortDir]=useState("desc");
  if(!res) return <div style={{color:"#475569",textAlign:"center",padding:40}}>Sincroniza para cargar datos</div>;
  const ranking=res.ranking||[];
  if(ranking.length===0) return <div style={{color:"#475569",textAlign:"center",padding:40}}>Sin datos de ranking. Asegúrate de tener las hojas CARGAS_DIESEL y VIAJES con datos.</div>;
  const toggle=k=>{if(sortKey===k)setSortDir(d=>d==="desc"?"asc":"desc");else{setSortKey(k);setSortDir("desc");}};
  const lista=ranking.filter(op=>{const tx=q.toLowerCase();return !q||(op.operador+op.unidad).toLowerCase().includes(tx);}).slice().sort((a,b)=>{const ra=parseFloat(a[sortKey])||0,rb=parseFloat(b[sortKey])||0;return sortDir==="desc"?rb-ra:ra-rb;});
  const top3=lista.slice(0,3);
  const COLS_R=[{k:"rendimientoKmLt",l:"Km/Lt",ic:"⛽",col:"#f59e0b"},{k:"rendimientoViaje",l:"Rend/Viaje",ic:"🛣️",col:"#6366f1"},{k:"viajesCompletados",l:"Viajes",ic:"✅",col:"#10b981"},{k:"kmTotal",l:"Km Tot.",ic:"📏",col:"#3b82f6"},{k:"totalLitros",l:"Litros",ic:"🪣",col:"#64748b"},{k:"ventaTotal",l:"Venta",ic:"💵",col:"#10b981"}];
  return(
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      <div style={{color:"#475569",fontSize:11,textTransform:"uppercase",letterSpacing:1.5}}>🏆 Ranking de Operadores — {lista.length} operadores (solo 78 unidades activas)</div>
      {top3.length>=2&&(<div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
        {[top3[1],top3[0],top3[2]].map((op,pi)=>{if(!op)return<div key={pi}/>;const pos=pi===0?2:pi===1?1:3;const col=pos===1?"#f59e0b":pos===2?"#94a3b8":"#cd7f32";return(
          <div key={op.operador} style={{background:"#0a1628",border:`1px solid ${col}40`,borderRadius:12,padding:14,textAlign:"center",transform:pos===1?"scale(1.04)":"none"}}>
            <div style={{fontSize:30}}>{["🥈","🥇","🥉"][pi]}</div>
            <div style={{color:col,fontWeight:900,fontSize:12,marginBottom:2}}>{op.operador.split(" ").slice(0,2).join(" ")}</div>
            <div style={{color:"#475569",fontSize:9,marginBottom:4}}>{op.unidad}</div>
            <div style={{color:col,fontWeight:900,fontSize:22}}>{op.rendimientoKmLt}<span style={{fontSize:10,fontWeight:400}}> Km/Lt</span></div>
            <div style={{color:"#334155",fontSize:9,marginTop:2}}>{op.viajesCompletados} viajes · {Number(op.kmTotal||0).toLocaleString()} km</div>
          </div>
        );})}
      </div>)}
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
        <input placeholder="🔍 Buscar operador o unidad..." value={q} onChange={e=>setQ(e.target.value)} style={{flex:1,minWidth:180,background:"#0a1628",border:"1px solid #1e293b",borderRadius:8,padding:"8px 12px",color:"#f1f5f9",fontSize:12,outline:"none"}}/>
        <button onClick={()=>dlCSV(toCSV(lista,["operador","unidad","rendimientoKmLt","rendimientoViaje","viajesCompletados","kmTotal","totalLitros","ventaTotal","ultimaFechaCarga","ultimoRendimiento","ultimoViaje"]),"ranking.csv")} style={{background:"#1e3a2f",border:"1px solid #10b98144",borderRadius:8,padding:"8px 12px",color:"#10b981",fontSize:11,cursor:"pointer",fontWeight:700}}>⬇️ CSV</button>
      </div>
      <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
        {COLS_R.map(c=><div key={c.k} onClick={()=>toggle(c.k)} style={{background:sortKey===c.k?c.col+"30":"#0a1628",border:`1px solid ${sortKey===c.k?c.col:"#1e293b"}`,borderRadius:7,padding:"5px 10px",cursor:"pointer",fontSize:10,color:sortKey===c.k?c.col:"#64748b",fontWeight:700}}>{c.ic} {c.l} {sortKey===c.k?sortDir==="desc"?"↓":"↑":""}</div>)}
      </div>
      <div style={{overflowX:"auto"}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
          <thead><tr style={{borderBottom:"2px solid #1e293b"}}>{["#","Operador","Unidad","Km/Lt","Rend/Viaje","Viajes","Km Total","Litros","Venta Tot.","Últ. Carga","Últ. Rend.","Últ. Viaje"].map(h=><th key={h} style={{textAlign:"left",padding:"7px 8px",color:"#475569",fontSize:9,textTransform:"uppercase",whiteSpace:"nowrap"}}>{h}</th>)}</tr></thead>
          <tbody>{lista.map((op,i)=>{
            const kml=parseFloat(op.rendimientoKmLt)||0;
            const kc=kml>=3.5?"#10b981":kml>=2.8?"#f59e0b":"#ef4444";
            return(<tr key={op.operador+i} style={{borderBottom:"1px solid #0d1626",background:i%2===0?"#080e1c":"transparent"}}>
              <td style={{padding:"8px 8px",color:i<3?"#f59e0b":"#334155",fontWeight:700}}>{i<3?["🥇","🥈","🥉"][i]:i+1}</td>
              <td style={{padding:"8px 8px",color:"#f1f5f9",fontWeight:700,maxWidth:130,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{op.operador}</td>
              <td style={{padding:"8px 8px",color:"#94a3b8",fontFamily:"monospace",fontSize:10}}>{op.unidad}</td>
              <td style={{padding:"8px 8px"}}><span style={{color:kc,fontWeight:900,fontSize:13}}>{op.rendimientoKmLt}</span></td>
              <td style={{padding:"8px 8px",color:"#6366f1",fontWeight:700}}>{op.rendimientoViaje}</td>
              <td style={{padding:"8px 8px",color:"#10b981",fontWeight:700}}>{op.viajesCompletados}</td>
              <td style={{padding:"8px 8px",color:"#3b82f6"}}>{Number(op.kmTotal||0).toLocaleString()}</td>
              <td style={{padding:"8px 8px",color:"#64748b"}}>{Number(op.totalLitros||0).toLocaleString()}</td>
              <td style={{padding:"8px 8px",color:Number(op.ventaTotal||0)>0?"#10b981":"#334155",fontWeight:700}}>{Number(op.ventaTotal||0)>0?fmt$(Number(op.ventaTotal)):""—"}</td>
              <td style={{padding:"8px 8px",color:"#64748b",fontSize:9}}>{op.ultimaFechaCarga}</td>
              <td style={{padding:"8px 8px",color:parseFloat(op.ultimoRendimiento||0)>=3.5?"#10b981":"#f59e0b",fontWeight:700}}>{op.ultimoRendimiento}</td>
              <td style={{padding:"8px 8px",color:"#64748b",fontSize:9}}>{op.ultimoViaje}</td>
            </tr>);
          })}</tbody>
        </table>
      </div>
      <div style={{background:"#0a1628",border:"1px solid #1e293b",borderRadius:8,padding:"10px 14px",fontSize:10,color:"#475569"}}>
        <b style={{color:"#f1f5f9"}}>📊 Lógica de cálculo:</b> Km/Lt = promedio cargas diesel de las 78 unidades activas · Rend/Viaje = km del viaje ÷ litros promedio · Último rendimiento = carga más reciente · 🟢 ≥3.5 · 🟡 2.8-3.5 · 🔴 &lt;2.8
      </div>
    </div>
  );
};

// ── APP ROOT ──────────────────────────────────────────────────────────────────
const APP_TABS=[
  {id:"indicadores", label:"Indicadores", icon:"📈"},
  {id:"dashboard",   label:"Dashboard",   icon:"📊"},
  {id:"coordinadores",label:"Coordinadores",icon:"👥"},
  {id:"tracker",     label:"Tracker",     icon:"🛣️"},
  {id:"distribucion",label:"Distribución",icon:"🗂️"},
  {id:"tractos",     label:"Unidades",    icon:"🚛"},
  {id:"mantenimiento",label:"MTTO",       icon:"🔧"},
  {id:"cajas",       label:"Cajas",       icon:"📦"},
  {id:"viajes",      label:"Viajes",      icon:"💰"},
  {id:"ranking",     label:"Ranking Op.", icon:"🏆"},
  {id:"alertas",     label:"Alertas",     icon:"🔔"},
];

function App(){
  const [data,setData]=useState(()=>initData());
  const [tab,setTab]=useState("indicadores");
  const [syncState,setSyncState]=useState("idle");
  const [lastSync,setLastSync]=useState("");

  useEffect(()=>{sd(data);},[data]);
  useEffect(()=>{if(!USAR_SHEETS)return;syncAll();},[]);

  const syncAll=async()=>{
    setSyncState("syncing");
    try{
      const [resumen,cajasRaw,viajesRaw]=await Promise.all([
        apiGet("resumen_completo"),
        apiGet("Control_Cajas"),
        apiGet("VIAJES"),
      ]);
      const cajasList=Array.isArray(cajasRaw)?cajasRaw:[];
      const viajesList=Array.isArray(viajesRaw)?viajesRaw:[];
      const upd={...data,resumen:resumen.ok!==undefined?resumen:null,cajasList,viajesList,v:9,lastSync:new Date().toISOString()};
      setData(upd);sd(upd);
      setSyncState("ok");
      setLastSync(new Date().toLocaleTimeString("es-MX",{hour:"2-digit",minute:"2-digit"}));
      setTimeout(()=>setSyncState("idle"),4000);
    }catch(e){
      console.error(e);
      setSyncState("error");
      setTimeout(()=>setSyncState("idle"),6000);
    }
  };

  const alertCount=(data.resumen?.entregas?.totalVencidas||0)
    +(data.resumen?.flota?.grupos?.SG?.length||0)
    +(data.cajasList||[]).filter(c=>c.Estatus==="No localizada").length;

  return(
    <div style={{minHeight:"100vh",background:"#060d1a",color:"#e2e8f0",fontFamily:"'DM Sans','Segoe UI',sans-serif"}}>
      <div style={{background:"#08111f",borderBottom:"1px solid #0f1e33",padding:"12px 18px",display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:100}}>
        <div>
          <div style={{fontSize:15,fontWeight:900,color:"#f1f5f9",letterSpacing:-.5}}>🚚 Nacional Autotransporte</div>
          <div style={{fontSize:9,color:"#334155",letterSpacing:1.5,textTransform:"uppercase"}}>ERP TMS v9 {USAR_SHEETS?`· ☁️ ${lastSync}`:"· 💾 Local"}</div>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <div style={{width:7,height:7,borderRadius:"50%",background:"#10b981",boxShadow:"0 0 8px #10b981"}}/>
          <span style={{color:"#10b981",fontSize:10,fontWeight:700}}>OPERATIVO</span>
        </div>
      </div>
      <div style={{background:"#08111f",borderBottom:"1px solid #0f1e33",display:"flex",overflowX:"auto",padding:"0 14px"}}>
        {APP_TABS.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)}
            style={{background:"none",border:"none",borderBottom:tab===t.id?"2px solid #3b82f6":"2px solid transparent",color:tab===t.id?"#f1f5f9":"#475569",padding:"11px 9px",cursor:"pointer",fontSize:11,fontWeight:tab===t.id?700:400,whiteSpace:"nowrap",display:"flex",gap:4,alignItems:"center",position:"relative"}}>
            {t.icon} {t.label}
            {t.id==="alertas"&&alertCount>0&&<span style={{background:"#ef4444",color:"#fff",borderRadius:"50%",width:16,height:16,fontSize:9,fontWeight:900,display:"flex",alignItems:"center",justifyContent:"center",marginLeft:2}}>{alertCount}</span>}
          </button>
        ))}
      </div>
      <div style={{padding:16,maxWidth:1400,margin:"0 auto"}}>
        <SyncBanner state={syncState} onSync={syncAll} lastSync={lastSync}/>
        {tab==="indicadores"   &&<Indicadores data={data}/>}
        {tab==="dashboard"     &&<Dashboard data={data} setTab={setTab}/>}
        {tab==="coordinadores" &&<Coordinadores data={data}/>}
        {tab==="tracker"       &&<Tracker data={data}/>}
        {tab==="distribucion"  &&<Distribucion data={data}/>}
        {tab==="tractos"       &&<Tractos data={data}/>}
        {tab==="mantenimiento" &&<Mantenimiento data={data}/>}
        {tab==="cajas"         &&<Cajas data={data} setData={setData}/>}
        {tab==="viajes"        &&<Viajes data={data}/>}
        {tab==="ranking"       &&<RankingOperadores data={data}/>}
        {tab==="alertas"       &&<Alertas data={data}/>}
      </div>
      <div style={{padding:"12px 18px",borderTop:"1px solid #0f1e33",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <span style={{color:"#1e3a5f",fontSize:10}}>{data.resumen?.flota?.total||0} Unidades · {data.resumen?.flota?.enOperacion||0} Operando · {(data.cajasList||[]).length} Cajas · Sem {data.resumen?.weekNum||"—"} · v9</span>
        <button onClick={()=>{if(window.confirm("¿Resetear datos locales?")){localStorage.removeItem(STORAGE_KEY);window.location.reload();}}} style={{background:"none",border:"1px solid #1e293b",borderRadius:6,padding:"4px 10px",color:"#334155",fontSize:10,cursor:"pointer"}}>🔄 Reset</button>
      </div>
    </div>
  );
}
ReactDOM.createRoot(document.getElementById("root")).render(React.createElement(App));
