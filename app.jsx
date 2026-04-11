// ═══════════════════════════════════════════════════════════════════════════
//  NACIONAL AUTOTRANSPORTE — ERP TMS v7
//  78 unidades | OTIF | Coordinadores KPIs | Diesel corregido
//  Venta dinámica | Mantenimiento correcto | DCO/DSO/LIB exactos
// ═══════════════════════════════════════════════════════════════════════════
const { useState, useEffect, useRef } = React;

// ─── CONFIG ───────────────────────────────────────────────────────────────────
const SHEETS_URL = window.SHEETS_URL || "PEGA_TU_URL_AQUI";
const USAR_SHEETS = SHEETS_URL !== "PEGA_TU_URL_AQUI";
const STORAGE_KEY = "nal_erp_v7";
const META_DEFAULT = { TELLO:500000, CRISTIAN:450000, JULIO:350000, TOTAL:1300000 };

// ─── CIRCUITOS ────────────────────────────────────────────────────────────────
const CIRC = {
  "Reynosa - Bajio":{ paradas:["Reynosa","Mty","Saltillo","SLP","Ags","Qro","Bajío"], siguiente:"Regreso Reynosa o Adient", tiempo:"18-22h", color:"#3b82f6" },
  "Remolacha":      { paradas:["Reynosa","Pharr TX","McAllen TX","Harlingen TX"],      siguiente:"Reynosa o Carrier MTY",      tiempo:"4-6h",    color:"#10b981" },
  "DX":             { paradas:["Nuevo Laredo","Laredo TX","Dallas TX"],                siguiente:"Regreso NLD o Mty-Bajio",    tiempo:"8-10h",   color:"#f59e0b" },
  "Adient":         { paradas:["Reynosa","Saltillo","Arteaga","Ramos"],                siguiente:"Remolacha o Reynosa-Bajio",  tiempo:"6-8h",    color:"#a855f7" },
  "Mty-Bajio":      { paradas:["Monterrey","Saltillo","SLP","Bajío"],                  siguiente:"DX o Remolacha",            tiempo:"8-10h",   color:"#6366f1" },
  "Nld-Bajio":      { paradas:["Nuevo Laredo","Mty","Saltillo","Bajío"],               siguiente:"DX o Reynosa-Bajio",        tiempo:"10-12h",  color:"#ef4444" },
  "Carrier":        { paradas:["Monterrey","Nuevo León"],                              siguiente:"Mty-Bajio o Remolacha",     tiempo:"2-3h",    color:"#f97316" },
};

// ─── STORAGE ──────────────────────────────────────────────────────────────────
const ld = () => { try{const r=localStorage.getItem(STORAGE_KEY);return r?JSON.parse(r):null;}catch{return null;} };
const sd = (d) => { try{localStorage.setItem(STORAGE_KEY,JSON.stringify(d));}catch{} };
const initData = () => { const s=ld(); if(s&&s.v===7)return s; return {v:7,resumen:null,cajasList:[],viajesList:[],rendList:[],dieselList:[],lastSync:""}; };

// ─── API ──────────────────────────────────────────────────────────────────────
const apiGet = async (tab) => { const r=await fetch(`${SHEETS_URL}?tab=${encodeURIComponent(tab)}`); const j=await r.json(); return Array.isArray(j)?j:(j.data||j); };
const apiPost = async (tab,rows) => { await fetch(SHEETS_URL,{method:"POST",mode:"no-cors",headers:{"Content-Type":"application/json"},body:JSON.stringify({tab,action:"replace",rows})}); };

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const $n = (v) => parseFloat(String(v||"0").replace(/[$,]/g,""))||0;
const C = {TELLO:"#3b82f6",CRISTIAN:"#10b981",JULIO:"#f59e0b"};
const cc = (c="") => { const u=c.toUpperCase(); if(u.includes("TELLO"))return C.TELLO; if(u.includes("CRISTIAN")||u.includes("ZUÑIGA")||u.includes("ZUNIGA"))return C.CRISTIAN; if(u.includes("JULIO")||u.includes("HERNANDEZ"))return C.JULIO; return"#6366f1"; };
const ck = (c="") => { const u=c.toUpperCase(); if(u.includes("TELLO"))return"TELLO"; if(u.includes("CRISTIAN")||u.includes("ZUÑIGA")||u.includes("ZUNIGA"))return"CRISTIAN"; if(u.includes("JULIO")||u.includes("HERNANDEZ"))return"JULIO"; return null; };
const ec = (e="") => { const s=e.toLowerCase(); if(s.includes("vta")||s.includes("facturando")||s.includes("entregado")||s.includes("terminado")||s.includes("finalizado")||s.includes("trn")||s.includes("tránsito")||s.includes("mov"))return"#10b981"; if(s.includes("dco")||s.includes("disponible"))return"#3b82f6"; if(s.includes("dso"))return"#64748b"; if(s.includes("lib"))return"#a855f7"; if(s.includes("cp")||s.includes("rm")||s.includes("sg")||s.includes("mtto")||s.includes("correctivo")||s.includes("siniestro"))return"#f59e0b"; if(s.includes("so")||s.includes("sin operador"))return"#64748b"; if(s.includes("ind"))return"#ef4444"; if(s.includes("per")||s.includes("permiso"))return"#a855f7"; if(s.includes("cargada"))return"#10b981"; if(s.includes("dañada")||s.includes("no localizada"))return"#ef4444"; return"#64748b"; };
const Badge = ({text,small}) => <span style={{background:ec(text)+"22",color:ec(text),border:`1px solid ${ec(text)}44`,borderRadius:5,padding:small?"1px 5px":"2px 7px",fontSize:small?9:10,fontWeight:700,letterSpacing:.5,textTransform:"uppercase",whiteSpace:"nowrap"}}>{text}</span>;
const fmt$ = (v) => v>=1000000?`$${(v/1000000).toFixed(2)}M`:v>=1000?`$${(v/1000).toFixed(0)}K`:`$${Math.round(v).toLocaleString()}`;
const pBar = (pct,col,h=5) => <div style={{height:h,background:"#1e293b",borderRadius:3,overflow:"hidden"}}><div style={{height:"100%",width:`${Math.min(+pct,100)}%`,background:+pct>=100?"#10b981":+pct>=70?"#f59e0b":"#ef4444",borderRadius:3,transition:"width .4s"}}/></div>;
const toCSV = (rows,cols) => cols.join(",")+"\n"+rows.map(r=>cols.map(c=>`"${r[c]??''}"`).join(",")).join("\n");
const dlCSV = (c,fn) => { const b=new Blob([c],{type:"text/csv;charset=utf-8;"}); const a=document.createElement("a"); a.href=URL.createObjectURL(b); a.download=fn; a.click(); };
const DIAS = ["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"];

// ─── COMPONENTS ───────────────────────────────────────────────────────────────
const Input=({label,value,onChange,type="text",options,required})=>(<div style={{display:"flex",flexDirection:"column",gap:4}}><label style={{fontSize:11,color:"#64748b",textTransform:"uppercase",letterSpacing:.8}}>{label}{required&&<span style={{color:"#ef4444"}}> *</span>}</label>{options?<select value={value||""} onChange={e=>onChange(e.target.value)} style={{background:"#0f172a",border:"1px solid #1e293b",borderRadius:7,padding:"8px 10px",color:"#f1f5f9",fontSize:12,outline:"none"}}><option value="">— Seleccionar —</option>{options.map(o=><option key={o} value={o}>{o}</option>)}</select>:<input type={type} value={value||""} onChange={e=>onChange(e.target.value)} style={{background:"#0f172a",border:"1px solid #1e293b",borderRadius:7,padding:"8px 10px",color:"#f1f5f9",fontSize:12,outline:"none"}}/>}</div>);
const Modal=({title,onClose,children,wide})=>(<div style={{position:"fixed",inset:0,background:"#000d",zIndex:999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}><div style={{background:"#0d1829",border:"1px solid #1e293b",borderRadius:14,width:"100%",maxWidth:wide?900:560,maxHeight:"92vh",overflow:"auto"}}><div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"16px 20px",borderBottom:"1px solid #1e293b",position:"sticky",top:0,background:"#0d1829",zIndex:1}}><div style={{color:"#f1f5f9",fontWeight:700,fontSize:14}}>{title}</div><button onClick={onClose} style={{background:"none",border:"none",color:"#64748b",fontSize:22,cursor:"pointer"}}>×</button></div><div style={{padding:20}}>{children}</div></div></div>);
const SyncBanner=({state,onSync,lastSync})=>{const cfg={idle:{bg:"#0a1628",border:"#1e3a5f",col:"#3b82f6",text:USAR_SHEETS?`☁️ Google Sheets${lastSync?" · "+lastSync:""}`:"💾 Local — configura tu URL en index.html"},syncing:{bg:"#0a1f0f",border:"#10b98140",col:"#10b981",text:"🔄 Sincronizando con Sheets..."},ok:{bg:"#0a1f0f",border:"#10b98140",col:"#10b981",text:"✅ Datos actualizados"},error:{bg:"#1f0a0a",border:"#ef444440",col:"#ef4444",text:"⚠️ Error — revisa tu URL de Apps Script y que el acceso sea 'Cualquier persona'"}};const c=cfg[state]||cfg.idle;return <div style={{background:c.bg,border:`1px solid ${c.border}`,borderRadius:9,padding:"8px 14px",display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}><span style={{color:c.col,fontSize:12}}>{c.text}</span>{USAR_SHEETS&&<button onClick={onSync} disabled={state==="syncing"} style={{background:"#1e293b",border:"none",borderRadius:6,padding:"4px 12px",color:"#94a3b8",fontSize:11,cursor:"pointer"}}>🔄 Sincronizar</button>}</div>;};

// ─── LINE CHART ───────────────────────────────────────────────────────────────
const LineChart=({data,keys,colors,labelKey,height=90,title})=>{
  if(!data||data.length<2) return null;
  const allVals=data.flatMap(d=>keys.map(k=>d[k]||0));
  const maxV=Math.max(...allVals,1);
  const W=320,H=height;
  return(
    <div>
      {title&&<div style={{color:"#475569",fontSize:10,textTransform:"uppercase",letterSpacing:1,marginBottom:6}}>{title}</div>}
      <svg viewBox={`0 0 ${W} ${H+20}`} style={{width:"100%",height:height+20,overflow:"visible"}}>
        {keys.map((k,ki)=>{
          const col=colors[ki]||"#6366f1";
          const pts=data.map((d,i)=>`${(i/(data.length-1))*W},${H-((d[k]||0)/maxV)*(H-15)-5}`).join(" ");
          return(
            <g key={k}>
              <polyline fill="none" stroke={col} strokeWidth="2" points={pts} strokeDasharray={ki>0?"4,2":"none"}/>
              {data.map((d,i)=>d[k]>0&&(
                <g key={i}>
                  <circle cx={(i/(data.length-1))*W} cy={H-((d[k]||0)/maxV)*(H-15)-5} r="3" fill={col}/>
                  {i===data.length-1&&<text x={(i/(data.length-1))*W-2} y={H-((d[k]||0)/maxV)*(H-15)-10} textAnchor="end" fill={col} fontSize="8" fontWeight="700">{fmt$(d[k])}</text>}
                </g>
              ))}
            </g>
          );
        })}
        {data.map((d,i)=><text key={i} x={(i/(data.length-1))*W} y={H+15} textAnchor="middle" fill="#475569" fontSize="8">{d[labelKey]}</text>)}
      </svg>
      <div style={{display:"flex",gap:10,justifyContent:"center",marginTop:4,flexWrap:"wrap"}}>
        {keys.map((k,ki)=><div key={k} style={{display:"flex",alignItems:"center",gap:3}}><div style={{width:8,height:2,background:colors[ki],borderRadius:2}}/><span style={{color:"#64748b",fontSize:9}}>{k}</span></div>)}
      </div>
    </div>
  );
};

const BarMini=({val,max,col,label,sub})=>{
  const pct=max>0?Math.min((val/max)*100,100):0;
  return(
    <div style={{background:col+"10",border:`1px solid ${col}25`,borderRadius:8,padding:"10px 8px",textAlign:"center"}}>
      <div style={{color:col,fontWeight:900,fontSize:16}}>{typeof val==="number"?fmt$(val):val}</div>
      <div style={{color:"#64748b",fontSize:9,textTransform:"uppercase",marginTop:1}}>{label}</div>
      {max>0&&<div style={{height:3,background:"#1e293b",borderRadius:2,marginTop:4,overflow:"hidden"}}><div style={{height:"100%",width:`${pct}%`,background:col,borderRadius:2}}/></div>}
      {sub&&<div style={{color:"#334155",fontSize:8,marginTop:2}}>{sub}</div>}
    </div>
  );
};

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
const Dashboard=({data})=>{
  const res=data.resumen;
  if(!res) return <div style={{color:"#475569",textAlign:"center",padding:40,fontSize:13}}>Toca 🔄 <b>Sincronizar</b> para cargar los datos desde Google Sheets</div>;

  const {flota,venta,diesel,otif,cajas,entregas,coordinadores,gastosTotal,weekDates:wd}=res;
  const KPI=({label,val,color,icon,sub})=>(<div style={{background:"#0a1628",border:`1px solid ${color}30`,borderRadius:11,padding:"14px 16px",position:"relative",overflow:"hidden"}}><div style={{position:"absolute",top:0,left:0,right:0,height:2,background:color}}/><div style={{fontSize:16}}>{icon}</div><div style={{fontSize:22,fontWeight:900,color,lineHeight:1.1,marginTop:4}}>{val}</div><div style={{fontSize:10,color:"#64748b",textTransform:"uppercase",letterSpacing:.8,marginTop:2}}>{label}</div>{sub&&<div style={{fontSize:10,color:"#334155",marginTop:2}}>{sub}</div>}</div>);

  return(
    <div style={{display:"flex",flexDirection:"column",gap:18}}>
      <div>
        <div style={{color:"#475569",fontSize:11,letterSpacing:2,textTransform:"uppercase"}}>Torre de Control · Sem {res.weekDates?.[0]?.slice(0,4)&&Math.ceil((new Date()-new Date(new Date().getFullYear(),0,1))/604800000)} · {flota?.fecha}</div>
        <div style={{color:"#f1f5f9",fontSize:20,fontWeight:900,marginTop:2}}>Nacional Autotransporte</div>
        <div style={{color:"#334155",fontSize:10,marginTop:2}}>Datos al: {flota?.fecha} · {flota?.total||0} unidades activas</div>
      </div>

      {/* Entregas vencidas */}
      {entregas?.totalVencidas>0&&(
        <div style={{background:"#1f0a0a",border:"1px solid #ef444450",borderLeft:"4px solid #ef4444",borderRadius:9,padding:"12px 14px"}}>
          <div style={{color:"#ef4444",fontWeight:700,fontSize:13,marginBottom:6}}>🔴 {entregas.totalVencidas} entregas VENCIDAS — {entregas.pctCumplimiento}% cumplimiento OTIF</div>
          <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
            {entregas.vencidas.slice(0,4).map((v,i)=>(
              <div key={i} style={{background:"#2d0a0a",borderRadius:7,padding:"6px 10px",fontSize:10}}>
                <span style={{color:"#f1f5f9",fontWeight:700}}>🚛 {v.unidad}</span>
                <span style={{color:"#ef4444",marginLeft:6}}>{v.cliente}</span>
                <span style={{color:"#64748b",marginLeft:6}}>{v.circuito}</span>
                <span style={{color:cc(v.coordinador),marginLeft:6,fontSize:9}}>{v.coordinador?.split(" ")[0]}</span>
              </div>
            ))}
            {entregas.totalVencidas>4&&<span style={{color:"#64748b",fontSize:10}}>+{entregas.totalVencidas-4} más</span>}
          </div>
        </div>
      )}

      {/* Utilización */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        <div style={{background:"#0a1628",border:"1px solid #3b82f630",borderRadius:11,padding:14}}>
          <div style={{fontSize:11,color:"#64748b",textTransform:"uppercase",letterSpacing:.8,marginBottom:8}}>🚛 Utilización Flota · {flota?.fecha}</div>
          <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:8}}>
            <div style={{flex:1}}>
              <div style={{height:8,background:"#1e293b",borderRadius:4,overflow:"hidden"}}>
                <div style={{height:"100%",width:`${flota?.pctUtilizacion||0}%`,background:"#10b981",borderRadius:4,transition:"width .4s"}}/>
              </div>
            </div>
            <span style={{color:"#10b981",fontWeight:900,fontSize:20}}>{flota?.pctUtilizacion||0}%</span>
          </div>
          <div style={{color:"#475569",fontSize:10,marginBottom:8}}>{flota?.enOperacion||0} en operación / {flota?.total||0} total</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:4}}>
            {[["VTA",flota?.resumen?.VTA||0,"#10b981"],["TRN",flota?.resumen?.TRN||0,"#3b82f6"],["MOV",flota?.resumen?.MOV||0,"#10b981"],["DCO",flota?.resumen?.DCO||0,"#3b82f6"],["DSO",flota?.resumen?.DSO||0,"#64748b"],["LIB",flota?.resumen?.LIB||0,"#a855f7"],["CP",flota?.resumen?.CP||0,"#f59e0b"],["RM",flota?.resumen?.RM||0,"#ef4444"],["SG",flota?.resumen?.SG||0,"#ef4444"],["SO",flota?.resumen?.SO||0,"#64748b"],["IND",flota?.resumen?.IND||0,"#ef4444"],["PER",flota?.resumen?.PER||0,"#a855f7"]].map(([l,v,col])=>(
              <div key={l} style={{background:col+"15",borderRadius:5,padding:"4px",textAlign:"center"}}>
                <div style={{color:col,fontWeight:900,fontSize:14}}>{v}</div>
                <div style={{color:"#475569",fontSize:8}}>{l}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{background:"#0a1628",border:"1px solid #10b98130",borderRadius:11,padding:14}}>
          <div style={{fontSize:11,color:"#64748b",textTransform:"uppercase",letterSpacing:.8,marginBottom:8}}>📦 Utilización Cajas · {cajas?.total||0} total</div>
          <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:8}}>
            <div style={{flex:1}}>
              <div style={{height:8,background:"#1e293b",borderRadius:4,overflow:"hidden"}}>
                <div style={{height:"100%",width:`${cajas?.pctCargadas||0}%`,background:"#10b981",borderRadius:4,transition:"width .4s"}}/>
              </div>
            </div>
            <span style={{color:"#10b981",fontWeight:900,fontSize:20}}>{cajas?.pctCargadas||0}%</span>
          </div>
          <div style={{color:"#475569",fontSize:10,marginBottom:8}}>{cajas?.resumen?.Cargada||0} cargadas de {cajas?.total||0}</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:4}}>
            {[["Cargadas",cajas?.resumen?.Cargada||0,"#10b981"],["Disponibles",cajas?.resumen?.Disponible||0,"#3b82f6"],["En tránsito",cajas?.resumen?.Transito||0,"#6366f1"],["Dañadas",cajas?.resumen?.Dañada||0,"#ef4444"],["No loc.",cajas?.resumen?.NoLocalizada||0,"#f97316"],["Vacías",cajas?.resumen?.Vacia||0,"#64748b"],["Siniestro",cajas?.resumen?.Siniestro||0,"#ef4444"],["Venta",cajas?.resumen?.Venta||0,"#64748b"],["TOTAL",cajas?.total||0,"#f1f5f9"]].map(([l,v,col])=>(
              <div key={l} style={{background:col+"15",borderRadius:5,padding:"4px",textAlign:"center"}}>
                <div style={{color:col,fontWeight:900,fontSize:14}}>{v}</div>
                <div style={{color:"#475569",fontSize:8}}>{l}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Venta del día */}
      <div style={{background:"#0a1628",border:"1px solid #10b98130",borderRadius:11,padding:14}}>
        <div style={{fontSize:11,color:"#64748b",textTransform:"uppercase",letterSpacing:.8,marginBottom:10}}>💵 Venta del Día ({venta?.latestDate}) — Estatus Diario</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,textAlign:"center",marginBottom:12}}>
          {[["TELLO","Tello",C.TELLO],["CRISTIAN","Cristian",C.CRISTIAN],["JULIO","Julio",C.JULIO],["TOTAL","TOTAL","#f1f5f9"]].map(([k,l,col])=>(
            <div key={k} style={{background:col+"10",borderRadius:8,padding:"10px 6px"}}>
              <div style={{color:col,fontWeight:900,fontSize:l==="TOTAL"?18:14}}>{fmt$(venta?.hoy?.[k]||0)}</div>
              <div style={{color:"#475569",fontSize:9,marginTop:2}}>{l}</div>
              <div style={{color:"#334155",fontSize:8,marginTop:1}}>Sem: {fmt$(venta?.semana?.[k]||0)}</div>
            </div>
          ))}
        </div>
        {/* Meta */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:12}}>
          {[["TELLO","Tello",C.TELLO],["CRISTIAN","Cristian",C.CRISTIAN],["JULIO","Julio",C.JULIO]].map(([k,l,col])=>(
            <div key={k}>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:9,color:"#64748b",marginBottom:2}}>
                <span>{l}</span><span style={{color:col,fontWeight:700}}>{venta?.cumpl?.[k]||0}%</span>
              </div>
              {pBar(venta?.cumpl?.[k]||0,null,6)}
              <div style={{color:"#334155",fontSize:8,marginTop:1}}>Meta: {fmt$(res?.meta?.[k]||0)}</div>
            </div>
          ))}
        </div>
        {/* Gráfica tendencia */}
        <LineChart data={venta?.diasSemana||[]} keys={["TELLO","CRISTIAN","JULIO"]} colors={[C.TELLO,C.CRISTIAN,C.JULIO]} labelKey="dia" height={85} title="Tendencia diaria por coordinador"/>
      </div>

      {/* OTIF */}
      <div style={{background:"#0a1628",border:"1px solid #6366f130",borderRadius:11,padding:14}}>
        <div style={{fontSize:11,color:"#64748b",textTransform:"uppercase",letterSpacing:.8,marginBottom:10}}>🎯 OTIF — Cumplimiento de Entregas</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,textAlign:"center"}}>
          {[["% OTIF",`${otif?.pct||0}%`,+otif?.pct>=85?"#10b981":"#ef4444","Meta 85%"],["A Tiempo",otif?.onTime||0,"#10b981","entregas"],["Tardías",otif?.late||0,"#ef4444","entregas"],["Sin Fecha",otif?.sinFecha||0,"#64748b","falta cita"]].map(([l,v,col,sub])=>(
            <div key={l} style={{background:col+"10",borderRadius:8,padding:"10px 6px",textAlign:"center"}}>
              <div style={{color:col,fontWeight:900,fontSize:l==="% OTIF"?20:16}}>{v}</div>
              <div style={{color:"#64748b",fontSize:9,marginTop:2}}>{l}</div>
              <div style={{color:"#334155",fontSize:8}}>{sub}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Diesel */}
      <div style={{background:"#0a1628",border:"1px solid #f59e0b30",borderRadius:11,padding:14}}>
        <div style={{fontSize:11,color:"#64748b",textTransform:"uppercase",letterSpacing:.8,marginBottom:10}}>⛽ Diesel Semana (78 unidades activas)</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,textAlign:"center"}}>
          {[["Costo Total",fmt$(diesel?.total||0),"#f59e0b"],["Litros",(diesel?.litros||0)>0?`${((diesel?.litros||0)/1000).toFixed(1)}K L`:"—","#6366f1"],["Unidades registradas",diesel?.registros||0+" reg","#64748b"]].map(([l,v,col])=>(
            <div key={l} style={{background:col+"10",borderRadius:8,padding:"10px 6px"}}>
              <div style={{color:col,fontWeight:900,fontSize:14}}>{v}</div>
              <div style={{color:"#475569",fontSize:9,marginTop:2}}>{l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* KPIs por coordinador */}
      <div style={{color:"#475569",fontSize:11,textTransform:"uppercase",letterSpacing:1}}>👥 KPIs por Coordinador</div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:12}}>
        {["TELLO","CRISTIAN","JULIO"].map(k=>{
          const c=coordinadores?.[k]; if(!c) return null;
          const col=C[k];
          return(
            <div key={k} style={{background:"#0a1628",border:`1px solid ${col}30`,borderRadius:12,padding:14}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
                <div style={{width:10,height:10,borderRadius:"50%",background:col,boxShadow:`0 0 8px ${col}`}}/>
                <div style={{color:"#f1f5f9",fontWeight:800,fontSize:14}}>{c.nombre}</div>
                <div style={{marginLeft:"auto",background:col+"20",color:col,borderRadius:6,padding:"2px 8px",fontSize:12,fontWeight:700}}>{c.eficiencia}% ef.</div>
              </div>
              {/* Venta */}
              <div style={{marginBottom:8}}>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:10,marginBottom:3}}>
                  <span style={{color:"#64748b"}}>Venta hoy</span><span style={{color:col,fontWeight:700}}>{fmt$(c.ventaHoy)}</span>
                </div>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:10,marginBottom:3}}>
                  <span style={{color:"#64748b"}}>Venta semana</span><span style={{color:col,fontWeight:700}}>{fmt$(c.ventaSemana)}</span>
                </div>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:10,marginBottom:4}}>
                  <span style={{color:"#64748b"}}>Meta</span><span style={{color:"#334155"}}>{fmt$(c.metaSemana)}</span>
                </div>
                {pBar(c.cumplMeta)}
                <div style={{color:"#334155",fontSize:8,marginTop:2,textAlign:"right"}}>{c.cumplMeta}% de meta</div>
              </div>
              {/* Unidades */}
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:4,marginBottom:8}}>
                {[["Activas",c.activas,"#10b981"],["DCO",c.dco,"#3b82f6"],["DSO",c.dso,"#64748b"],["LIB",c.lib,"#a855f7"],["SO/Vac",c.so,"#64748b"],["MTTO",c.mtto,"#f59e0b"]].map(([l,v,col2])=>(
                  <div key={l} style={{background:col2+"15",borderRadius:5,padding:"4px",textAlign:"center"}}>
                    <div style={{color:col2,fontWeight:900,fontSize:14}}>{v}</div>
                    <div style={{color:"#475569",fontSize:8}}>{l}</div>
                  </div>
                ))}
              </div>
              {/* Cajas */}
              <div style={{borderTop:"1px solid #1e293b",paddingTop:8,marginTop:4}}>
                <div style={{color:"#475569",fontSize:9,textTransform:"uppercase",letterSpacing:.8,marginBottom:4}}>📦 {c.totalCajas} cajas</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:3}}>
                  {[["Cargadas",c.cajasCargadas,"#10b981"],["Disponibles",c.cajasDisponibles,"#3b82f6"],["Dañadas",c.cajasDañadas,"#ef4444"],["No loc.",c.cajasNoLocaliz,"#f97316"]].map(([l,v,col2])=>(
                    <div key={l} style={{textAlign:"center"}}>
                      <div style={{color:col2,fontWeight:700,fontSize:13}}>{v}</div>
                      <div style={{color:"#475569",fontSize:7}}>{l}</div>
                    </div>
                  ))}
                </div>
              </div>
              {/* Vacantes */}
              {c.unidadesVacantes?.length>0&&(
                <div style={{marginTop:8,background:"#64748b15",borderRadius:7,padding:"6px 8px"}}>
                  <div style={{color:"#64748b",fontSize:9,marginBottom:3}}>⚠️ Vacantes: {c.unidadesVacantes.map(u=>u.unidad).join(", ")}</div>
                </div>
              )}
              {/* Circuitos */}
              {c.circuitos?.length>0&&<div style={{marginTop:8,fontSize:9,color:"#334155"}}>Circuitos: <span style={{color:col}}>{c.circuitos.join(" · ")}</span></div>}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ─── MANTENIMIENTO ────────────────────────────────────────────────────────────
const Mantenimiento=({data})=>{
  const res=data.resumen;
  const [selTab,setSelTab]=useState("CP");
  if(!res) return <div style={{color:"#475569",textAlign:"center",padding:40}}>Sincroniza para cargar datos</div>;
  const grupos=res.flota?.grupos||{};
  const CONF=[
    {k:"CP",l:"CP — Correctivo/Preventivo",col:"#f59e0b",ic:"🔧",desc:"Correctivo preventivo en taller"},
    {k:"RM",l:"RM — Reparación Mayor",col:"#ef4444",ic:"🔩",desc:"Reparación mayor — fuera de operación"},
    {k:"SG",l:"SG — Siniestro/Garantía",col:"#ef4444",ic:"💥",desc:"Siniestro o reparación en garantía"},
    {k:"SO",l:"SO — Sin Operador",col:"#64748b",ic:"👤",desc:"Unidad sin operador asignado"},
    {k:"IND",l:"IND — Indisciplina",col:"#ef4444",ic:"⚠️",desc:"Sanción por indisciplina"},
    {k:"PER",l:"PER — Permiso",col:"#a855f7",ic:"📋",desc:"Operador con permiso autorizado"},
    {k:"DSO",l:"DSO — Disponible s/Op",col:"#64748b",ic:"🔵",desc:"Disponible sin operador asignado"},
    {k:"DCO",l:"DCO — Disponible c/Op",col:"#3b82f6",ic:"🔵",desc:"Disponible con operador"},
    {k:"LIB",l:"LIB — Por Liberar",col:"#a855f7",ic:"🔓",desc:"Unidad por liberar"},
    {k:"VTA",l:"VTA — Facturando",col:"#10b981",ic:"💰",desc:"En ruta facturando"},
    {k:"TRN",l:"TRN — En Tránsito",col:"#3b82f6",ic:"🔄",desc:"En tránsito hacia destino"},
    {k:"MOV",l:"MOV — En Movimiento",col:"#10b981",ic:"🚛",desc:"En movimiento operativo"},
  ];
  const cfg=CONF.find(c=>c.k===selTab)||CONF[0];
  const filas=grupos[selTab]||[];
  return(
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      <div style={{background:"#0a1628",border:"1px solid #1e3a5f",borderRadius:8,padding:"8px 12px",fontSize:11,color:"#3b82f6"}}>
        ℹ️ Fecha: <b>{res?.flota?.fecha}</b> · 78 unidades desde Estatus_diario · Mtto = CP + RM + SG
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(80px,1fr))",gap:5}}>
        {CONF.map(c=>(
          <div key={c.k} onClick={()=>setSelTab(c.k)} style={{background:selTab===c.k?c.col+"30":c.col+"15",border:`1px solid ${c.col}${selTab===c.k?"80":"33"}`,borderRadius:8,padding:"8px 6px",cursor:"pointer",textAlign:"center",transition:"all .15s"}}>
            <div style={{fontSize:14}}>{c.ic}</div>
            <div style={{color:c.col,fontWeight:900,fontSize:18}}>{(grupos[c.k]||[]).length}</div>
            <div style={{color:"#475569",fontSize:8,textTransform:"uppercase"}}>{c.k}</div>
          </div>
        ))}
      </div>
      <div style={{background:"#0a1628",border:`1px solid ${cfg.col}30`,borderRadius:11,padding:14}}>
        <div style={{color:cfg.col,fontWeight:700,fontSize:13,marginBottom:4}}>{cfg.ic} {cfg.l} — {filas.length} unidades</div>
        <div style={{color:"#475569",fontSize:10,marginBottom:10}}>{cfg.desc}</div>
        {filas.length===0?<div style={{color:"#334155",textAlign:"center",padding:16}}>Sin unidades en esta categoría</div>:(
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
              <thead><tr style={{borderBottom:"2px solid #1e293b"}}>{["Unidad","Operador","Coordinador","Motivo","Ruta / Detalle","Comentarios"].map(h=><th key={h} style={{textAlign:"left",padding:"8px 10px",color:"#475569",fontSize:10,textTransform:"uppercase"}}>{h}</th>)}</tr></thead>
              <tbody>{filas.map((e,i)=>(
                <tr key={e.unidad+i} style={{borderBottom:"1px solid #0d1626",background:i%2===0?"#080e1c":"transparent"}}>
                  <td style={{padding:"9px 10px",color:"#f1f5f9",fontWeight:800,fontFamily:"monospace"}}>{e.unidad}</td>
                  <td style={{padding:"9px 10px",color:"#94a3b8",maxWidth:150,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{e.operador}</td>
                  <td style={{padding:"9px 10px"}}><span style={{color:cc(e.coordinador),fontWeight:700,fontSize:11}}>{e.coordinador?.split(" ")[0]}</span></td>
                  <td style={{padding:"9px 10px"}}><Badge text={e.motivo} small/></td>
                  <td style={{padding:"9px 10px",color:"#64748b",fontSize:10,maxWidth:140,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{e.ruta}</td>
                  <td style={{padding:"9px 10px",color:"#94a3b8",fontWeight:600,fontSize:11,maxWidth:180,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{e.comentarios||"—"}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── DISTRIBUCIÓN ─────────────────────────────────────────────────────────────
const Distribucion=({data})=>{
  const res=data.resumen;
  if(!res) return <div style={{color:"#475569",textAlign:"center",padding:40}}>Sincroniza para cargar datos</div>;
  const {flota,coordinadores}=res;
  const grupos=flota?.grupos||{};
  // Build circuito map from ruta field
  const circMap={};
  Object.values(grupos).flat().forEach(e=>{
    const c=e.ruta||"Sin ruta";
    if(!circMap[c])circMap[c]={total:0,enRuta:0,disp:0,mtto:0,sinOp:0};
    circMap[c].total++;
    const m=(e.motivo||"").toUpperCase();
    if(m.includes("VTA")||m.includes("TRN")||m.includes("MOV"))circMap[c].enRuta++;
    else if(m.includes("DCO")||m.includes("DSO")||m.includes("LIB"))circMap[c].disp++;
    else if(m.includes("CP")||m.includes("RM")||m.includes("SG"))circMap[c].mtto++;
    else circMap[c].sinOp++;
  });
  return(
    <div style={{display:"flex",flexDirection:"column",gap:20}}>
      <div style={{color:"#475569",fontSize:10,textTransform:"uppercase",letterSpacing:1}}>Datos del {flota?.fecha} — {flota?.total} unidades · VTA+TRN+MOV = {(flota?.resumen?.VTA||0)+(flota?.resumen?.TRN||0)+(flota?.resumen?.MOV||0)} en operación</div>
      {/* Por coordinador */}
      <div>
        <div style={{color:"#475569",fontSize:11,textTransform:"uppercase",letterSpacing:1.5,marginBottom:10}}>👥 Por Coordinador</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:10}}>
          {["TELLO","CRISTIAN","JULIO"].map(k=>{
            const c=coordinadores?.[k]; if(!c) return null;
            const col=C[k];
            return(
              <div key={k} style={{background:"#0a1628",border:`1px solid ${col}30`,borderRadius:12,padding:16}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
                  <div style={{width:10,height:10,borderRadius:"50%",background:col,boxShadow:`0 0 8px ${col}`}}/>
                  <div style={{color:"#f1f5f9",fontWeight:800,fontSize:14}}>{c.nombre}</div>
                  <div style={{marginLeft:"auto",background:col+"20",color:col,borderRadius:6,padding:"2px 8px",fontSize:12,fontWeight:700}}>{c.totalUnidades}</div>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6,textAlign:"center",marginBottom:12}}>
                  {[["Activas",c.activas,"#10b981"],["DCO",c.dco,"#3b82f6"],["Mtto",c.mtto,"#f59e0b"],["Sin Op",c.so,"#64748b"]].map(([l,v,col2])=>(
                    <div key={l} style={{background:col2+"15",borderRadius:7,padding:"6px 4px"}}>
                      <div style={{color:col2,fontWeight:900,fontSize:18}}>{v}</div>
                      <div style={{color:"#475569",fontSize:9,textTransform:"uppercase"}}>{l}</div>
                    </div>
                  ))}
                </div>
                <div style={{borderTop:"1px solid #1e293b",paddingTop:8,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div style={{fontSize:9,color:"#64748b"}}>Eficiencia: <span style={{color:col,fontWeight:700}}>{c.eficiencia}%</span></div>
                  <div style={{background:"#0d1626",borderRadius:7,padding:"4px 10px",textAlign:"center"}}>
                    <div style={{color:col,fontWeight:900,fontSize:14}}>{fmt$(c.ventaHoy)}</div>
                    <div style={{color:"#475569",fontSize:8}}>Hoy</div>
                  </div>
                </div>
                {c.circuitos?.length>0&&<div style={{marginTop:8,fontSize:9,color:"#334155"}}>Circuitos: <span style={{color:col}}>{c.circuitos.join(" · ")}</span></div>}
              </div>
            );
          })}
        </div>
      </div>
      {/* Por circuito/ruta */}
      <div>
        <div style={{color:"#475569",fontSize:11,textTransform:"uppercase",letterSpacing:1.5,marginBottom:10}}>🔁 Por Ruta (desde Estatus_diario · NombreRuta)</div>
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
            <thead><tr style={{borderBottom:"2px solid #1e293b"}}>{["Ruta / Circuito","Total","En Ruta","Disponible","Mtto","Sin Op","% Operando","Siguiente"].map(h=><th key={h} style={{textAlign:"left",padding:"8px 12px",color:"#475569",fontSize:10,textTransform:"uppercase",whiteSpace:"nowrap"}}>{h}</th>)}</tr></thead>
            <tbody>{Object.entries(circMap).filter(([c])=>c&&c!=="Sin ruta"&&c!=="").sort((a,b)=>b[1].total-a[1].total).map(([circ,v],i)=>{
              const pct=v.total>0?(((v.enRuta+v.disp)/v.total)*100).toFixed(0):0;
              const cfg=CIRC[circ];
              return(
                <tr key={circ} style={{borderBottom:"1px solid #0d1626",background:i%2===0?"#080e1c":"transparent"}}>
                  <td style={{padding:"10px 12px",color:"#f1f5f9",fontWeight:700,maxWidth:160,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{circ}</td>
                  <td style={{padding:"10px 12px",color:"#94a3b8",fontWeight:700}}>{v.total}</td>
                  <td style={{padding:"10px 12px"}}><span style={{color:"#10b981",fontWeight:700}}>{v.enRuta}</span></td>
                  <td style={{padding:"10px 12px"}}><span style={{color:"#3b82f6",fontWeight:700}}>{v.disp}</span></td>
                  <td style={{padding:"10px 12px"}}><span style={{color:"#f59e0b",fontWeight:700}}>{v.mtto}</span></td>
                  <td style={{padding:"10px 12px"}}><span style={{color:"#64748b",fontWeight:700}}>{v.sinOp}</span></td>
                  <td style={{padding:"10px 12px"}}>
                    <div style={{display:"flex",alignItems:"center",gap:6}}>
                      <div style={{flex:1,height:5,background:"#1e293b",borderRadius:3,overflow:"hidden"}}>
                        <div style={{height:"100%",width:`${pct}%`,background:+pct>=70?"#10b981":+pct>=40?"#f59e0b":"#ef4444",borderRadius:3}}/>
                      </div>
                      <span style={{color:+pct>=70?"#10b981":+pct>=40?"#f59e0b":"#ef4444",fontWeight:700,fontSize:11,minWidth:28}}>{pct}%</span>
                    </div>
                  </td>
                  <td style={{padding:"10px 12px",color:cfg?cfg.color:"#475569",fontSize:10}}>{cfg?"➡️ "+cfg.siguiente:"—"}</td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// ─── TRACTOS (UNIDADES) ───────────────────────────────────────────────────────
const Tractos=({data})=>{
  const res=data.resumen;
  const [q,setQ]=useState(""); const [coordFil,setCoordFil]=useState(""); const [mFil,setMFil]=useState("");
  if(!res) return <div style={{color:"#475569",textAlign:"center",padding:40}}>Sincroniza para cargar datos</div>;
  const grupos=res.flota?.grupos||{};
  const venta=res.venta;
  const allUnidades=Object.values(grupos).flat();
  const lista=allUnidades.filter(e=>{
    const tx=q.toLowerCase();
    return(!q||(e.unidad+e.operador+e.ruta+e.comentarios).toLowerCase().includes(tx))
      &&(!coordFil||ck(e.coordinador)===coordFil)
      &&(!mFil||(e.motivo||"").toUpperCase().includes(mFil));
  });
  return(
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      {/* Venta del día por coordinador */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,textAlign:"center"}}>
        {[["TELLO","Tello",C.TELLO],["CRISTIAN","Cristian",C.CRISTIAN],["JULIO","Julio",C.JULIO],["TOTAL","Total","#f1f5f9"]].map(([k,l,col])=>(
          <div key={k} style={{background:col+"10",border:`1px solid ${col}30`,borderRadius:9,padding:"10px 6px"}}>
            <div style={{color:col,fontWeight:900,fontSize:14}}>{fmt$(venta?.hoy?.[k]||0)}</div>
            <div style={{color:"#475569",fontSize:9,marginTop:2}}>💵 {l} hoy</div>
            <div style={{color:"#334155",fontSize:8}}>Sem: {fmt$(venta?.semana?.[k]||0)}</div>
          </div>
        ))}
      </div>
      <div style={{background:"#0a1628",border:"1px solid #1e3a5f",borderRadius:8,padding:"8px 12px",fontSize:11,color:"#3b82f6"}}>
        ℹ️ {allUnidades.length} unidades del {res.flota?.fecha} — desde Estatus_diario
      </div>
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
        <input placeholder="🔍 Buscar unidad, operador..." value={q} onChange={e=>setQ(e.target.value)} style={{flex:1,minWidth:180,background:"#0a1628",border:"1px solid #1e293b",borderRadius:8,padding:"8px 12px",color:"#f1f5f9",fontSize:12,outline:"none"}}/>
        <select value={coordFil} onChange={e=>setCoordFil(e.target.value)} style={{background:"#0a1628",border:"1px solid #1e293b",borderRadius:8,padding:"8px 10px",color:"#f1f5f9",fontSize:12,outline:"none"}}>
          <option value="">Todos</option><option value="TELLO">Tello</option><option value="CRISTIAN">Cristian</option><option value="JULIO">Julio</option>
        </select>
        <select value={mFil} onChange={e=>setMFil(e.target.value)} style={{background:"#0a1628",border:"1px solid #1e293b",borderRadius:8,padding:"8px 10px",color:"#f1f5f9",fontSize:12,outline:"none"}}>
          <option value="">Todos</option><option value="VTA">VTA</option><option value="TRN">TRN</option><option value="DCO">DCO</option><option value="DSO">DSO</option><option value="LIB">LIB</option><option value="CP">CP</option><option value="RM">RM</option><option value="SG">SG</option><option value="SO">SO</option><option value="IND">IND</option><option value="PER">PER</option>
        </select>
        <button onClick={()=>dlCSV(toCSV(allUnidades,["unidad","operador","coordinador","motivo","ruta","monto","comentarios"]),"unidades.csv")} style={{background:"#1e3a2f",border:"1px solid #10b98144",borderRadius:8,padding:"8px 12px",color:"#10b981",fontSize:11,cursor:"pointer",fontWeight:700}}>⬇️ CSV</button>
      </div>
      <div style={{color:"#475569",fontSize:11}}>{lista.length} unidades</div>
      <div style={{overflowX:"auto"}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
          <thead><tr style={{borderBottom:"2px solid #1e293b"}}>{["Unidad","Operador","Coordinador","Motivo","Ruta","Monto","Comentarios"].map(h=><th key={h} style={{textAlign:"left",padding:"8px 10px",color:"#475569",fontSize:10,textTransform:"uppercase"}}>{h}</th>)}</tr></thead>
          <tbody>{lista.map((e,i)=>(
            <tr key={e.unidad+i} style={{borderBottom:"1px solid #0d1626",background:i%2===0?"#080e1c":"transparent"}}>
              <td style={{padding:"9px 10px",color:"#f1f5f9",fontWeight:800,fontFamily:"monospace"}}>{e.unidad}</td>
              <td style={{padding:"9px 10px",color:"#94a3b8",maxWidth:160,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{e.operador}</td>
              <td style={{padding:"9px 10px"}}><span style={{color:cc(e.coordinador),fontWeight:700,fontSize:11}}>{e.coordinador?.split(" ")[0]}</span></td>
              <td style={{padding:"9px 10px"}}><Badge text={e.motivo} small/></td>
              <td style={{padding:"9px 10px",color:"#64748b",fontSize:10,maxWidth:130,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{e.ruta}</td>
              <td style={{padding:"9px 10px",color:e.monto>0?"#10b981":"#334155",fontWeight:e.monto>0?700:400}}>{e.monto>0?fmt$(e.monto):"—"}</td>
              <td style={{padding:"9px 10px",color:"#94a3b8",fontWeight:600,fontSize:11,maxWidth:180,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{e.comentarios||"—"}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
};

// ─── CAJAS ────────────────────────────────────────────────────────────────────
const Cajas=({data,setData})=>{
  const [q,setQ]=useState(""); const [coordFil,setCoordFil]=useState(""); const [eFil,setEFil]=useState(""); const [patioFil,setPatioFil]=useState("");
  const [editando,setEditando]=useState(null); const [form,setForm]=useState({});
  const [showTotal,setShowTotal]=useState(false);
  const lista2=(data.cajasList||[]).filter(c=>{const tx=q.toLowerCase();return(!q||(c.Caja+c.Cliente+c["Ciudad / Ubicación"]).toLowerCase().includes(tx))&&(!coordFil||c.Coordinador?.toUpperCase().includes(coordFil))&&(!eFil||c.Estatus===eFil)&&(!patioFil||c["Ciudad / Ubicación"]===patioFil);});
  const resumen={};(data.cajasList||[]).forEach(c=>{resumen[c.Estatus]=(resumen[c.Estatus]||0)+1;});
  const patios=[...new Set((data.cajasList||[]).map(c=>c["Ciudad / Ubicación"]).filter(p=>p&&p!=="-"&&p!==""))].slice(0,12);
  const guardar=()=>{const updated={...data,cajasList:(data.cajasList||[]).map(c=>c.Caja===editando?{...c,...form}:c),lastSync:new Date().toISOString()};setData(updated);sd(updated);setEditando(null);if(USAR_SHEETS)apiPost("Control_Cajas",updated.cajasList);};
  const cajaRes=data.resumen?.cajas;
  return(
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      {/* Botón total */}
      <button onClick={()=>setShowTotal(!showTotal)} style={{background:"#1e3a5f",border:"1px solid #3b82f640",borderRadius:8,padding:"8px 14px",color:"#3b82f6",fontSize:12,cursor:"pointer",fontWeight:700,alignSelf:"flex-start"}}>
        📊 {showTotal?"Ocultar":"Ver"} Total de Cajas ({cajaRes?.total||0})
      </button>
      {showTotal&&cajaRes&&(
        <div style={{background:"#0a1628",border:"1px solid #3b82f630",borderRadius:11,padding:14}}>
          <div style={{color:"#f1f5f9",fontWeight:700,fontSize:13,marginBottom:10}}>📦 Resumen Total — {cajaRes.total} cajas</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(90px,1fr))",gap:6}}>
            {Object.entries(cajaRes.resumen||{}).map(([k,v])=>(
              <div key={k} style={{background:ec(k)+"15",border:`1px solid ${ec(k)}33`,borderRadius:8,padding:"8px",textAlign:"center"}}>
                <div style={{color:ec(k),fontWeight:900,fontSize:18}}>{v}</div>
                <div style={{color:"#475569",fontSize:9,textTransform:"uppercase"}}>{k}</div>
              </div>
            ))}
          </div>
        </div>
      )}
      {editando&&<Modal title={`Editar ${editando}`} onClose={()=>setEditando(null)}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          <Input label="Estatus" value={form.Estatus||""} onChange={v=>setForm(f=>({...f,Estatus:v}))} options={["Cargada","Disponible","En patio","En tránsito","Dañada","Siniestro","No localizada","Vacia","Venta"]}/>
          <Input label="Ciudad / Ubicación" value={form["Ciudad / Ubicación"]||""} onChange={v=>setForm(f=>({...f,"Ciudad / Ubicación":v}))}/>
          <Input label="Ubicación Específica" value={form["Ubicación Específica"]||""} onChange={v=>setForm(f=>({...f,"Ubicación Específica":v}))}/>
          <Input label="Cliente" value={form.Cliente||""} onChange={v=>setForm(f=>({...f,Cliente:v}))}/>
          <Input label="Coordinador" value={form.Coordinador||""} onChange={v=>setForm(f=>({...f,Coordinador:v}))} options={["Juan Jose Tello","Cristian Zuñiga","Julio Hernandez"]}/>
          <Input label="Comentarios" value={form.Comentarios||""} onChange={v=>setForm(f=>({...f,Comentarios:v}))}/>
        </div>
        <button onClick={guardar} style={{marginTop:14,width:"100%",background:"#3b82f6",border:"none",borderRadius:8,padding:"10px",color:"#fff",fontWeight:700,cursor:"pointer",fontSize:13}}>💾 Guardar {USAR_SHEETS?"+ Sync":""}</button>
      </Modal>}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(90px,1fr))",gap:6}}>
        {Object.entries(resumen).map(([k,v])=>(
          <div key={k} onClick={()=>setEFil(eFil===k?"":k)} style={{background:eFil===k?ec(k)+"30":ec(k)+"15",border:`1px solid ${ec(k)}${eFil===k?"80":"33"}`,borderRadius:8,padding:"8px 10px",cursor:"pointer",textAlign:"center"}}>
            <div style={{color:ec(k),fontWeight:900,fontSize:18}}>{v}</div>
            <div style={{color:"#475569",fontSize:9,textTransform:"uppercase",marginTop:2}}>{k}</div>
          </div>
        ))}
      </div>
      {patios.length>0&&<div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
        {patios.map(p=>{const cnt=(data.cajasList||[]).filter(c=>c["Ciudad / Ubicación"]===p).length;return<div key={p} onClick={()=>setPatioFil(patioFil===p?"":p)} style={{background:patioFil===p?"#1e3a5f":"#0a1628",border:`1px solid ${patioFil===p?"#3b82f6":"#1e293b"}`,borderRadius:7,padding:"5px 10px",cursor:"pointer",fontSize:11}}><span style={{color:"#3b82f6",fontWeight:700}}>{cnt}</span><span style={{color:"#475569",marginLeft:5}}>{p}</span></div>;})}
      </div>}
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
        <input placeholder="🔍 Buscar caja..." value={q} onChange={e=>setQ(e.target.value)} style={{flex:1,minWidth:180,background:"#0a1628",border:"1px solid #1e293b",borderRadius:8,padding:"8px 12px",color:"#f1f5f9",fontSize:12,outline:"none"}}/>
        <select value={coordFil} onChange={e=>setCoordFil(e.target.value)} style={{background:"#0a1628",border:"1px solid #1e293b",borderRadius:8,padding:"8px 10px",color:"#f1f5f9",fontSize:12,outline:"none"}}>
          <option value="">Todos</option><option value="TELLO">Tello</option><option value="CRISTIAN">Cristian</option><option value="JULIO">Julio</option>
        </select>
        <button onClick={()=>dlCSV(toCSV(data.cajasList||[],["Caja","Tipo","Coordinador","Ciudad / Ubicación","Ubicación Específica","Estatus","Cliente","Comentarios"]),"cajas.csv")} style={{background:"#1e3a2f",border:"1px solid #10b98144",borderRadius:8,padding:"8px 12px",color:"#10b981",fontSize:11,cursor:"pointer",fontWeight:700}}>⬇️ CSV</button>
      </div>
      <div style={{color:"#475569",fontSize:11}}>{lista2.length} de {(data.cajasList||[]).length} cajas</div>
      <div style={{overflowX:"auto"}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
          <thead><tr style={{borderBottom:"2px solid #1e293b"}}>{["Caja","Tipo","Coord","Ciudad","Específica","Estatus","Cliente","De quién","Comentarios",""].map(h=><th key={h} style={{textAlign:"left",padding:"8px 10px",color:"#475569",fontSize:10,textTransform:"uppercase",whiteSpace:"nowrap"}}>{h}</th>)}</tr></thead>
          <tbody>{lista2.map((c,i)=>(
            <tr key={(c.Caja||"")+i} style={{borderBottom:"1px solid #0d1626",background:i%2===0?"#080e1c":"transparent"}}>
              <td style={{padding:"9px 10px",color:"#f1f5f9",fontWeight:800,fontFamily:"monospace"}}>{c.Caja}</td>
              <td style={{padding:"9px 10px",color:"#64748b"}}>{c.Tipo}</td>
              <td style={{padding:"9px 10px"}}><span style={{color:cc(c.Coordinador||""),fontWeight:700,fontSize:11}}>{c.Coordinador?.split(" ")[0]}</span></td>
              <td style={{padding:"9px 10px",color:"#94a3b8",maxWidth:110,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c["Ciudad / Ubicación"]}</td>
              <td style={{padding:"9px 10px",color:"#64748b"}}>{c["Ubicación Específica"]}</td>
              <td style={{padding:"9px 10px"}}><Badge text={c.Estatus||""}/></td>
              <td style={{padding:"9px 10px",color:"#94a3b8",maxWidth:110,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.Cliente}</td>
              <td style={{padding:"9px 10px",color:"#64748b",fontSize:10}}>{c["De quion es cliente"]}</td>
              <td style={{padding:"9px 10px",color:"#94a3b8",fontWeight:600,fontSize:11,maxWidth:160,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.Comentarios||"—"}</td>
              <td style={{padding:"9px 10px"}}><button onClick={()=>{setEditando(c.Caja);setForm({...c});}} style={{background:"#1e293b",border:"none",borderRadius:6,padding:"4px 10px",color:"#94a3b8",cursor:"pointer",fontSize:11}}>✏️</button></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
};

// ─── VIAJES ───────────────────────────────────────────────────────────────────
const Viajes=({data})=>{
  const [q,setQ]=useState(""); const [coordFil,setCoordFil]=useState(""); const [showOTIF,setShowOTIF]=useState(false);
  const viajes=(data.viajesList||[]).filter(v=>{const t=q.toLowerCase();return(!q||(String(v.Unidad)+v.Cliente+v.Coordinador+v.Caja).toLowerCase().includes(t))&&(!coordFil||ck(v.Coordinador)===coordFil);});
  const otif=data.resumen?.otif;
  const $v=(v)=>$n(v["Venta real"]||v["Venta estimada"]||0);
  const realizados=viajes.filter(v=>["Finalizado","Entregado","TERMINADO"].some(s=>(v["Estatus viaje"]||"").includes(s)));
  const totV=realizados.reduce((s,v)=>s+$v(v),0);
  const totC=realizados.reduce((s,v)=>s+$n(v.Comisiones)+$n(v.Casetas)+$n(v["Costo mantenimiento"]),0);
  return(
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      {/* OTIF summary */}
      <div style={{background:"#0a1628",border:"1px solid #6366f130",borderRadius:11,padding:12}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
          <div style={{color:"#6366f1",fontWeight:700,fontSize:13}}>🎯 OTIF — {otif?.pct||0}% cumplimiento</div>
          <button onClick={()=>setShowOTIF(!showOTIF)} style={{background:"#1e293b",border:"none",borderRadius:6,padding:"4px 10px",color:"#94a3b8",fontSize:11,cursor:"pointer"}}>{showOTIF?"Ocultar":"Ver detalle"}</button>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6,textAlign:"center"}}>
          {[[`${otif?.pct||0}%`,"OTIF",+otif?.pct>=85?"#10b981":"#ef4444"],[otif?.onTime||0,"A tiempo","#10b981"],[otif?.late||0,"Tardías","#ef4444"],[otif?.sinFecha||0,"Sin fecha","#64748b"]].map(([v,l,col])=>(
            <div key={l} style={{background:col+"10",borderRadius:7,padding:"8px 4px"}}>
              <div style={{color:col,fontWeight:900,fontSize:l==="OTIF"?18:14}}>{v}</div>
              <div style={{color:"#475569",fontSize:9}}>{l}</div>
            </div>
          ))}
        </div>
        {showOTIF&&otif?.detalle?.length>0&&(
          <div style={{marginTop:10,overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
              <thead><tr style={{borderBottom:"1px solid #1e293b"}}>{["Unidad","Cliente","Coordinador","Cita","Descarga","OTIF","Motivo"].map(h=><th key={h} style={{textAlign:"left",padding:"5px 8px",color:"#475569",fontSize:9,textTransform:"uppercase"}}>{h}</th>)}</tr></thead>
              <tbody>{otif.detalle.slice(0,10).map((d,i)=>(
                <tr key={i} style={{borderBottom:"1px solid #0d1626"}}>
                  <td style={{padding:"5px 8px",color:"#f1f5f9",fontFamily:"monospace",fontWeight:700}}>{d.unidad}</td>
                  <td style={{padding:"5px 8px",color:"#94a3b8",maxWidth:90,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{d.cliente}</td>
                  <td style={{padding:"5px 8px"}}><span style={{color:cc(d.coordinador),fontSize:10}}>{d.coordinador?.split(" ")[0]}</span></td>
                  <td style={{padding:"5px 8px",color:"#64748b"}}>{d.citaDescarga}</td>
                  <td style={{padding:"5px 8px",color:"#64748b"}}>{d.fechaDescarga}</td>
                  <td style={{padding:"5px 8px"}}><span style={{color:d.otif?.includes("✅")?"#10b981":"#ef4444",fontWeight:700,fontSize:10}}>{d.otif}</span></td>
                  <td style={{padding:"5px 8px",color:"#94a3b8",fontWeight:600,fontSize:10,maxWidth:120,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{d.motivo||"—"}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </div>
      {realizados.length>0&&<div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
        {[["💵 Venta",fmt$(totV),"#10b981"],["📉 Costo",fmt$(totC),"#f59e0b"],["📊 Utilidad",fmt$(totV-totC),(totV-totC)>=0?"#10b981":"#ef4444"]].map(([l,v,c])=>(
          <div key={l} style={{background:"#0a1628",border:`1px solid ${c}30`,borderRadius:10,padding:"12px 14px"}}>
            <div style={{color:c,fontWeight:900,fontSize:18}}>{v}</div>
            <div style={{color:"#475569",fontSize:10}}>{l}</div>
            <div style={{color:"#334155",fontSize:8,marginTop:2}}>*Diesel se integra desde CARGAS_DIESEL</div>
          </div>
        ))}
      </div>}
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
        <input placeholder="🔍 Buscar..." value={q} onChange={e=>setQ(e.target.value)} style={{flex:1,minWidth:160,background:"#0a1628",border:"1px solid #1e293b",borderRadius:8,padding:"8px 12px",color:"#f1f5f9",fontSize:12,outline:"none"}}/>
        <select value={coordFil} onChange={e=>setCoordFil(e.target.value)} style={{background:"#0a1628",border:"1px solid #1e293b",borderRadius:8,padding:"8px 10px",color:"#f1f5f9",fontSize:12,outline:"none"}}>
          <option value="">Todos</option><option value="TELLO">Tello</option><option value="CRISTIAN">Cristian</option><option value="JULIO">Julio</option>
        </select>
        <button onClick={()=>dlCSV(toCSV(data.viajesList||[],["Semana","Fecha","Coordinador","Unidad","Caja","Cliente","Origen","Destino","Estatus viaje","Km cargados","Venta real","Cita descarga","Fecha descarga","Observaciones"]),"viajes.csv")} style={{background:"#1e3a2f",border:"1px solid #10b98144",borderRadius:8,padding:"8px 12px",color:"#10b981",fontSize:11,cursor:"pointer",fontWeight:700}}>⬇️ CSV</button>
      </div>
      <div style={{overflowX:"auto"}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
          <thead><tr style={{borderBottom:"2px solid #1e293b"}}>{["Sem","Coord","Unidad","Caja","Cliente","Origen","Destino","Estatus","Km","Venta Real","Circuito","Salida","Carga","Descarga","Entrega","OTIF"].map(h=><th key={h} style={{textAlign:"left",padding:"8px 10px",color:"#475569",fontSize:10,textTransform:"uppercase",whiteSpace:"nowrap"}}>{h}</th>)}</tr></thead>
          <tbody>{viajes.map((v,i)=>{
            const entregado=["finalizado","entregado","terminado"].some(s=>(v["Estatus viaje"]||"").toLowerCase().includes(s));
            const otifVal=entregado?"✅":"—";
            return(
              <tr key={i} style={{borderBottom:"1px solid #0d1626",background:i%2===0?"#080e1c":"transparent"}}>
                <td style={{padding:"9px 10px",color:"#64748b"}}>{v.Semana}</td>
                <td style={{padding:"9px 10px"}}><span style={{color:cc(v.Coordinador||""),fontWeight:700,fontSize:11}}>{v.Coordinador?.split(" ")[0]}</span></td>
                <td style={{padding:"9px 10px",color:"#f1f5f9",fontFamily:"monospace",fontWeight:700}}>{v.Unidad}</td>
                <td style={{padding:"9px 10px",color:"#94a3b8",fontFamily:"monospace"}}>{v.Caja}</td>
                <td style={{padding:"9px 10px",color:"#94a3b8",maxWidth:100,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{v.Cliente}</td>
                <td style={{padding:"9px 10px",color:"#64748b",fontSize:10}}>{v.Origen}</td>
                <td style={{padding:"9px 10px",color:"#64748b",fontSize:10}}>{v.Destino}</td>
                <td style={{padding:"9px 10px"}}><Badge text={v["Estatus viaje"]||""} small/></td>
                <td style={{padding:"9px 10px",color:"#64748b"}}>{v["Km cargados"]||"—"}</td>
                <td style={{padding:"9px 10px",color:v["Venta real"]?"#10b981":"#334155",fontWeight:v["Venta real"]?700:400}}>{v["Venta real"]?fmt$($n(v["Venta real"])):"—"}</td>
                <td style={{padding:"9px 10px",color:"#64748b",fontSize:10}}>{v.Circuito}</td>
                <td style={{padding:"9px 10px",color:"#64748b",fontSize:10}}>{v["Hora salida"]||"—"}</td>
                <td style={{padding:"9px 10px",color:"#64748b",fontSize:10}}>{v["Fecha de carga"]||v["Hora carga"]||"—"}</td>
                <td style={{padding:"9px 10px",color:"#64748b",fontSize:10}}>{v["Fecha descarga"]||"—"}</td>
                <td style={{padding:"9px 10px",color:"#64748b",fontSize:10}}>{v["Cita descarga"]||"—"}</td>
                <td style={{padding:"9px 10px",color:entregado?"#10b981":"#64748b",fontWeight:700,fontSize:11}}>{otifVal}</td>
              </tr>
            );
          })}</tbody>
        </table>
      </div>
    </div>
  );
};

// ─── TRACKER ──────────────────────────────────────────────────────────────────
const Tracker=({data,setData})=>{
  const res=data.resumen;
  if(!res) return <div style={{color:"#475569",textAlign:"center",padding:40}}>Sincroniza para cargar datos</div>;
  const grupos=res.flota?.grupos||{};
  const enRuta=[...grupos.VTA||[],...grupos.TRN||[],...grupos.MOV||[]];
  const [entregados,setEntregados]=useState({});
  const toggleEntregado=(unidad)=>setEntregados(p=>({...p,[unidad]:!p[unidad]}));
  return(
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      <div style={{color:"#475569",fontSize:11,textTransform:"uppercase",letterSpacing:1.5}}>🛣️ Tracker — {enRuta.length} en movimiento · {res.flota?.fecha}</div>
      {enRuta.length===0&&<div style={{color:"#334155",fontSize:13,textAlign:"center",padding:24}}>Sin unidades en movimiento registradas</div>}
      {enRuta.map((e,idx)=>{
        const cfg=CIRC[e.ruta]||{paradas:["Origen","En Ruta","Destino"],siguiente:"Definir circuito",tiempo:"—",color:"#6366f1"};
        const entregado=entregados[e.unidad]||false;
        // Get viaje info
        const viaje=(data.viajesList||[]).find(v=>String(v.Unidad)===e.unidad&&v["Estatus viaje"]?.includes("tránsito"));
        return(
          <div key={e.unidad+idx} style={{background:"#0a1628",border:`1px solid ${entregado?"#10b981":cfg.color}30`,borderRadius:12,padding:14}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
              <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
                <span style={{color:"#f1f5f9",fontWeight:900,fontFamily:"monospace",fontSize:14}}>{e.unidad}</span>
                <span style={{color:"#64748b",fontSize:11}}>{e.operador?.split(" ").slice(0,2).join(" ")}</span>
                <Badge text={e.motivo} small/>
                {e.monto>0&&<span style={{color:"#10b981",fontSize:11,fontWeight:700}}>{fmt$(e.monto)}</span>}
              </div>
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                <button onClick={()=>toggleEntregado(e.unidad)} style={{background:entregado?"#10b981":"#1e293b",border:`1px solid ${entregado?"#10b981":"#334155"}`,borderRadius:6,padding:"4px 10px",color:entregado?"#fff":"#94a3b8",fontSize:10,cursor:"pointer",fontWeight:700}}>
                  {entregado?"✅ Entregado":"⬜ Entregar"}
                </button>
                <span style={{color:cc(e.coordinador),fontSize:10,fontWeight:700}}>{e.coordinador?.split(" ")[0]}</span>
              </div>
            </div>
            {/* Ruta y destino */}
            <div style={{display:"flex",gap:14,marginBottom:10,flexWrap:"wrap",fontSize:11}}>
              <span style={{color:"#94a3b8"}}>📍 {e.ruta||"Sin ruta"}</span>
              {viaje?.Destino&&<span style={{color:"#10b981",fontWeight:700}}>→ {viaje.Destino}</span>}
              {viaje?.Cliente&&<span style={{color:"#64748b"}}>{viaje.Cliente}</span>}
            </div>
            {/* Timeline */}
            <div style={{position:"relative",overflowX:"auto"}}>
              <div style={{display:"flex",alignItems:"center",minWidth:cfg.paradas.length*90,paddingBottom:8}}>
                {cfg.paradas.map((parada,pi)=>{
                  const esActual=pi===1,esAnterior=pi<1;
                  return(
                    <React.Fragment key={pi}>
                      <div style={{display:"flex",flexDirection:"column",alignItems:"center",minWidth:80,zIndex:2}}>
                        <div style={{width:esActual?22:14,height:esActual?22:14,borderRadius:"50%",background:esActual?cfg.color:esAnterior?cfg.color+"80":"#1e293b",border:esActual?`3px solid ${cfg.color}`:`2px solid ${esAnterior?cfg.color+"60":"#1e293b"}`,boxShadow:esActual?`0 0 12px ${cfg.color}`:"none",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                          {esActual&&<span style={{fontSize:8}}>🚛</span>}
                          {esAnterior&&<span style={{color:"#fff",fontSize:8,fontWeight:900}}>✓</span>}
                        </div>
                        <div style={{color:esActual?"#f1f5f9":esAnterior?"#475569":"#334155",fontSize:9,marginTop:5,textAlign:"center",fontWeight:esActual?700:400,whiteSpace:"nowrap"}}>{parada}</div>
                      </div>
                      {pi<cfg.paradas.length-1&&<div style={{flex:1,height:3,background:pi<1?cfg.color+"80":"#1e293b",minWidth:20,position:"relative",top:-14,flexShrink:0}}/>}
                    </React.Fragment>
                  );
                })}
              </div>
            </div>
            {/* Comentarios + siguiente ruta */}
            <div style={{background:"#060d1a",borderRadius:8,padding:"8px 12px",marginTop:6,display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:6}}>
              {e.comentarios&&<span style={{color:"#94a3b8",fontWeight:600,fontSize:10}}>{e.comentarios.slice(0,60)}</span>}
              <span style={{color:cfg.color,fontSize:10,fontWeight:700}}>➡️ {cfg.siguiente}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ─── ALERTAS ──────────────────────────────────────────────────────────────────
const Alertas=({data})=>{
  const res=data.resumen;
  const alertas=[];
  // Entregas vencidas
  (res?.entregas?.vencidas||[]).forEach(v=>alertas.push({tipo:"Entrega Vencida",unidad:v.unidad,caja:v.caja,op:v.cliente,coord:v.coordinador?.split(" ")[0],desc:`Cita: ${v.cita} — ${v.circuito}`,accion:"Contactar cliente y reprogramar",fecha:v.cita}));
  // CP/RM/SG
  (res?.flota?.grupos?.CP||[]).forEach(e=>alertas.push({tipo:"CP - Correctivo",unidad:e.unidad,caja:"-",op:e.operador,coord:e.coordinador?.split(" ")[0],desc:e.comentarios||e.motivo,accion:"Verificar fecha estimada de salida",fecha:res?.flota?.fecha}));
  (res?.flota?.grupos?.SG||[]).forEach(e=>alertas.push({tipo:"SG - Siniestro",unidad:e.unidad,caja:"-",op:e.operador,coord:e.coordinador?.split(" ")[0],desc:e.comentarios||"Siniestro/Garantía activa",accion:"Gestionar con aseguradora",fecha:res?.flota?.fecha}));
  (res?.flota?.grupos?.RM||[]).forEach(e=>alertas.push({tipo:"RM - Rep. Mayor",unidad:e.unidad,caja:"-",op:e.operador,coord:e.coordinador?.split(" ")[0],desc:e.comentarios||"Reparación mayor en proceso",accion:"Solicitar estimado de tiempo y costo",fecha:res?.flota?.fecha}));
  // SO
  (res?.flota?.grupos?.SO||[]).slice(0,6).forEach(e=>alertas.push({tipo:"Sin Operador",unidad:e.unidad,caja:"-",op:"VACANTE",coord:e.coordinador?.split(" ")[0],desc:e.comentarios||"Sin operador asignado",accion:"Asignar operador disponible",fecha:res?.flota?.fecha}));
  (res?.flota?.grupos?.IND||[]).forEach(e=>alertas.push({tipo:"IND - Indisciplina",unidad:e.unidad,caja:"-",op:e.operador,coord:e.coordinador?.split(" ")[0],desc:e.comentarios||"Sanción activa",accion:"Revisar con RRHH y aplicar proceso",fecha:res?.flota?.fecha}));
  // Cajas dañadas
  (data.cajasList||[]).filter(c=>c.Estatus==="Dañada").forEach(c=>alertas.push({tipo:"Caja Dañada",unidad:"-",caja:c.Caja,op:"-",coord:c.Coordinador?.split(" ")[0],desc:`${c["Ciudad / Ubicación"]} — ${c.Comentarios}`,accion:"Programar reparación o dar de baja",fecha:""}));
  (data.cajasList||[]).filter(c=>c.Estatus==="No localizada").forEach(c=>alertas.push({tipo:"Caja No Localizada",unidad:"-",caja:c.Caja,op:"-",coord:c.Coordinador?.split(" ")[0],desc:c.Comentarios||"No localizada",accion:"Investigar última ubicación con operador",fecha:""}));
  const COLS={"Entrega Vencida":"#ef4444","CP - Correctivo":"#f59e0b","SG - Siniestro":"#ef4444","RM - Rep. Mayor":"#ef4444","Sin Operador":"#64748b","IND - Indisciplina":"#ef4444","Caja Dañada":"#f97316","Caja No Localizada":"#ef4444"};
  return(
    <div style={{display:"flex",flexDirection:"column",gap:8}}>
      <div style={{color:"#475569",fontSize:11}}>{alertas.length} alertas activas — automáticas desde tus datos</div>
      {alertas.length===0&&<div style={{color:"#334155",textAlign:"center",padding:24,fontSize:13}}>✅ Sin alertas. Toca 🔄 Sincronizar.</div>}
      {alertas.map((a,i)=>{const col=COLS[a.tipo]||"#6366f1";return(
        <div key={i} style={{background:"#0a1628",border:`1px solid ${col}25`,borderLeft:`3px solid ${col}`,borderRadius:8,padding:"12px 14px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
            <div style={{flex:1}}>
              <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:4,flexWrap:"wrap"}}><Badge text={a.tipo}/>{a.fecha&&<span style={{color:"#334155",fontSize:10}}>{a.fecha}</span>}</div>
              <div style={{color:"#cbd5e1",fontSize:12,fontWeight:700,marginBottom:2}}>{a.op}</div>
              <div style={{color:"#475569",fontSize:11,marginBottom:4}}>{a.unidad!=="-"&&<span>🚛 {a.unidad} </span>}{a.caja!=="-"&&<span>📦 {a.caja} </span>}— {a.desc}</div>
              <div style={{background:"#0d1626",borderRadius:6,padding:"5px 10px",fontSize:10,color:"#3b82f6"}}>💡 <b>Acción sugerida:</b> {a.accion}</div>
            </div>
            <span style={{color:cc(a.coord||""),fontSize:10,fontWeight:700,marginLeft:8}}>{a.coord}</span>
          </div>
        </div>
      );})}
    </div>
  );
};

// ─── COORDINADORES VIEW ───────────────────────────────────────────────────────
const Coordinadores=({data})=>{
  const res=data.resumen;
  const [selCoord,setSelCoord]=useState("TELLO");
  if(!res) return <div style={{color:"#475569",textAlign:"center",padding:40}}>Sincroniza para cargar datos</div>;
  const coords=res.coordinadores||{};
  const c=coords[selCoord];
  if(!c) return null;
  const col=C[selCoord];
  return(
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      {/* Tabs coordinador */}
      <div style={{display:"flex",gap:8}}>
        {["TELLO","CRISTIAN","JULIO"].map(k=>(
          <button key={k} onClick={()=>setSelCoord(k)} style={{flex:1,padding:"10px",borderRadius:8,border:`1px solid ${selCoord===k?C[k]:"#1e293b"}`,background:selCoord===k?C[k]+"20":"#0a1628",color:selCoord===k?C[k]:"#475569",fontSize:12,cursor:"pointer",fontWeight:700}}>
            {coords[k]?.nombre?.split(" ")[0]} {coords[k]?.nombre?.split(" ").slice(-1)}
          </button>
        ))}
      </div>
      {/* Header */}
      <div style={{background:"#0a1628",border:`1px solid ${col}30`,borderRadius:12,padding:16}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
          <div style={{width:12,height:12,borderRadius:"50%",background:col,boxShadow:`0 0 8px ${col}`}}/>
          <div style={{color:"#f1f5f9",fontWeight:800,fontSize:16}}>{c.nombre}</div>
          <div style={{marginLeft:"auto",background:col+"20",color:col,borderRadius:6,padding:"3px 10px",fontSize:13,fontWeight:700}}>{c.eficiencia}% ef.</div>
        </div>
        {/* Venta y meta */}
        <div style={{marginBottom:12}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
            <span style={{color:"#64748b",fontSize:11}}>Venta hoy</span><span style={{color:col,fontWeight:700,fontSize:13}}>{fmt$(c.ventaHoy)}</span>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
            <span style={{color:"#64748b",fontSize:11}}>Venta semana</span><span style={{color:col,fontWeight:700,fontSize:13}}>{fmt$(c.ventaSemana)}</span>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
            <span style={{color:"#64748b",fontSize:11}}>Meta semana</span><span style={{color:"#334155",fontSize:11}}>{fmt$(c.metaSemana)}</span>
          </div>
          {pBar(c.cumplMeta,null,8)}
          <div style={{color:"#475569",fontSize:10,marginTop:3}}>{c.cumplMeta}% de meta semanal</div>
        </div>
        {/* Unidades */}
        <div style={{color:"#475569",fontSize:10,textTransform:"uppercase",letterSpacing:.8,marginBottom:6}}>🚛 {c.totalUnidades} Unidades</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:6,marginBottom:12}}>
          {[["Activas",c.activas,"#10b981"],["DCO",c.dco,"#3b82f6"],["DSO",c.dso,"#64748b"],["LIB",c.lib,"#a855f7"],["SO/Vac",c.so,"#64748b"],["MTTO",c.mtto,"#f59e0b"]].map(([l,v,col2])=>(
            <div key={l} style={{background:col2+"15",borderRadius:8,padding:"8px",textAlign:"center"}}>
              <div style={{color:col2,fontWeight:900,fontSize:20}}>{v}</div>
              <div style={{color:"#475569",fontSize:9,textTransform:"uppercase"}}>{l}</div>
            </div>
          ))}
        </div>
        {/* Vacantes */}
        {c.unidadesVacantes?.length>0&&(
          <div style={{background:"#64748b15",borderRadius:8,padding:"8px 10px",marginBottom:10}}>
            <div style={{color:"#94a3b8",fontSize:10,fontWeight:700,marginBottom:4}}>⚠️ Unidades vacantes ({c.unidadesVacantes.length})</div>
            {c.unidadesVacantes.map(u=>(
              <div key={u.unidad} style={{display:"flex",gap:8,fontSize:10,marginBottom:2}}>
                <span style={{color:"#f1f5f9",fontFamily:"monospace",fontWeight:700}}>{u.unidad}</span>
                <span style={{color:"#64748b"}}>{u.comentarios}</span>
              </div>
            ))}
          </div>
        )}
        {/* Cajas */}
        <div style={{color:"#475569",fontSize:10,textTransform:"uppercase",letterSpacing:.8,marginBottom:6}}>📦 {c.totalCajas} Cajas</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6,marginBottom:10}}>
          {[["Cargadas",c.cajasCargadas,"#10b981"],["Disponibles",c.cajasDisponibles,"#3b82f6"],["Dañadas",c.cajasDañadas,"#ef4444"],["No loc.",c.cajasNoLocaliz,"#f97316"]].map(([l,v,col2])=>(
            <div key={l} style={{background:col2+"15",borderRadius:7,padding:"6px",textAlign:"center"}}>
              <div style={{color:col2,fontWeight:900,fontSize:18}}>{v}</div>
              <div style={{color:"#475569",fontSize:8}}>{l}</div>
            </div>
          ))}
        </div>
        {/* Cajas cargadas con cliente */}
        {c.cajasConCliente?.length>0&&(
          <div style={{marginBottom:10}}>
            <div style={{color:"#475569",fontSize:10,textTransform:"uppercase",letterSpacing:.8,marginBottom:6}}>Cajas cargadas — seguimiento</div>
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
                <thead><tr style={{borderBottom:"1px solid #1e293b"}}>{["Caja","Cliente","Ciudad","Seguimiento"].map(h=><th key={h} style={{textAlign:"left",padding:"5px 8px",color:"#475569",fontSize:9,textTransform:"uppercase"}}>{h}</th>)}</tr></thead>
                <tbody>{c.cajasConCliente.slice(0,8).map((cj,i)=>(
                  <tr key={i} style={{borderBottom:"1px solid #0d1626"}}>
                    <td style={{padding:"5px 8px",color:"#f1f5f9",fontFamily:"monospace",fontWeight:700}}>{cj.caja}</td>
                    <td style={{padding:"5px 8px",color:"#94a3b8",maxWidth:100,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{cj.cliente}</td>
                    <td style={{padding:"5px 8px",color:"#64748b"}}>{cj.ciudad}</td>
                    <td style={{padding:"5px 8px",color:"#94a3b8",fontWeight:600,maxWidth:140,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{cj.comentarios||"Activa con cliente"}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </div>
        )}
        {/* Circuitos y clientes */}
        {c.circuitos?.length>0&&<div style={{marginBottom:8}}><div style={{color:"#475569",fontSize:10,marginBottom:4}}>Circuitos: <span style={{color:col,fontWeight:700}}>{c.circuitos.join(" · ")}</span></div></div>}
        {c.clientes?.length>0&&(
          <div>
            <div style={{color:"#475569",fontSize:10,textTransform:"uppercase",letterSpacing:.8,marginBottom:6}}>Clientes activos</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
              {c.clientes.map((cl,i)=>(
                <div key={i} style={{background:col+"10",border:`1px solid ${col}25`,borderRadius:7,padding:"5px 10px",fontSize:10}}>
                  <span style={{color:col,fontWeight:700}}>{cl.nombre}</span>
                  <span style={{color:"#475569",marginLeft:5}}>{cl.ciudad}</span>
                  <span style={{color:"#334155",marginLeft:5,fontSize:9}}>{cl.frecuencia}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── APP ROOT ─────────────────────────────────────────────────────────────────
const TABS=[
  {id:"dashboard",label:"Dashboard",icon:"📊"},
  {id:"coordinadores",label:"Coordinadores",icon:"👥"},
  {id:"tracker",label:"Tracker",icon:"🛣️"},
  {id:"distribucion",label:"Distribución",icon:"🗂️"},
  {id:"tractos",label:"Unidades",icon:"🚛"},
  {id:"mantenimiento",label:"Mantenimiento",icon:"🔧"},
  {id:"cajas",label:"Cajas",icon:"📦"},
  {id:"viajes",label:"Viajes & OTIF",icon:"💰"},
  {id:"alertas",label:"Alertas",icon:"🔔"},
];

function App(){
  const [data,setData]=useState(()=>initData());
  const [tab,setTab]=useState("dashboard");
  const [syncState,setSyncState]=useState("idle");
  const [lastSync,setLastSync]=useState("");

  useEffect(()=>{sd(data);},[data]);
  useEffect(()=>{if(!USAR_SHEETS)return;syncAll();},[]);

  const syncAll=async()=>{
    setSyncState("syncing");
    try{
      // Un solo llamado que lo calcula todo en el servidor
      const [resumen,cajasRaw,viajesRaw]=await Promise.all([
        apiGet("resumen_completo"),
        apiGet("Control_Cajas"),
        apiGet("VIAJES"),
      ]);
      const cajasList=Array.isArray(cajasRaw)?cajasRaw:[];
      const viajesList=Array.isArray(viajesRaw)?viajesRaw:[];
      const updated={...data,resumen:resumen.ok!==undefined?resumen:null,cajasList,viajesList,v:7,lastSync:new Date().toISOString()};
      setData(updated);sd(updated);
      setSyncState("ok");
      setLastSync(new Date().toLocaleTimeString("es-MX",{hour:"2-digit",minute:"2-digit"}));
      setTimeout(()=>setSyncState("idle"),4000);
    }catch(e){
      console.error("Sync error:",e);
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
          <div style={{fontSize:9,color:"#334155",letterSpacing:1.5,textTransform:"uppercase"}}>ERP TMS v7 {USAR_SHEETS?`· ☁️ ${lastSync}`:"· 💾 Local"}</div>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <div style={{width:7,height:7,borderRadius:"50%",background:"#10b981",boxShadow:"0 0 8px #10b981"}}/>
          <span style={{color:"#10b981",fontSize:10,fontWeight:700}}>OPERATIVO</span>
        </div>
      </div>
      <div style={{background:"#08111f",borderBottom:"1px solid #0f1e33",display:"flex",overflowX:"auto",padding:"0 14px"}}>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)}
            style={{background:"none",border:"none",borderBottom:tab===t.id?"2px solid #3b82f6":"2px solid transparent",color:tab===t.id?"#f1f5f9":"#475569",padding:"11px 10px",cursor:"pointer",fontSize:11,fontWeight:tab===t.id?700:400,whiteSpace:"nowrap",display:"flex",gap:4,alignItems:"center",position:"relative"}}>
            {t.icon} {t.label}
            {t.id==="alertas"&&alertCount>0&&<span style={{background:"#ef4444",color:"#fff",borderRadius:"50%",width:16,height:16,fontSize:9,fontWeight:900,display:"flex",alignItems:"center",justifyContent:"center",marginLeft:2}}>{alertCount}</span>}
          </button>
        ))}
      </div>
      <div style={{padding:16,maxWidth:1400,margin:"0 auto"}}>
        <SyncBanner state={syncState} onSync={syncAll} lastSync={lastSync}/>
        {tab==="dashboard"      &&<Dashboard data={data}/>}
        {tab==="coordinadores"  &&<Coordinadores data={data}/>}
        {tab==="tracker"        &&<Tracker data={data} setData={setData}/>}
        {tab==="distribucion"   &&<Distribucion data={data}/>}
        {tab==="tractos"        &&<Tractos data={data}/>}
        {tab==="mantenimiento"  &&<Mantenimiento data={data}/>}
        {tab==="cajas"          &&<Cajas data={data} setData={setData}/>}
        {tab==="viajes"         &&<Viajes data={data}/>}
        {tab==="alertas"        &&<Alertas data={data}/>}
      </div>
      <div style={{padding:"12px 18px",borderTop:"1px solid #0f1e33",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <span style={{color:"#1e3a5f",fontSize:10}}>{data.resumen?.flota?.total||0} Unidades · {(data.cajasList||[]).length} Cajas · {(data.viajesList||[]).length} Viajes · v7</span>
        <button onClick={()=>{if(window.confirm("¿Resetear datos locales?")){localStorage.removeItem(STORAGE_KEY);window.location.reload();}}} style={{background:"none",border:"1px solid #1e293b",borderRadius:6,padding:"4px 10px",color:"#334155",fontSize:10,cursor:"pointer"}}>🔄 Reset</button>
      </div>
    </div>
  );
}
ReactDOM.createRoot(document.getElementById("root")).render(React.createElement(App));
