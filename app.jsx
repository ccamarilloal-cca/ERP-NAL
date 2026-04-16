// ═══════════════════════════════════════════════════════════════════════════
//  NACIONAL AUTOTRANSPORTE — ERP TMS v10
//  Estructura: 8 pestañas | Tablero personal | Sin duplicados
//  Inicio · Unidades(+Coord+Distrib) · Tracker · MTTO · Cajas · Viajes · Ranking · Alertas
// ═══════════════════════════════════════════════════════════════════════════
const { useState, useEffect, useRef, useCallback } = React;

const SHEETS_URL  = window.SHEETS_URL || "PEGA_TU_URL_AQUI";
const USAR_SHEETS = SHEETS_URL !== "PEGA_TU_URL_AQUI";
const STORAGE_KEY = "nal_erp_v10";
const TODO_KEY    = "nal_todo_v10";
const URG_KEY     = "nal_urg_v10";
const VENTA_DIA_KEY = "nal_venta_dias_v10";

const ld = () => { try{const r=localStorage.getItem(STORAGE_KEY);return r?JSON.parse(r):null;}catch(e){return null;} };
const sd = (d) => { try{localStorage.setItem(STORAGE_KEY,JSON.stringify(d));}catch(e){} };
const lsGet = (k) => { try{const r=localStorage.getItem(k);return r?JSON.parse(r):null;}catch(e){return null;} };
const lsSet = (k,v) => { try{localStorage.setItem(k,JSON.stringify(v));}catch(e){} };
const initData = () => {
  const s=ld();
  if(s&&s.v===10) return s;
  return {v:10,resumen:null,cajasList:[],viajesList:[],alertasList:[],mttoList:[],lastSync:""};
};

const apiGet = async (tab) => {
  const r=await fetch(`${SHEETS_URL}?tab=${encodeURIComponent(tab)}`);
  const j=await r.json();
  return Array.isArray(j)?j:(j.data||j);
};
const apiPost = async (tab,rows) => {
  await fetch(SHEETS_URL,{method:"POST",mode:"no-cors",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({tab,action:"replace",rows})});
};

// ── HELPERS ───────────────────────────────────────────────────────────────────
const $n = v => parseFloat(String(v||"0").replace(/[$,]/g,""))||0;
const C  = {TELLO:"#3b82f6",CRISTIAN:"#10b981",JULIO:"#f59e0b"};
const cc = (c="") => { const u=c.toUpperCase(); if(u.includes("TELLO"))return C.TELLO; if(u.includes("CRISTIAN")||u.includes("ZUÑIGA")||u.includes("ZUNIGA"))return C.CRISTIAN; if(u.includes("JULIO")||u.includes("HERNANDEZ"))return C.JULIO; return"#6366f1"; };
const ck = (c="") => { const u=c.toUpperCase(); if(u.includes("TELLO"))return"TELLO"; if(u.includes("CRISTIAN")||u.includes("ZUÑIGA")||u.includes("ZUNIGA"))return"CRISTIAN"; if(u.includes("JULIO")||u.includes("HERNANDEZ"))return"JULIO"; return null; };
const ec = (e="") => { const s=e.toLowerCase(); if(s.includes("vta")||s.includes("trn")||s.includes("mov")||s.includes("entregado")||s.includes("finalizado"))return"#10b981"; if(s.includes("dco"))return"#3b82f6"; if(s.includes("dso"))return"#64748b"; if(s.includes("lib"))return"#a855f7"; if(s.includes("cp")||s.includes("rm")||s.includes("sg"))return"#f59e0b"; if(s.includes("so")||s.includes("sin operador"))return"#475569"; if(s.includes("ind"))return"#ef4444"; if(s.includes("per"))return"#a855f7"; if(s.includes("dañada")||s.includes("no localizada"))return"#ef4444"; if(s.includes("disponible"))return"#3b82f6"; return"#64748b"; };
const Badge = ({text,small}) => <span style={{background:ec(text)+"22",color:ec(text),border:`1px solid ${ec(text)}44`,borderRadius:5,padding:small?"1px 5px":"2px 7px",fontSize:small?9:10,fontWeight:700,letterSpacing:.5,textTransform:"uppercase",whiteSpace:"nowrap"}}>{text}</span>;
const fmt$ = v => v>=1000000?`$${(v/1000000).toFixed(2)}M`:v>=1000?`$${(v/1000).toFixed(0)}K`:`$${Math.round(v).toLocaleString()}`;
const pBar = (pct,h=5) => <div style={{height:h,background:"#1e293b",borderRadius:3,overflow:"hidden"}}><div style={{height:"100%",width:`${Math.min(+pct,100)}%`,background:+pct>=100?"#10b981":+pct>=70?"#f59e0b":"#ef4444",borderRadius:3,transition:"width .4s"}}/></div>;
const toCSV = (rows,cols) => cols.join(",")+"\n"+rows.map(r=>cols.map(c=>`"${r[c]??''}"`).join(",")).join("\n");
const dlCSV = (c,fn) => { const b=new Blob([c],{type:"text/csv;charset=utf-8;"}); const a=document.createElement("a"); a.href=URL.createObjectURL(b); a.download=fn; a.click(); };
const esOp = m => { const u=String(m||"").toUpperCase(); return u.startsWith("VTA")||u.startsWith("TRN")||u.startsWith("MOV")||u.startsWith("LIB"); };
const diasDesde = (fechaStr) => { if(!fechaStr||fechaStr==="—") return null; const d=new Date(fechaStr); if(isNaN(d)) return null; return Math.floor((new Date()-d)/86400000); };
const semaforoDias = (dias) => { if(dias===null) return{col:"#475569",label:"—"}; if(dias<0) return{col:"#10b981",label:`Vence en ${Math.abs(dias)}d`}; if(dias===0) return{col:"#f59e0b",label:"Vence HOY"}; return{col:"#ef4444",label:`ATRASADA ${dias}d`}; };
const DIAS_ES = ["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];
const MESES_ES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const DIAS_CORTO = ["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"];

// ── BASE COMPONENTS ───────────────────────────────────────────────────────────
const Input=({label,value,onChange,type="text",options,required})=>(
  <div style={{display:"flex",flexDirection:"column",gap:4}}>
    <label style={{fontSize:11,color:"#64748b",textTransform:"uppercase",letterSpacing:.8}}>{label}{required&&<span style={{color:"#ef4444"}}> *</span>}</label>
    {options
      ?<select value={value||""} onChange={e=>onChange(e.target.value)} style={{background:"#0f172a",border:"1px solid #1e293b",borderRadius:7,padding:"8px 10px",color:"#f1f5f9",fontSize:12,outline:"none"}}>
        <option value="">— Seleccionar —</option>{options.map(o=><option key={o} value={o}>{o}</option>)}
       </select>
      :<input type={type} value={value||""} onChange={e=>onChange(e.target.value)} style={{background:"#0f172a",border:"1px solid #1e293b",borderRadius:7,padding:"8px 10px",color:"#f1f5f9",fontSize:12,outline:"none"}}/>
    }
  </div>
);

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

const COLS_UNIDAD=[
  {k:"unidad",l:"Unidad",col:()=>"#f1f5f9",bold:true,mono:true},
  {k:"operador",l:"Operador",mw:150},
  {k:"coordinador",l:"Coord",render:r=><span style={{color:cc(r.coordinador||""),fontWeight:700,fontSize:10}}>{(r.coordinador||"").split(" ")[0]}</span>},
  {k:"motivo",l:"Motivo",render:r=><Badge text={r.motivo||""} small/>},
  {k:"fecha",l:"Fecha",col:()=>"#64748b",fs:10},
  {k:"monto",l:"Venta",col:()=>"#10b981",bold:true,render:r=>r.monto>0?fmt$(r.monto):"—"},
  {k:"circuito",l:"Circuito",col:r=>r.circuito&&r.circuito!=="Sin circuito"?"#a78bfa":"#334155",bold:true,fs:10},
  {k:"comentarios",l:"Comentarios",mw:160,col:()=>"#64748b",fs:10},
];

// ── SYNC BANNER ────────────────────────────────────────────────────────────────
const SyncBanner=({state,onSync,lastSync,autoInterval,setAutoInterval})=>{
  const cfg={
    idle:{bg:"#0a1628",border:"#1e3a5f",col:"#3b82f6",text:USAR_SHEETS?`☁️ Sheets${lastSync?" · "+lastSync:""}`:"💾 Local"},
    syncing:{bg:"#0a1f0f",border:"#10b98140",col:"#10b981",text:"🔄 Sincronizando..."},
    ok:{bg:"#0a1f0f",border:"#10b98140",col:"#10b981",text:"✅ Actualizado"},
    error:{bg:"#1f0a0a",border:"#ef444440",col:"#ef4444",text:"⚠️ Error de conexión"}
  };
  const c=cfg[state]||cfg.idle;
  return(
    <div style={{background:c.bg,border:`1px solid ${c.border}`,borderRadius:9,padding:"6px 14px",display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10,gap:8,flexWrap:"wrap"}}>
      <span style={{color:c.col,fontSize:11}}>{c.text}</span>
      <div style={{display:"flex",gap:8,alignItems:"center"}}>
        {USAR_SHEETS&&<>
          <select value={autoInterval} onChange={e=>setAutoInterval(Number(e.target.value))}
            style={{background:"#0f172a",border:"1px solid #1e293b",borderRadius:6,padding:"3px 8px",color:"#64748b",fontSize:10,outline:"none"}}>
            <option value={0}>Manual</option>
            <option value={30}>30 seg</option>
            <option value={60}>1 min</option>
            <option value={120}>2 min</option>
            <option value={300}>5 min</option>
          </select>
          <button onClick={onSync} disabled={state==="syncing"}
            style={{background:"#1e293b",border:"none",borderRadius:6,padding:"4px 12px",color:"#94a3b8",fontSize:11,cursor:"pointer"}}>
            🔄
          </button>
        </>}
      </div>
    </div>
  );
};

// ── HEADER RELOJ ────────────────────────────────────────────────────────────────
const HeaderReloj=({lastSync,autoInterval})=>{
  const [ahora,setAhora]=useState(new Date());
  useEffect(()=>{const t=setInterval(()=>setAhora(new Date()),1000);return()=>clearInterval(t);},[]);
  const hora=ahora.toLocaleTimeString("es-MX",{hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false});
  const fecha=`${DIAS_ES[ahora.getDay()]}, ${ahora.getDate()} de ${MESES_ES[ahora.getMonth()]} de ${ahora.getFullYear()}`;
  return(
    <div style={{background:"#08111f",borderBottom:"1px solid #0f1e33",padding:"10px 18px",display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:100,flexWrap:"wrap",gap:8}}>
      <div style={{display:"flex",flexDirection:"column",gap:2}}>
        <div style={{fontSize:13,fontWeight:900,color:"#f1f5f9",letterSpacing:-.5}}>🚚 NAL</div>
        <div style={{fontSize:8,color:"#334155",letterSpacing:1,textTransform:"uppercase"}}>ERP v10{autoInterval>0?` · 🔄${autoInterval}s`:""}</div>
      </div>
      <div style={{textAlign:"center",flex:1}}>
        <div style={{fontSize:26,fontWeight:900,color:"#f1f5f9",fontFamily:"monospace",letterSpacing:2,lineHeight:1}}>{hora}</div>
        <div style={{fontSize:9,color:"#475569",marginTop:2,textTransform:"uppercase",letterSpacing:.5}}>{fecha}</div>
      </div>
      <div style={{display:"flex",gap:6,alignItems:"center"}}>
        <div style={{width:7,height:7,borderRadius:"50%",background:"#10b981",boxShadow:"0 0 8px #10b981"}}/>
        <span style={{color:"#10b981",fontSize:9,fontWeight:700}}>OPERATIVO</span>
      </div>
    </div>
  );
};


// ── INICIO — Tablero Personal ─────────────────────────────────────────────────
const Inicio=({data,setTab})=>{
  const res=data.resumen;
  // To-Do pendientes
  const [todos,setTodos]=useState(()=>lsGet(TODO_KEY)||[]);
  const [todoInput,setTodoInput]=useState("");
  const [todoModal,setTodoModal]=useState(false);
  const [editTodoId,setEditTodoId]=useState(null);
  const [editTodoVal,setEditTodoVal]=useState("");
  // Urgencias
  const [urgs,setUrgs]=useState(()=>lsGet(URG_KEY)||[]);
  const [urgModal,setUrgModal]=useState(false);
  const [urgInput,setUrgInput]=useState({desc:"",prioridad:"Alta"});
  const [subModal,setSubModal]=useState(null); // {title, rows}
  // Venta por día
  const [ventaDias,setVentaDias]=useState(()=>lsGet(VENTA_DIA_KEY)||{});
  const [editVenta,setEditVenta]=useState(null);
  const [editVentaVal,setEditVentaVal]=useState("");
  // Bloques expandidos
  const [abiertos,setAbiertos]=useState({});
  const toggle=(k)=>setAbiertos(p=>({...p,[k]:!p[k]}));

  // Guardar todos en localStorage
  useEffect(()=>lsSet(TODO_KEY,todos),[todos]);
  useEffect(()=>lsSet(URG_KEY,urgs),[urgs]);
  useEffect(()=>lsSet(VENTA_DIA_KEY,ventaDias),[ventaDias]);

  // Auto-guardar venta del día actual desde el sync
  useEffect(()=>{
    if(!res) return;
    const hoy=new Date();
    const diaSem=hoy.getDay();
    const diaClave=DIAS_CORTO[diaSem];
    const ventaHoy=res.venta?.semana?.TOTAL||0;
    if(ventaHoy>0){
      setVentaDias(p=>({...p,[diaClave]:{val:ventaHoy,auto:true,ts:new Date().toLocaleTimeString("es-MX",{hour:"2-digit",minute:"2-digit"})}}));
    }
  },[res]);

  // Limpiar urgencias cerradas al inicio de semana (martes)
  useEffect(()=>{
    const hoy=new Date();
    if(hoy.getDay()===2){ // martes
      setUrgs(p=>p.filter(u=>u.estado!=="Cerrada"));
    }
  },[]);

  // Limpiar To-Do cerrados cada martes (dan tiempo al lunes/finde)
  useEffect(()=>{
    const hoy=new Date();
    if(hoy.getDay()===2){ // martes
      setTodos(p=>p.filter(t=>t.estado!=="Cerrado"));
    }
  },[]);

  // Días de la semana
  const hoy=new Date();
  const lunes=new Date(hoy); lunes.setDate(hoy.getDate()-(hoy.getDay()||7)+1);
  const diasSemana=Array.from({length:6},(_,i)=>{
    const d=new Date(lunes); d.setDate(lunes.getDate()+i);
    return{fecha:d,label:DIAS_CORTO[d.getDay()],num:d.getDate(),
      esHoy:d.toDateString()===hoy.toDateString()};
  });

  // Datos del resumen
  const flota=res?.flota||{};
  const entregas=res?.entregas||{};
  const venta=res?.venta||{};
  const otif=res?.otif||{};
  const cajas=res?.cajas||{};
  const alertasMtto=res?.alertasMtto||[];

  const totalVacantes=(flota.vacantes?.total)||0;
  const totalMtto=(flota.enCP?.total)||0;
  const totalVencidas=entregas.totalVencidas||0;
  const totalViajes=entregas.totalViajes||0;
  const pctOTIF=otif.pctSem||0;
  const ventaHoy=venta.hoy?.TOTAL||0;
  const ventaSem=venta.semana?.TOTAL||0;
  const urgsAbiertas=urgs.filter(u=>u.estado!=="Cerrada");
  const todosAbiertos=todos.filter(t=>t.estado!=="Cerrado");

  // To-Do helpers
  const addTodo=()=>{
    if(!todoInput.trim()) return;
    const hoyStr=new Date().toLocaleDateString("es-MX");
    setTodos(p=>[...p,{id:Date.now(),texto:todoInput.trim(),fecha:hoyStr,seguimiento:hoyStr,estado:"Abierto"}]);
    setTodoInput("");
  };
  const cycleTodo=(id)=>setTodos(p=>p.map(t=>t.id===id?{...t,estado:t.estado==="Abierto"?"En proceso":t.estado==="En proceso"?"Cerrado":"Abierto"}:t));
  const saveEditTodo=(id)=>{
    if(editTodoVal.trim()) setTodos(p=>p.map(t=>t.id===id?{...t,texto:editTodoVal.trim()}:t));
    setEditTodoId(null); setEditTodoVal("");
  };
  const delTodo=(id)=>setTodos(p=>p.filter(t=>t.id!==id));
  const updateSeg=(id,val)=>setTodos(p=>p.map(t=>t.id===id?{...t,seguimiento:val}:t));

  // Urgencias helpers
  const addUrg=()=>{
    if(!urgInput.desc.trim()) return;
    setUrgs(p=>[...p,{id:Date.now(),...urgInput,estado:"Abierta",hora:new Date().toLocaleTimeString("es-MX",{hour:"2-digit",minute:"2-digit"})}]);
    setUrgInput({desc:"",prioridad:"Alta"});
  };
  const cycleUrg=(id)=>setUrgs(p=>p.map(u=>u.id===id?{...u,estado:u.estado==="Abierta"?"En atención":u.estado==="En atención"?"Cerrada":"Abierta"}:u));

  const [bloqueModal,setBloqueModal]=useState(null);
  const openSubModal=(obj)=>{ setBloqueModal(null); setSubModal(obj); };
  const BloqueResumen=({id,icon,label,valor,col,children,badge,title})=>{
    return(
      <>
        {bloqueModal===id&&(
          <Modal title={title||`${icon} ${label}`} onClose={()=>setBloqueModal(null)} wide>
            <div style={{fontSize:13}}>{children}</div>
          </Modal>
        )}
        <div onClick={()=>setBloqueModal(id)}
          style={{background:"#0a1628",border:`1px solid ${col}30`,borderRadius:11,overflow:"hidden",marginBottom:8,cursor:"pointer"}}
          onMouseOver={e=>{e.currentTarget.style.borderColor=col+"60";e.currentTarget.style.background="#0d1e3a";}}
          onMouseOut={e=>{e.currentTarget.style.borderColor=col+"30";e.currentTarget.style.background="#0a1628";}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 16px"}}>
            <div style={{display:"flex",alignItems:"center",gap:12}}>
              <span style={{fontSize:24}}>{icon}</span>
              <div>
                <div style={{color:"#64748b",fontSize:11,textTransform:"uppercase",letterSpacing:.8}}>{label}</div>
                <div style={{color:col,fontWeight:900,fontSize:26,lineHeight:1}}>{valor}</div>
              </div>
            </div>
            <div style={{display:"flex",gap:8,alignItems:"center"}}>
              {badge&&<span style={{background:col+"20",color:col,borderRadius:6,padding:"3px 10px",fontSize:10,fontWeight:700}}>{badge}</span>}
              <span style={{color:col,fontSize:18}}>↗</span>
            </div>
          </div>
        </div>
      </>
    );
  };

  return(
    <div style={{display:"flex",flexDirection:"column",gap:0}}>
      {/* Modal urgencias */}
      {urgModal&&(
        <Modal title="🔴 Urgencias del día" onClose={()=>setUrgModal(false)}>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            <div style={{display:"flex",gap:8}}>
              <input value={urgInput.desc} onChange={e=>setUrgInput(p=>({...p,desc:e.target.value}))}
                placeholder="Descripción de urgencia..." onKeyDown={e=>e.key==="Enter"&&addUrg()}
                style={{flex:1,background:"#0f172a",border:"1px solid #1e293b",borderRadius:7,padding:"8px 10px",color:"#f1f5f9",fontSize:12,outline:"none"}}/>
              <select value={urgInput.prioridad} onChange={e=>setUrgInput(p=>({...p,prioridad:e.target.value}))}
                style={{background:"#0f172a",border:"1px solid #1e293b",borderRadius:7,padding:"8px",color:"#f1f5f9",fontSize:11,outline:"none"}}>
                <option>Alta</option><option>Media</option><option>Baja</option>
              </select>
              <button onClick={addUrg} style={{background:"#ef444420",border:"1px solid #ef444440",borderRadius:7,padding:"8px 12px",color:"#ef4444",fontWeight:700,cursor:"pointer"}}>+</button>
            </div>
            {urgs.length===0&&<div style={{color:"#334155",textAlign:"center",padding:20}}>Sin urgencias registradas</div>}
            {urgs.map((u,i)=>(
              <div key={u.id} style={{background:u.estado==="Cerrada"?"#080e1c":"#0d1626",border:`1px solid ${u.prioridad==="Alta"?"#ef444440":u.prioridad==="Media"?"#f59e0b40":"#64748b30"}`,borderRadius:8,padding:"10px 14px",opacity:u.estado==="Cerrada"?0.5:1}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div>
                    <span style={{color:u.prioridad==="Alta"?"#ef4444":u.prioridad==="Media"?"#f59e0b":"#64748b",fontSize:9,fontWeight:700,textTransform:"uppercase"}}>{u.prioridad}</span>
                    <span style={{color:"#334155",fontSize:9,marginLeft:8}}>{u.hora}</span>
                    <div style={{color:"#f1f5f9",fontSize:12,marginTop:3}}>{u.desc}</div>
                  </div>
                  <button onClick={()=>cycleUrg(u.id)} style={{background:u.estado==="Cerrada"?"#10b98120":u.estado==="En atención"?"#f59e0b20":"#ef444420",border:"none",borderRadius:6,padding:"4px 10px",color:u.estado==="Cerrada"?"#10b981":u.estado==="En atención"?"#f59e0b":"#ef4444",fontSize:9,cursor:"pointer",fontWeight:700}}>
                    {u.estado==="Cerrada"?"✅ Cerrada":u.estado==="En atención"?"🔄 Atención":"🔴 Abierta"}
                  </button>
                </div>
              </div>
            ))}
            <div style={{color:"#334155",fontSize:9,textAlign:"center",marginTop:4}}>Las urgencias cerradas se eliminan automáticamente el lunes</div>
          </div>
        </Modal>
      )}

      {/* Sub-modal para detalle de bloques */}
      {subModal&&(
        <Modal title={subModal.title} onClose={()=>setSubModal(null)} wide>
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
              <thead><tr style={{borderBottom:"2px solid #1e293b"}}>
                {["Unidad","Operador","Coordinador","Motivo","Venta","Circuito","Ubicación/Comentarios"].map(h=>(
                  <th key={h} style={{textAlign:"left",padding:"10px 12px",color:"#475569",fontSize:11,textTransform:"uppercase",whiteSpace:"nowrap"}}>{h}</th>
                ))}
              </tr></thead>
              <tbody>{(subModal.rows||[]).map((r,i)=>(
                <tr key={i} style={{borderBottom:"1px solid #0d1626",background:i%2===0?"#080e1c":"transparent"}}>
                  <td style={{padding:"10px 12px",color:"#f1f5f9",fontWeight:800,fontFamily:"monospace",fontSize:14}}>{r.unidad||r.Unidad||"—"}</td>
                  <td style={{padding:"10px 12px",color:"#94a3b8",maxWidth:150,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",fontSize:12}}>{r.operador||r.Operador||"—"}</td>
                  <td style={{padding:"10px 12px"}}><span style={{color:cc(r.coordinador||r.Coordinador||""),fontWeight:700,fontSize:11}}>{(r.coordinador||r.Coordinador||"").split(" ")[0]}</span></td>
                  <td style={{padding:"10px 12px"}}><Badge text={r.motivo||r.Motivo||r.estatus||""}/></td>
                  <td style={{padding:"10px 12px",color:(r.monto||0)>0?"#10b981":"#334155",fontWeight:700,fontSize:12}}>{(r.monto||0)>0?fmt$(r.monto):"—"}</td>
                  <td style={{padding:"10px 12px",color:r.circuito&&r.circuito!=="Sin circuito"?"#a78bfa":"#334155",fontWeight:700,fontSize:11}}>{r.circuito||"—"}</td>
                  <td style={{padding:"10px 12px",color:"#64748b",fontSize:11,maxWidth:180,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.comentarios||r.ubicacion||r.ruta||"—"}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </Modal>
      )}

      {/* Modal To-Do */}
      {todoModal&&(
        <Modal title="✅ Mis pendientes del día" onClose={()=>setTodoModal(false)} wide>
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            <div style={{display:"flex",gap:10}}>
              <input value={todoInput} onChange={e=>setTodoInput(e.target.value)}
                placeholder="Agregar pendiente..." onKeyDown={e=>e.key==="Enter"&&addTodo()}
                style={{flex:1,background:"#0f172a",border:"1px solid #1e293b",borderRadius:9,padding:"12px 14px",color:"#f1f5f9",fontSize:15,outline:"none"}}/>
              <button onClick={addTodo} style={{background:"#3b82f620",border:"1px solid #3b82f640",borderRadius:9,padding:"12px 20px",color:"#3b82f6",fontWeight:700,cursor:"pointer",fontSize:14}}>+ Agregar</button>
            </div>
            <div style={{color:"#334155",fontSize:11,textAlign:"center"}}>Las tareas cerradas se eliminan automáticamente cada martes</div>
            {todos.length===0&&<div style={{color:"#334155",textAlign:"center",padding:30,fontSize:15}}>Sin pendientes registrados</div>}
            {todos.map((t,i)=>(
              <div key={t.id} style={{background:t.estado==="Cerrado"?"#080e1c":"#0d1626",border:`2px solid ${t.estado==="Cerrado"?"#10b98140":t.estado==="En proceso"?"#f59e0b50":"#3b82f650"}`,borderRadius:10,padding:"14px 18px",opacity:t.estado==="Cerrado"?0.5:1}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:10}}>
                  <div style={{flex:1}}>
                    {editTodoId===t.id
                      ?<input autoFocus value={editTodoVal} onChange={e=>setEditTodoVal(e.target.value)}
                        onBlur={()=>saveEditTodo(t.id)} onKeyDown={e=>e.key==="Enter"&&saveEditTodo(t.id)}
                        style={{width:"100%",background:"#0f172a",border:"2px solid #3b82f6",borderRadius:7,
                          padding:"8px 12px",color:"#f1f5f9",fontSize:15,outline:"none",marginBottom:8}}/>
                      :<div onClick={()=>{setEditTodoId(t.id);setEditTodoVal(t.texto);}}
                        title="Clic para editar"
                        style={{color:"#f1f5f9",fontSize:15,fontWeight:600,marginBottom:8,
                          textDecoration:t.estado==="Cerrado"?"line-through":"none",lineHeight:1.4,
                          cursor:"text",borderBottom:"1px dashed #1e293b",paddingBottom:2}}>
                        {i+1}. {t.texto} <span style={{color:"#334155",fontSize:11}}>✏️</span>
                      </div>
                    }
                    <div style={{display:"flex",gap:14,alignItems:"center",flexWrap:"wrap"}}>
                      <span style={{color:"#334155",fontSize:11}}>📅 Creado: {t.fecha}</span>
                      <div style={{display:"flex",alignItems:"center",gap:6}}>
                        <span style={{color:"#475569",fontSize:11}}>🔔 Seguimiento:</span>
                        <input type="date" value={t.seguimiento} onChange={e=>updateSeg(t.id,e.target.value)}
                          style={{background:"#0f172a",border:"1px solid #1e293b",borderRadius:6,padding:"4px 10px",color:"#94a3b8",fontSize:12,outline:"none"}}/>
                      </div>
                    </div>
                  </div>
                  <div style={{display:"flex",gap:8,alignItems:"center",flexShrink:0}}>
                    <button onClick={()=>cycleTodo(t.id)}
                      style={{background:t.estado==="Cerrado"?"#10b98125":t.estado==="En proceso"?"#f59e0b25":"#3b82f625",
                        border:`1px solid ${t.estado==="Cerrado"?"#10b98150":t.estado==="En proceso"?"#f59e0b50":"#3b82f650"}`,
                        borderRadius:8,padding:"8px 16px",
                        color:t.estado==="Cerrado"?"#10b981":t.estado==="En proceso"?"#f59e0b":"#3b82f6",
                        fontSize:13,cursor:"pointer",fontWeight:700,whiteSpace:"nowrap"}}>
                      {t.estado==="Cerrado"?"✅ Cerrado":t.estado==="En proceso"?"🔄 En proceso":"⬜ Abierto"}
                    </button>
                    <button onClick={()=>delTodo(t.id)} style={{background:"none",border:"none",color:"#334155",cursor:"pointer",fontSize:18,padding:"4px 8px"}}>×</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Modal>
      )}

      {/* ── BARRA DE DÍAS CON VENTA ── */}
      <div style={{background:"#0a1628",border:"1px solid #1e3a5f",borderRadius:11,padding:14,marginBottom:10}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
          <div style={{color:"#3b82f6",fontWeight:700,fontSize:13}}>💵 Venta Semana {res?.weekNum||"—"}</div>
          <div style={{color:"#10b981",fontWeight:900,fontSize:18}}>{fmt$(ventaSem)}</div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:8}}>
          {diasSemana.map(d=>{
            const clave=d.label;
            const dv=ventaDias[clave];
            const esHoy=d.esHoy;
            return(
              <div key={clave} style={{background:esHoy?"#1e3a5f":"#0d1626",border:`2px solid ${esHoy?"#3b82f6":"#1e293b"}`,borderRadius:10,padding:"10px 6px",textAlign:"center",position:"relative"}}>
                <div style={{color:esHoy?"#3b82f6":"#475569",fontSize:11,fontWeight:esHoy?700:400,textTransform:"uppercase",letterSpacing:.5}}>{clave}</div>
                <div style={{color:"#334155",fontSize:10,marginBottom:4}}>{d.num}</div>
                {editVenta===clave
                  ?<input autoFocus type="number" value={editVentaVal}
                    onChange={e=>setEditVentaVal(e.target.value)}
                    onBlur={()=>{
                      setVentaDias(p=>({...p,[clave]:{val:editVentaVal===""?0:(parseFloat(editVentaVal)||0),auto:false,ts:"manual"}}));
                      setEditVenta(null);setEditVentaVal("");
                    }}
                    onKeyDown={e=>e.key==="Enter"&&e.target.blur()}
                    style={{width:"100%",background:"#0f172a",border:"2px solid #3b82f6",borderRadius:6,padding:"6px 4px",color:"#f1f5f9",fontSize:13,outline:"none",textAlign:"center",fontWeight:700}}/>
                  :<div onClick={()=>{setEditVenta(clave);setEditVentaVal(dv?.val||"");}}
                    style={{color:dv?.val>0?"#10b981":"#334155",fontWeight:700,fontSize:dv?.val>=1000000?12:13,marginTop:4,cursor:"text",minHeight:24,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
                    {dv?.val>0?fmt$(dv.val):<span style={{fontSize:16,color:"#1e3a5f"}}>+</span>}
                    {dv?.auto&&dv?.ts&&<div style={{color:"#334155",fontSize:8,marginTop:1}}>{dv.ts}</div>}
                  </div>
                }
              </div>
            );
          })}
        </div>
        {/* Total semana */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:8,padding:"10px 14px",background:"#060d1a",borderRadius:9,border:"1px solid #1e3a5f"}}>
          <span style={{color:"#475569",fontSize:11,textTransform:"uppercase",letterSpacing:.8}}>📊 Total semana acumulado</span>
          <span style={{color:"#10b981",fontWeight:900,fontSize:20}}>
            {fmt$(Object.values(ventaDias).reduce((s,d)=>s+(typeof d?.val==="number"?d.val:0),0))}
          </span>
        </div>
        <div style={{color:"#334155",fontSize:9,textAlign:"center"}}>Toca cualquier día para editar · El día actual se actualiza automáticamente</div>
      </div>

      {/* ── MENÚ NAVEGACIÓN ── */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:10}}>
        {[
          {id:"tractos",ic:"🚛",l:"Unidades"},
          {id:"tracker",ic:"🛣️",l:"Tracker"},
          {id:"mantenimiento",ic:"🔧",l:"MTTO"},
          {id:"cajas",ic:"📦",l:"Cajas"},
          {id:"viajes",ic:"💰",l:"Viajes"},
          {id:"ranking",ic:"🏆",l:"Ranking"},
          {id:"alertas",ic:"🔔",l:"Alertas"},
          {id:"urgencias",ic:"🔴",l:"Urgencias"},
        ].map(t=>(
          <button key={t.id} onClick={()=>t.id==="urgencias"?setUrgModal(true):setTab(t.id)}
            style={{background:"#0a1628",border:"1px solid #1e293b",borderRadius:10,padding:"12px 8px",cursor:"pointer",textAlign:"center",transition:"all .15s"}}
            onMouseOver={e=>{e.currentTarget.style.borderColor="#3b82f6";e.currentTarget.style.background="#0d1e3a";}}
            onMouseOut={e=>{e.currentTarget.style.borderColor="#1e293b";e.currentTarget.style.background="#0a1628";}}>
            <div style={{fontSize:22}}>{t.ic}</div>
            <div style={{color:"#94a3b8",fontSize:9,marginTop:4,textTransform:"uppercase",letterSpacing:.5}}>{t.l}</div>
          </button>
        ))}
      </div>

      {/* ── BLOQUES RESUMEN COLAPSABLES ── */}
      {!res&&<div style={{color:"#475569",textAlign:"center",padding:20,fontSize:13}}>Toca 🔄 para cargar datos</div>}
      {res&&<>
        {/* Venta */}
        <BloqueResumen id="venta" icon="💵" label="Venta Hoy" valor={fmt$(ventaHoy)} col="#10b981" badge={`Sem: ${fmt$(ventaSem)}`}>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:12}}>
            {["TELLO","CRISTIAN","JULIO"].map(k=>(
              <div key={k} style={{background:C[k]+"10",borderRadius:8,padding:"12px 8px",textAlign:"center"}}>
                <div style={{color:C[k],fontWeight:900,fontSize:18}}>{fmt$(venta.hoy?.[k]||0)}</div>
                <div style={{color:"#64748b",fontSize:10,marginTop:2}}>HOY · {k}</div>
                <div style={{color:"#334155",fontSize:9}}>Sem: {fmt$(venta.semana?.[k]||0)}</div>
              </div>
            ))}
          </div>
          {pBar(venta.cumpl?.TOTAL||0,6)}
          <div style={{color:"#334155",fontSize:9,marginTop:4,marginBottom:10,textAlign:"right"}}>{venta.cumpl?.TOTAL||0}% de meta semanal</div>
          <button onClick={()=>setTab("tractos")} style={{width:"100%",background:"#10b98115",border:"1px solid #10b98130",borderRadius:7,padding:"10px",color:"#10b981",fontSize:12,cursor:"pointer",fontWeight:700}}>
            Ver detalle por unidad →
          </button>
        </BloqueResumen>

        {/* OTIF + Vencidas */}
        <BloqueResumen id="otif" icon="🎯" label="OTIF / Vencidas" valor={`${pctOTIF}%`} col={pctOTIF>=85?"#10b981":"#ef4444"} badge={`${totalVencidas} vencidas`}>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:10}}>
            {[
              [`${pctOTIF}%`,"OTIF",pctOTIF>=85?"#10b981":"#ef4444",null],
              [otif.onTimeSem||0,"A tiempo","#10b981",entregas.aTiempo],
              [otif.late||0,"Tardías","#ef4444",entregas.vencidas],
              [totalVencidas,"Vencidas","#ef4444",entregas.vencidas],
            ].map(([v,l,col,rows])=>(
              <div key={l} onClick={e=>{e.stopPropagation();rows&&rows.length>0&&openSubModal({title:`🎯 ${l} — ${rows.length} entregas`,rows});}}
                style={{background:col+"10",border:`2px solid ${col}${rows&&rows.length>0?"50":"20"}`,borderRadius:10,padding:"12px 6px",textAlign:"center",cursor:rows&&rows.length>0?"pointer":"default",transition:"all .15s"}}
                onMouseOver={e=>rows&&rows.length>0&&(e.currentTarget.style.background=col+"25")}
                onMouseOut={e=>e.currentTarget.style.background=col+"10"}>
                <div style={{color:col,fontWeight:900,fontSize:24}}>{v}</div>
                <div style={{color:"#94a3b8",fontSize:11,marginTop:3}}>{l}</div>
                {rows&&rows.length>0&&<div style={{color:col,fontSize:9,marginTop:2}}>↗ ver</div>}
              </div>
            ))}
          </div>
        </BloqueResumen>

        {/* Vacantes */}
        <BloqueResumen id="vacantes" icon="🪑" label="Vacantes" valor={totalVacantes} col="#64748b">
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:10}}>
            {[["SO","#64748b","Sin Operador"],["IND","#ef4444","Indisciplina"],["PER","#a855f7","Permiso"]].map(([tipo,col,desc])=>{
              const rows=(flota.vacantes?.detalle||[]).filter(u=>String(u.motivo||"").toUpperCase().startsWith(tipo));
              const cnt=flota.vacantes?.[tipo]||0;
              return(
                <div key={tipo} onClick={e=>{e.stopPropagation();cnt>0&&openSubModal({title:`🪑 ${tipo} — ${desc} (${cnt} unidades)`,rows:rows.length>0?rows:(flota.grupos?.[tipo]||[])});}}
                  style={{background:col+"15",border:`2px solid ${col}${cnt>0?"60":"20"}`,borderRadius:10,padding:"14px 8px",textAlign:"center",cursor:cnt>0?"pointer":"default",transition:"all .15s"}}
                  onMouseOver={e=>cnt>0&&(e.currentTarget.style.background=col+"30")}
                  onMouseOut={e=>e.currentTarget.style.background=col+"15"}>
                  <div style={{color:col,fontWeight:900,fontSize:32}}>{cnt}</div>
                  <div style={{color:"#94a3b8",fontSize:12,fontWeight:700,marginTop:4}}>{tipo}</div>
                  <div style={{color:"#475569",fontSize:10,marginTop:2}}>{desc}</div>
                  {cnt>0&&<div style={{color:col,fontSize:10,marginTop:4}}>↗ ver detalle</div>}
                </div>
              );
            })}
          </div>
        </BloqueResumen>

        {/* MTTO */}
        <BloqueResumen id="mtto" icon="🔧" label="En Mantenimiento" valor={totalMtto} col="#f59e0b" badge={alertasMtto.length>0?`⚠️ ${alertasMtto.length} exceden tiempo`:""}>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:10}}>
            {[["CP","#f59e0b"],["RM","#ef4444"],["SG","#ef4444"]].map(([tipo,col])=>{
              const rows=flota.grupos?.[tipo]||[];
              return(
                <div key={tipo} onClick={e=>{e.stopPropagation();rows.length>0&&openSubModal({title:`🔧 ${tipo} — ${rows.length} unidades en mantenimiento`,rows});}}
                  style={{background:col+"15",border:`2px solid ${col}${rows.length>0?"60":"20"}`,borderRadius:10,padding:"14px 8px",textAlign:"center",cursor:rows.length>0?"pointer":"default",transition:"all .15s"}}
                  onMouseOver={e=>rows.length>0&&(e.currentTarget.style.background=col+"30")}
                  onMouseOut={e=>e.currentTarget.style.background=col+"15"}>
                  <div style={{color:col,fontWeight:900,fontSize:32}}>{rows.length}</div>
                  <div style={{color:"#94a3b8",fontSize:12,fontWeight:700,marginTop:4}}>{tipo}</div>
                  {rows.length>0&&<div style={{color:col,fontSize:10,marginTop:4}}>↗ ver detalle</div>}
                </div>
              );
            })}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            <button onClick={()=>setTab("mantenimiento")} style={{background:"#f59e0b15",border:"1px solid #f59e0b30",borderRadius:7,padding:"10px",color:"#f59e0b",fontSize:12,cursor:"pointer",fontWeight:700}}>
              🔧 Ver detalle →
            </button>
            <button onClick={e=>{e.stopPropagation();openSubModal({
              title:"✅ Liberadas esta semana",
              rows:Object.entries(
                lsGet("nal_mtto_estados_v10")||{}
              ).filter(([k,v])=>v.estado==="Liberada")
               .map(([u,v])=>({unidad:u,estadoGestion:v.estado,nuevaFecha:v.nuevaFecha||"—",comentarios:v.comentario||"—"}))
            });}} style={{background:"#10b98115",border:"1px solid #10b98130",borderRadius:7,padding:"10px",color:"#10b981",fontSize:12,cursor:"pointer",fontWeight:700}}>
              ✅ Liberadas
            </button>
          </div>
        </BloqueResumen>

        {/* Flota — cada tipo clickeable */}
        <BloqueResumen id="flota" icon="🚛" label="Flota Operando" valor={`${flota.enOperacion||0}/${flota.total||0}`} col="#10b981" badge={`${flota.pctUtilizacion||0}%`}>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8}}>
            {[["VTA","#10b981"],["TRN","#3b82f6"],["MOV","#10b981"],["LIB","#a855f7"],["DCO","#3b82f6"],["DSO","#64748b"],["CP","#f59e0b"],["RM","#ef4444"],["SG","#ef4444"],["SO","#64748b"],["IND","#ef4444"],["PER","#a855f7"]].map(([tipo,col])=>{
              const rows=flota.grupos?.[tipo]||[];
              return(
                <div key={tipo} onClick={e=>{e.stopPropagation();rows.length>0&&openSubModal({title:`🚛 ${tipo} — ${rows.length} unidades`,rows});}}
                  style={{background:col+"15",border:`2px solid ${col}${rows.length>0?"50":"20"}`,borderRadius:9,padding:"10px 6px",textAlign:"center",cursor:rows.length>0?"pointer":"default",transition:"all .15s"}}
                  onMouseOver={e=>rows.length>0&&(e.currentTarget.style.background=col+"30")}
                  onMouseOut={e=>e.currentTarget.style.background=col+"15"}>
                  <div style={{color:col,fontWeight:900,fontSize:22}}>{rows.length}</div>
                  <div style={{color:"#94a3b8",fontSize:11,fontWeight:700,marginTop:2}}>{tipo}</div>
                  {rows.length>0&&<div style={{color:col,fontSize:9,marginTop:2}}>↗</div>}
                </div>
              );
            })}
          </div>
        </BloqueResumen>

        {/* To-Do pendientes */}
        <div style={{background:"#0a1628",border:"1px solid #3b82f630",borderRadius:11,padding:14,marginBottom:8}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:18}}>✅</span>
              <div>
                <div style={{color:"#64748b",fontSize:10,textTransform:"uppercase",letterSpacing:.8}}>Mis pendientes</div>
                <div style={{color:"#3b82f6",fontWeight:900,fontSize:18}}>{todosAbiertos.length} activos</div>
              </div>
            </div>
            <button onClick={()=>setTodoModal(true)} style={{background:"#3b82f620",border:"1px solid #3b82f640",borderRadius:7,padding:"6px 12px",color:"#3b82f6",fontSize:11,cursor:"pointer",fontWeight:700}}>Ver todos →</button>
          </div>
          <div style={{display:"flex",gap:8,marginBottom:8}}>
            <input value={todoInput} onChange={e=>setTodoInput(e.target.value)}
              placeholder="+ Agregar pendiente rápido..." onKeyDown={e=>e.key==="Enter"&&addTodo()}
              style={{flex:1,background:"#0f172a",border:"1px solid #1e293b",borderRadius:7,padding:"7px 10px",color:"#f1f5f9",fontSize:12,outline:"none"}}/>
            <button onClick={addTodo} style={{background:"#3b82f620",border:"1px solid #3b82f640",borderRadius:7,padding:"7px 14px",color:"#3b82f6",fontWeight:700,cursor:"pointer"}}>+</button>
          </div>
          {todosAbiertos.slice(0,3).map((t,i)=>(
            <div key={t.id} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 8px",borderRadius:6,marginBottom:4,background:t.estado==="En proceso"?"#1a1200":"#080e1c"}}>
              <span onClick={()=>cycleTodo(t.id)} style={{fontSize:14,cursor:"pointer"}}>{t.estado==="En proceso"?"🔄":"⬜"}</span>
              <span style={{color:"#94a3b8",fontSize:11,flex:1}}>{i+1}. {t.texto}</span>
              <span onClick={()=>setTodoModal(true)} style={{color:"#334155",fontSize:9,cursor:"pointer"}}>✏️</span>
            </div>
          ))}
          {todosAbiertos.length>3&&<div style={{color:"#334155",fontSize:9,textAlign:"center",marginTop:4}}>+{todosAbiertos.length-3} más — ver todos</div>}
        </div>
      </>}
    </div>
  );
};


// ── UNIDADES v3 — Fusionado con Coordinadores + Distribución ─────────────────
const Tractos=({data})=>{
  const res=data.resumen;
  const [q,setQ]=useState(""); const [mFil,setMFil]=useState("");
  const [selCoord,setSelCoord]=useState(null); // null=tabla general, "TELLO"|"CRISTIAN"|"JULIO"
  const [modal,setModal]=useState(null);
  const [subVista,setSubVista]=useState("unidades"); // "unidades"|"circuitos"|"cajas"|"distribucion"
  if(!res) return <div style={{color:"#475569",textAlign:"center",padding:40}}>Sincroniza para cargar datos</div>;
  const grupos=res.flota?.grupos||{};
  const venta=res.venta;
  const coords=res.coordinadores||{};
  const allU=Object.values(grupos).flat();

  const TIPOS=[
    {k:"VTA",col:"#10b981",ic:"💰"},{k:"TRN",col:"#3b82f6",ic:"🔄"},{k:"MOV",col:"#10b981",ic:"🚛"},
    {k:"LIB",col:"#a855f7",ic:"🔓"},{k:"DCO",col:"#3b82f6",ic:"🔵"},{k:"DSO",col:"#64748b",ic:"📌"},
    {k:"CP",col:"#f59e0b",ic:"🔧"},{k:"RM",col:"#ef4444",ic:"🔩"},{k:"SG",col:"#ef4444",ic:"💥"},
    {k:"SO",col:"#64748b",ic:"👤"},{k:"IND",col:"#ef4444",ic:"⚠️"},{k:"PER",col:"#a855f7",ic:"📋"},
  ];

  // Vista general — tabla de todas las unidades
  const lista=allU.filter(e=>{
    const tx=q.toLowerCase();
    const matchQ=!q||(e.unidad+e.operador+(e.ruta||"")+(e.circuito||"")).toLowerCase().includes(tx);
    const matchC=!selCoord||ck(e.coordinador)===selCoord;
    const matchM=!mFil||String(e.motivo||"").toUpperCase().startsWith(mFil);
    return matchQ&&matchC&&matchM;
  });

  // Distribución por circuito
  const circMap={};
  allU.forEach(e=>{
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

  // ── Detalle por Coordinador con subvistas ──
  const DetalleCoord=({cKey})=>{
    const c=coords[cKey]; if(!c) return null;
    const col=C[cKey];
    const uCoord=allU.filter(u=>ck(u.coordinador)===cKey);
    const circCoord={};
    uCoord.forEach(u=>{
      const ci=u.circuito||"Sin circuito";
      if(!circCoord[ci])circCoord[ci]={total:0,enRuta:0,unidades:[]};
      circCoord[ci].total++;
      if(esOp(String(u.motivo||"").toUpperCase()))circCoord[ci].enRuta++;
      circCoord[ci].unidades.push(u);
    });

    return(
      <div style={{display:"flex",flexDirection:"column",gap:12}}>
        {/* Header coordinador */}
        <div style={{background:`${col}15`,border:`1px solid ${col}40`,borderRadius:12,padding:16}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
            <div>
              <div style={{color:col,fontWeight:900,fontSize:18}}>{c.nombre}</div>
              <div style={{color:"#475569",fontSize:10}}>{c.totalUnidades} unidades · {c.activas} operando · {c.eficiencia}% eficiencia</div>
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{color:col,fontWeight:900,fontSize:20}}>{fmt$(c.ventaHoy)}</div>
              <div style={{color:"#334155",fontSize:9}}>HOY · Sem: {fmt$(c.ventaSemana)}</div>
            </div>
          </div>
          {pBar(c.cumplMeta,6)}
          <div style={{color:"#334155",fontSize:8,marginTop:2,textAlign:"right"}}>{c.cumplMeta}% de meta {fmt$(c.metaSemana)}</div>
        </div>

        {/* Sub-tabs: Unidades | Circuitos | Cajas */}
        <div style={{display:"flex",gap:4,borderBottom:"1px solid #0f1e33",marginBottom:4}}>
          {[["unidades","🚛 Unidades"],["circuitos","🗺️ Circuitos"],["cajas","📦 Cajas"]].map(([id,l])=>(
            <button key={id} onClick={()=>setSubVista(id)}
              style={{background:"none",border:"none",borderBottom:subVista===id?`2px solid ${col}`:"2px solid transparent",
                color:subVista===id?"#f1f5f9":"#475569",padding:"7px 14px",cursor:"pointer",fontSize:11,
                fontWeight:subVista===id?700:400,marginBottom:-1}}>
              {l}
            </button>
          ))}
        </div>

        {/* Métricas rápidas */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6}}>
          {[
            {l:"Activas",v:c.activas,col:"#10b981",det:c.activasDetalle},
            {l:"DCO/DSO",v:c.dco+c.dso,col:"#3b82f6",det:c.dcoDetalle},
            {l:"MTTO",v:c.mtto,col:"#f59e0b",det:c.mttoDetalle},
            {l:"Vacantes",v:c.vacantes,col:"#64748b",det:c.unidadesVacantes},
          ].map(({l,v,col:c2,det})=>(
            <div key={l} onClick={()=>det&&v>0&&setModal({title:`${l} — ${c.nombre}`,rows:det,cols:COLS_UNIDAD})}
              style={{background:c2+"15",border:`1px solid ${c2}30`,borderRadius:8,padding:"10px 6px",
                textAlign:"center",cursor:v>0?"pointer":"default"}}>
              <div style={{color:c2,fontWeight:900,fontSize:20}}>{v}</div>
              <div style={{color:"#475569",fontSize:8,textTransform:"uppercase"}}>{l}</div>
              {v>0&&<div style={{color:"#334155",fontSize:7,marginTop:1}}>↗ detalle</div>}
            </div>
          ))}
        </div>

        {/* Sub-vista: Unidades */}
        {subVista==="unidades"&&(
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
              <thead><tr style={{borderBottom:`2px solid ${col}30`}}>
                {["Unidad","Operador","Motivo","Venta","Circuito","Comentarios"].map(h=>(
                  <th key={h} style={{textAlign:"left",padding:"7px 8px",color:"#475569",fontSize:9,textTransform:"uppercase"}}>{h}</th>
                ))}
              </tr></thead>
              <tbody>{uCoord.map((u,i)=>(
                <tr key={i} style={{borderBottom:"1px solid #0d1626",background:i%2===0?"#080e1c":"transparent"}}>
                  <td style={{padding:"7px 8px",color:"#f1f5f9",fontWeight:800,fontFamily:"monospace"}}>{u.unidad}</td>
                  <td style={{padding:"7px 8px",color:"#94a3b8",maxWidth:130,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{u.operador||"—"}</td>
                  <td style={{padding:"7px 8px"}}><Badge text={u.motivo||""} small/></td>
                  <td style={{padding:"7px 8px",color:u.monto>0?"#10b981":"#334155",fontWeight:u.monto>0?700:400}}>{u.monto>0?fmt$(u.monto):"—"}</td>
                  <td style={{padding:"7px 8px",color:u.circuito&&u.circuito!=="Sin circuito"?"#a78bfa":"#334155",fontSize:9,fontWeight:700}}>{u.circuito||"—"}</td>
                  <td style={{padding:"7px 8px",color:"#475569",fontSize:9,maxWidth:140,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{u.comentarios||"—"}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}

        {/* Sub-vista: Circuitos */}
        {subVista==="circuitos"&&(
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {Object.entries(circCoord).sort((a,b)=>b[1].total-a[1].total).map(([ci,info])=>(
              <div key={ci} style={{background:"#0a1628",border:`1px solid ${ci==="Sin circuito"?"#1e293b":col+"40"}`,borderRadius:9,padding:"10px 14px"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                  <div style={{color:ci==="Sin circuito"?"#334155":col,fontWeight:700,fontSize:12}}>{ci==="Sin circuito"?"⬜ Sin circuito":"🔵 "+ci}</div>
                  <div style={{display:"flex",gap:6}}>
                    <span style={{color:"#10b981",fontSize:10,fontWeight:700}}>{info.enRuta} op.</span>
                    <span style={{color:"#475569",fontSize:10}}>{info.total} total</span>
                  </div>
                </div>
                <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                  {info.unidades.map((u,i)=>(
                    <span key={i} style={{background:ec(u.motivo||"")+"20",border:`1px solid ${ec(u.motivo||"")}40`,borderRadius:5,padding:"2px 7px",fontSize:9,color:"#f1f5f9",fontFamily:"monospace",cursor:"pointer"}}
                      onClick={()=>setModal({title:`🚛 ${u.unidad} — ${u.operador||"Sin operador"}`,rows:[u],cols:COLS_UNIDAD})}>
                      {u.unidad}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Sub-vista: Cajas */}
        {subVista==="cajas"&&(
          <div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:10}}>
              {[["Cargadas",c.cajasCargadas,"#10b981"],["Disponibles",c.cajasDisponibles,"#3b82f6"],["Dañadas",c.cajasDañadas,"#ef4444"],["No loc.",c.cajasNoLocaliz,"#f97316"],["Vacías",c.cajasVacia,"#64748b"],["Total",c.totalCajas,"#f1f5f9"]].map(([l,v,col2])=>(
                <div key={l} style={{background:col2+"15",borderRadius:7,padding:"8px",textAlign:"center"}}>
                  <div style={{color:col2,fontWeight:900,fontSize:18}}>{v}</div>
                  <div style={{color:"#475569",fontSize:8}}>{l}</div>
                </div>
              ))}
            </div>
            {c.cajasDetalle?.length>0&&(
              <div style={{overflowX:"auto"}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
                  <thead><tr style={{borderBottom:"2px solid #1e293b"}}>
                    {["Caja","Estatus","Cliente","Ciudad"].map(h=><th key={h} style={{textAlign:"left",padding:"6px 8px",color:"#475569",fontSize:9,textTransform:"uppercase"}}>{h}</th>)}
                  </tr></thead>
                  <tbody>{c.cajasDetalle.map((cj,i)=>(
                    <tr key={i} style={{borderBottom:"1px solid #0d1626",background:i%2===0?"#080e1c":"transparent"}}>
                      <td style={{padding:"6px 8px",color:"#f1f5f9",fontFamily:"monospace",fontWeight:700}}>{cj.caja}</td>
                      <td style={{padding:"6px 8px"}}><Badge text={cj.estatus||""} small/></td>
                      <td style={{padding:"6px 8px",color:"#94a3b8",maxWidth:100,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{cj.cliente||"—"}</td>
                      <td style={{padding:"6px 8px",color:"#64748b",fontSize:9}}>{cj.ciudad||"—"}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return(
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      {modal&&<Modal title={modal.title} onClose={()=>setModal(null)} wide><TablaDetalle rows={modal.rows} cols={modal.cols||COLS_UNIDAD}/></Modal>}

      {/* Resumen venta */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6,textAlign:"center"}}>
        {[["TELLO","Tello",C.TELLO],["CRISTIAN","Cristian",C.CRISTIAN],["JULIO","Julio",C.JULIO],["TOTAL","Total","#f1f5f9"]].map(([k,l,col])=>(
          <div key={k} style={{background:col+"10",border:`1px solid ${col}25`,borderRadius:9,padding:"10px 6px"}}>
            <div style={{color:col,fontWeight:900,fontSize:13}}>{fmt$(venta?.hoy?.[k]||0)}</div>
            <div style={{color:"#475569",fontSize:8}}>HOY · {l}</div>
            <div style={{color:"#334155",fontSize:8}}>Sem: {fmt$(venta?.semana?.[k]||0)}</div>
          </div>
        ))}
      </div>

      {/* Botones coordinador */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8}}>
        {[["TELLO","Juan José Tello"],["CRISTIAN","Cristian Zuñiga"],["JULIO","Julio Hernández"],[null,"Todas"]].map(([k,l])=>(
          <button key={k||"all"} onClick={()=>{setSelCoord(k);setMFil("");setQ("");setSubVista("unidades");}}
            style={{background:selCoord===k?(k?C[k]+"30":"#1e293b"):"#0a1628",
              border:`2px solid ${selCoord===k?(k?C[k]:"#3b82f6"):"#1e293b"}`,
              borderRadius:9,padding:"10px 8px",cursor:"pointer",
              color:selCoord===k?"#f1f5f9":"#64748b",fontWeight:selCoord===k?700:400,fontSize:11}}>
            {k&&<div style={{width:8,height:8,borderRadius:"50%",background:C[k],margin:"0 auto 4px"}}/>}
            <div>{l}</div>
            {k&&<div style={{color:selCoord===k?"#f1f5f9":"#334155",fontSize:9}}>{coords[k]?.totalUnidades||0} u.</div>}
          </button>
        ))}
      </div>

      {/* Vista detalle por coordinador */}
      {selCoord&&<DetalleCoord cKey={selCoord}/>}

      {/* Vista general — todas las unidades */}
      {!selCoord&&(<>
        {/* Iconos por tipo con click */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:6}}>
          {TIPOS.map(t=>{
            const cnt=(grupos[t.k]||[]).length;
            const sel=mFil===t.k;
            return(
              <div key={t.k}
                onClick={()=>{setMFil(sel?"":t.k); if(!sel&&cnt>0) setModal({title:`${t.ic} ${t.k} — ${cnt} unidades`,rows:grupos[t.k]||[],cols:COLS_UNIDAD});}}
                style={{background:sel?t.col+"30":t.col+"15",border:`2px solid ${sel?t.col:t.col+"30"}`,
                  borderRadius:8,padding:"8px 4px",textAlign:"center",cursor:"pointer"}}>
                <div style={{color:t.col,fontWeight:900,fontSize:16}}>{cnt}</div>
                <div style={{color:t.col,fontSize:8,fontWeight:700}}>{t.k}</div>
                {cnt>0&&<div style={{color:t.col,fontSize:7,marginTop:1}}>↗</div>}
              </div>
            );
          })}
        </div>

        {/* Distribución por circuito */}
        <div style={{background:"#0a1628",border:"1px solid #6366f130",borderRadius:10,padding:12}}>
          <div style={{color:"#6366f1",fontWeight:700,fontSize:12,marginBottom:8}}>🗺️ Distribución por Circuito</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:6}}>
            {Object.entries(circMap).sort((a,b)=>b[1].total-a[1].total).map(([ci,info])=>(
              <div key={ci} onClick={()=>setModal({title:`🔵 Circuito: ${ci}`,rows:info.unidades,cols:COLS_UNIDAD})}
                style={{background:ci==="Sin circuito"?"#080e1c":"#0d1626",border:`1px solid ${ci==="Sin circuito"?"#1e293b":"#6366f140"}`,borderRadius:8,padding:"8px 10px",cursor:"pointer"}}>
                <div style={{color:ci==="Sin circuito"?"#334155":"#a78bfa",fontWeight:700,fontSize:10,marginBottom:4}}>{ci}</div>
                <div style={{display:"flex",gap:4,justifyContent:"space-between"}}>
                  <span style={{color:"#10b981",fontSize:10,fontWeight:700}}>{info.enRuta}op</span>
                  <span style={{color:"#3b82f6",fontSize:9}}>{info.disp}dsp</span>
                  <span style={{color:"#f59e0b",fontSize:9}}>{info.mtto}mto</span>
                  <span style={{color:"#64748b",fontSize:9}}>{info.sinOp}vac</span>
                </div>
                <div style={{color:"#334155",fontSize:7,marginTop:2}}>{info.total} total · ↗ ver</div>
              </div>
            ))}
          </div>
        </div>

        {/* Búsqueda y tabla */}
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          <input placeholder="🔍 Buscar unidad, operador, circuito..." value={q} onChange={e=>setQ(e.target.value)}
            style={{flex:1,minWidth:160,background:"#0a1628",border:"1px solid #1e293b",borderRadius:8,padding:"8px 12px",color:"#f1f5f9",fontSize:12,outline:"none"}}/>
          {mFil&&<button onClick={()=>setMFil("")} style={{background:"#1e293b",border:"none",borderRadius:8,padding:"8px 12px",color:"#94a3b8",cursor:"pointer",fontSize:11}}>✕ {mFil}</button>}
        </div>
        <div style={{color:"#475569",fontSize:11}}>{lista.length} unidades {res.flota?.fecha?" · "+res.flota.fecha:""}</div>
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
            <thead><tr style={{borderBottom:"2px solid #1e293b"}}>
              {["Unidad","Operador","Coord","Motivo","Venta","Circuito","Ruta/Ubicación","Comentarios"].map(h=>(
                <th key={h} style={{textAlign:"left",padding:"7px 8px",color:"#475569",fontSize:9,textTransform:"uppercase",whiteSpace:"nowrap"}}>{h}</th>
              ))}
            </tr></thead>
            <tbody>{lista.map((e,i)=>(
              <tr key={i} style={{borderBottom:"1px solid #0d1626",background:i%2===0?"#080e1c":"transparent"}}>
                <td style={{padding:"8px 8px",color:"#f1f5f9",fontWeight:800,fontFamily:"monospace"}}>{e.unidad}</td>
                <td style={{padding:"8px 8px",color:"#94a3b8",maxWidth:130,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{e.operador||"—"}</td>
                <td style={{padding:"8px 8px"}}><span style={{color:cc(e.coordinador),fontWeight:700,fontSize:10}}>{(e.coordinador||"").split(" ")[0]}</span></td>
                <td style={{padding:"8px 8px"}}><Badge text={e.motivo||""} small/></td>
                <td style={{padding:"8px 8px",color:e.monto>0?"#10b981":"#334155",fontWeight:e.monto>0?700:400}}>{e.monto>0?fmt$(e.monto):"—"}</td>
                <td style={{padding:"8px 8px",color:e.circuito&&e.circuito!=="Sin circuito"?"#a78bfa":"#334155",fontSize:9,fontWeight:700}}>{e.circuito||"—"}</td>
                <td style={{padding:"8px 8px",color:"#64748b",fontSize:9,maxWidth:120,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{e.ubicacion||e.ruta||"—"}</td>
                <td style={{padding:"8px 8px",color:"#475569",fontSize:9,maxWidth:130,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{e.comentarios||"—"}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </>)}
    </div>
  );
};


const Alertas=({data,setData})=>{
  const res=data.resumen;
  const [filtro,setFiltro]=useState(null);
  const [estadoAlertas,setEstadoAlertas]=useState({});
  const [modalComent,setModalComent]=useState(null);
  const [comentInput,setComentInput]=useState("");
  const [saving,setSaving]=useState(false);

  useEffect(()=>{
    const rows=data.alertasList||[];
    if(!rows.length) return;
    const mapa={};
    rows.forEach(r=>{const id=r["ID"]||r["Id"]||r["id"]||"";if(!id)return;mapa[id]={estado:r["Estado"]||"",comentario:r["Comentario"]||"",ts:r["Fecha"]||""};});
    setEstadoAlertas(mapa);
  },[data.alertasList]);

  const guardarEstado=async(idx,alerta,nuevoEstado,comentario)=>{
    const id=`${alerta.tipo}_${alerta.unidad}_${alerta.fecha}`.replace(/\s/g,"_");
    const newMap={...estadoAlertas,[id]:{estado:nuevoEstado,comentario,ts:new Date().toISOString()}};
    setEstadoAlertas(newMap);
    if(!USAR_SHEETS) return;
    setSaving(true);
    const todasAlertas=Object.entries(newMap).map(([k,v])=>({ID:k,Estado:v.estado,Comentario:v.comentario,Fecha:v.ts}));
    try{
      await apiPost("ALERTAS",todasAlertas);
      setData(prev=>({...prev,alertasList:todasAlertas}));
    }catch(e){console.error(e);}
    setSaving(false);
  };

  const buildAlertas=()=>{
    const list=[];
    (res?.entregas?.vencidas||[]).forEach(v=>list.push({tipo:"Entrega Vencida",icon:"📦",col:"#ef4444",unidad:v.unidad,caja:v.caja||"",op:v.cliente,coord:(v.coordinador||"").split(" ")[0],desc:`Cita: ${v.cita} — ${v.circuito&&v.circuito!=="Sin circuito"?v.circuito:"ver circuitos"}`,accion:"Contactar cliente y coordinar nueva cita",fecha:v.cita||""}));
    (res?.flota?.grupos?.CP||[]).forEach(e=>list.push({tipo:"CP — Correctivo",icon:"🔧",col:"#f59e0b",unidad:e.unidad,op:e.operador,coord:(e.coordinador||"").split(" ")[0],desc:e.comentarios||"En taller",accion:"Verificar fecha compromiso",fecha:res?.flota?.fecha||""}));
    (res?.flota?.grupos?.RM||[]).forEach(e=>list.push({tipo:"RM — Rep. Mayor",icon:"🔩",col:"#ef4444",unidad:e.unidad,op:e.operador,coord:(e.coordinador||"").split(" ")[0],desc:e.comentarios||"Reparación mayor",accion:"Solicitar estimado de costo y tiempo",fecha:res?.flota?.fecha||""}));
    (res?.flota?.grupos?.SG||[]).forEach(e=>list.push({tipo:"SG — Siniestro",icon:"💥",col:"#ef4444",unidad:e.unidad,op:e.operador,coord:(e.coordinador||"").split(" ")[0],desc:e.comentarios||"Siniestro/Garantía",accion:"Escalar con aseguradora",fecha:res?.flota?.fecha||""}));
    (res?.alertasMtto||[]).forEach(a=>list.push({tipo:"MTTO Excedido",icon:"⏱",col:"#ef4444",unidad:a.unidad,op:a.operador,coord:(a.coordinador||"").split(" ")[0],desc:`${a.tipo}·${a.diasEnMtto}d de ${a.limiteEsperado}d`,accion:a.accion,fecha:res?.flota?.fecha||""}));
    (res?.flota?.grupos?.SO||[]).slice(0,8).forEach(e=>list.push({tipo:"Sin Operador",icon:"👤",col:"#64748b",unidad:e.unidad,op:"VACANTE",coord:(e.coordinador||"").split(" ")[0],desc:e.comentarios||"Sin operador",accion:"Asignar operador disponible",fecha:res?.flota?.fecha||""}));
    (res?.flota?.grupos?.IND||[]).forEach(e=>list.push({tipo:"IND — Indisciplina",icon:"⚠️",col:"#ef4444",unidad:e.unidad,op:e.operador,coord:(e.coordinador||"").split(" ")[0],desc:e.comentarios||"Sanción activa",accion:"Revisar con RRHH",fecha:res?.flota?.fecha||""}));
    (data.cajasList||[]).filter(c=>c.Estatus==="Dañada").forEach(c=>list.push({tipo:"Caja Dañada",icon:"📦",col:"#f97316",unidad:"—",caja:c.Caja,op:"—",coord:(c.Coordinador||"").split(" ")[0],desc:`${c["Ciudad / Ubicación"]}·${c.Comentarios||""}`,accion:"Programar reparación",fecha:""}));
    (data.cajasList||[]).filter(c=>c.Estatus==="No localizada").forEach(c=>list.push({tipo:"Caja No Localizada",icon:"🔍",col:"#ef4444",unidad:"—",caja:c.Caja,op:"—",coord:(c.Coordinador||"").split(" ")[0],desc:c.Comentarios||"No localizada",accion:"Investigar última ubicación",fecha:""}));
    return list;
  };

  const alertas=buildAlertas();
  const getId=a=>`${a.tipo}_${a.unidad}_${a.fecha}`.replace(/\s/g,"_");
  const tipos=[...new Set(alertas.map(a=>a.tipo))];
  const porTipo={};tipos.forEach(t=>{porTipo[t]=alertas.filter(a=>a.tipo===t);});
  const lista=filtro?alertas.filter(a=>a.tipo===filtro):alertas;
  const totalSeg=alertas.filter(a=>estadoAlertas[getId(a)]?.estado==="seguimiento").length;
  const totalFin=alertas.filter(a=>estadoAlertas[getId(a)]?.estado==="finalizado").length;

  return(
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      {modalComent!==null&&(()=>{
        const a=alertas[modalComent]; const id=getId(a); const est=estadoAlertas[id]||{};
        return(<Modal title={`💬 ${a.tipo} · ${a.unidad}`} onClose={()=>setModalComent(null)}>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {est.comentario&&<div style={{background:"#0d1626",borderRadius:7,padding:"10px 12px",fontSize:11,color:"#94a3b8"}}><b style={{color:"#64748b"}}>Último comentario:</b><br/>{est.comentario}<br/><span style={{color:"#334155",fontSize:9}}>{est.ts?.slice(0,16)}</span></div>}
            <textarea value={comentInput} onChange={e=>setComentInput(e.target.value)}
              placeholder="Escribe el seguimiento, acción tomada, nueva fecha..."
              rows={4}
              style={{background:"#0f172a",border:"1px solid #1e293b",borderRadius:8,padding:"10px",color:"#f1f5f9",fontSize:12,outline:"none",resize:"vertical"}}/>
            <div style={{display:"flex",gap:8}}>
              {est.comentario&&<button onClick={()=>setComentInput(est.comentario)}
                style={{background:"#1e293b",border:"none",borderRadius:6,padding:"6px 12px",color:"#64748b",fontSize:10,cursor:"pointer"}}>
                ✏️ Editar comentario anterior
              </button>}
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
              <button onClick={async()=>{await guardarEstado(modalComent,a,"seguimiento",comentInput);setModalComent(null);setComentInput("");}}
                style={{background:"#f59e0b20",border:"1px solid #f59e0b60",borderRadius:8,padding:"10px",color:"#f59e0b",fontWeight:700,cursor:"pointer",fontSize:12}}>🔄 En seguimiento</button>
              <button onClick={async()=>{await guardarEstado(modalComent,a,"finalizado",comentInput);setModalComent(null);setComentInput("");}}
                style={{background:"#10b98120",border:"1px solid #10b98160",borderRadius:8,padding:"10px",color:"#10b981",fontWeight:700,cursor:"pointer",fontSize:12}}>✅ Finalizado</button>
            </div>
            {saving&&<div style={{color:"#f59e0b",fontSize:11,textAlign:"center"}}>Guardando en hoja ALERTAS de Sheets...</div>}
          </div>
        </Modal>);
      })()}
      <div style={{background:"#0a1628",border:"1px solid #3b82f630",borderRadius:10,padding:"10px 14px",display:"flex",gap:16,flexWrap:"wrap",alignItems:"center"}}>
        <div><span style={{color:"#f1f5f9",fontWeight:700,fontSize:16}}>{alertas.length}</span><span style={{color:"#64748b",fontSize:11,marginLeft:4}}>Alertas totales</span></div>
        <div><span style={{color:"#f59e0b",fontWeight:700,fontSize:16}}>{totalSeg}</span><span style={{color:"#64748b",fontSize:11,marginLeft:4}}>En seguimiento</span></div>
        <div><span style={{color:"#10b981",fontWeight:700,fontSize:16}}>{totalFin}</span><span style={{color:"#64748b",fontSize:11,marginLeft:4}}>Finalizadas</span></div>
        <div><span style={{color:"#3b82f6",fontWeight:700,fontSize:16}}>{alertas.length>0?((totalFin/alertas.length)*100).toFixed(0):0}%</span><span style={{color:"#64748b",fontSize:11,marginLeft:4}}>resueltas</span></div>
        {saving&&<span style={{color:"#f59e0b",fontSize:10,marginLeft:"auto"}}>💾 Guardando...</span>}
        {filtro&&<button onClick={()=>setFiltro(null)} style={{marginLeft:"auto",background:"#1e293b",border:"none",borderRadius:6,padding:"4px 10px",color:"#94a3b8",fontSize:11,cursor:"pointer"}}>✕ Limpiar</button>}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(110px,1fr))",gap:8}}>
        {tipos.map(t=>{const grp=porTipo[t];const col=grp[0]?.col||"#64748b";const ic=grp[0]?.icon||"🔔";const sel=filtro===t;return(
          <div key={t} onClick={()=>setFiltro(sel?null:t)} style={{background:sel?col+"30":col+"15",border:`2px solid ${sel?col:col+"40"}`,borderRadius:10,padding:"10px 8px",cursor:"pointer",textAlign:"center"}}>
            <div style={{fontSize:22}}>{ic}</div>
            <div style={{color:col,fontWeight:900,fontSize:20,lineHeight:1}}>{grp.length}</div>
            <div style={{color:sel?"#f1f5f9":"#64748b",fontSize:8,textTransform:"uppercase",marginTop:2}}>{t.replace("—","·")}</div>
          </div>);
        })}
      </div>
      <div style={{color:"#475569",fontSize:11}}>{lista.length} alertas {filtro?`· ${filtro}`:""}</div>
      {lista.length===0&&<div style={{color:"#334155",textAlign:"center",padding:24}}>✅ Sin alertas en esta categoría</div>}
      {lista.map((a,i)=>{
        const idx=alertas.indexOf(a); const id=getId(a); const est=estadoAlertas[id]||{}; const col=a.col;
        const borderCol=est.estado==="finalizado"?"#10b981":est.estado==="seguimiento"?"#f59e0b":col;
        return(<div key={i} style={{background:"#0a1628",border:`1px solid ${col}25`,borderLeft:`3px solid ${borderCol}`,borderRadius:8,padding:"12px 14px",opacity:est.estado==="finalizado"?0.55:1}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
            <div style={{flex:1}}>
              <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:4,flexWrap:"wrap"}}>
                <Badge text={a.tipo}/>
                {a.fecha&&<span style={{color:"#334155",fontSize:10}}>{a.fecha}</span>}
                {est.estado==="seguimiento"&&<span style={{color:"#f59e0b",fontSize:9,fontWeight:700}}>🔄 En seguimiento</span>}
                {est.estado==="finalizado"&&<span style={{color:"#10b981",fontSize:9,fontWeight:700}}>✅ Finalizado</span>}
              </div>
              <div style={{color:"#cbd5e1",fontSize:12,fontWeight:700,marginBottom:2}}>{a.op}</div>
              <div style={{color:"#475569",fontSize:11,marginBottom:4}}>{a.unidad&&a.unidad!=="—"&&<span>🚛 {a.unidad} </span>}{a.caja&&<span>📦 {a.caja} </span>}— {a.desc}</div>
              {est.comentario&&<div style={{background:"#0d1626",borderRadius:6,padding:"5px 10px",fontSize:10,color:"#64748b",marginBottom:4}}>💬 {est.comentario}<span style={{color:"#334155",marginLeft:6,fontSize:8}}>{est.ts?.slice(0,10)}</span></div>}
              <div style={{background:"#0d1626",borderRadius:6,padding:"5px 10px",fontSize:10,color:"#3b82f6"}}>💡 <b>Acción:</b> {a.accion}</div>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:5,marginLeft:10,alignItems:"flex-end",flexShrink:0}}>
              <span style={{color:cc(a.coord||""),fontSize:10,fontWeight:700}}>{a.coord}</span>
              <button onClick={()=>{setModalComent(idx);setComentInput(est.comentario||"");}}
                style={{background:"#1e3a5f",border:"1px solid #3b82f640",borderRadius:6,padding:"3px 8px",color:"#3b82f6",fontSize:9,cursor:"pointer",fontWeight:700}}>💬 Comentar</button>
              {!est.estado&&<button onClick={()=>guardarEstado(idx,a,"seguimiento",est.comentario||"")}
                style={{background:"#f59e0b20",border:"1px solid #f59e0b50",borderRadius:6,padding:"3px 8px",color:"#f59e0b",fontSize:9,cursor:"pointer",fontWeight:700}}>🔄 Seguimiento</button>}
              {est.estado==="seguimiento"&&<button onClick={()=>guardarEstado(idx,a,"finalizado",est.comentario||"")}
                style={{background:"#10b98120",border:"1px solid #10b98150",borderRadius:6,padding:"3px 8px",color:"#10b981",fontSize:9,cursor:"pointer",fontWeight:700}}>✅ Finalizado</button>}
              {est.estado==="finalizado"&&<button onClick={()=>guardarEstado(idx,a,"",est.comentario||"")}
                style={{background:"#1e293b",border:"1px solid #334155",borderRadius:6,padding:"3px 8px",color:"#64748b",fontSize:9,cursor:"pointer"}}>↩ Reabrir</button>}
            </div>
          </div>
        </div>);
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
        <div style={{color:"#475569",fontSize:10,textTransform:"uppercase",letterSpacing:.8,marginBottom:6}}>🚛 {c.totalUnidades} Unidades <span style={{color:"#334155",fontSize:8}}>(clic = detalle)</span></div>
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


// ── MANTENIMIENTO v3 — Priorización operativa + Simulación taller ───────────────
const FALLAS_DB = [
  {kw:"motor",        pr:1, dias:5, base:"DETENER UNIDAD INMEDIATAMENTE. Prioridad crítica. No operar."},
  {kw:"transmision",  pr:1, dias:4, base:"Enviar a taller de inmediato. Riesgo alto de daño mayor."},
  {kw:"transmisión",  pr:1, dias:4, base:"Enviar a taller de inmediato. Riesgo alto de daño mayor."},
  {kw:"fuga de aceite",pr:1,dias:2, base:"Ingresar a taller en cuanto haya espacio. Evitar ruta larga."},
  {kw:"frenos",       pr:1, dias:2, base:"NO OPERAR. Riesgo de seguridad. Atención inmediata."},
  {kw:"freno",        pr:1, dias:2, base:"NO OPERAR. Riesgo de seguridad. Atención inmediata."},
  {kw:"suspension",   pr:2, dias:3, base:"Programar ingreso en corto plazo. Operar con restricción."},
  {kw:"suspensión",   pr:2, dias:3, base:"Programar ingreso en corto plazo. Operar con restricción."},
  {kw:"diferencial",  pr:2, dias:4, base:"Programar ingreso. Revisar carga máxima mientras tanto."},
  {kw:"electrico",    pr:2, dias:2, base:"Revisar sistema eléctrico. Operar con precaución."},
  {kw:"eléctrico",    pr:2, dias:2, base:"Revisar sistema eléctrico. Operar con precaución."},
  {kw:"enfriamiento", pr:2, dias:2, base:"Revisar sistema de enfriamiento. Evitar rutas largas."},
  {kw:"radiador",     pr:2, dias:2, base:"Revisar radiador antes de operar."},
  {kw:"llantas",      pr:3, dias:1, base:"Programar cambio sin detener operación si es posible."},
  {kw:"llanta",       pr:3, dias:1, base:"Programar cambio sin detener operación si es posible."},
  {kw:"luces",        pr:3, dias:1, base:"Corregir en patio. No requiere taller mayor."},
  {kw:"luz",          pr:3, dias:1, base:"Corregir en patio. No requiere taller mayor."},
  {kw:"estetico",     pr:4, dias:1, base:"Postergar. No impacta operación."},
  {kw:"estético",     pr:4, dias:1, base:"Postergar. No impacta operación."},
  {kw:"carroceria",   pr:4, dias:1, base:"Postergar. No impacta operación."},
  {kw:"preventivo",   pr:3, dias:1, base:"Mantenimiento preventivo programado. Baja urgencia."},
  {kw:"revision",     pr:3, dias:1, base:"Revisión programada. Coordinar con operación."},
  {kw:"revisión",     pr:3, dias:1, base:"Revisión programada. Coordinar con operación."},
];

const clasificarFalla=(comentario)=>{
  const txt=(comentario||"").toLowerCase();
  for(const f of FALLAS_DB){
    if(txt.includes(f.kw)) return {prioridad:f.pr,diasRep:f.dias,accionBase:f.base,keyword:f.kw};
  }
  return {prioridad:2,diasRep:2,accionBase:"Revisar manualmente. Clasificación no identificada.",keyword:"—"};
};

const simularTaller=(unidades)=>{
  // Ordenar por prioridad → fecha compromiso
  const sorted=[...unidades].sort((a,b)=>{
    if(a.prioridad!==b.prioridad) return a.prioridad-b.prioridad;
    const fa=a.fechaCompromiso||"9999"; const fb=b.fechaCompromiso||"9999";
    return fa<fb?-1:fa>fb?1:0;
  });
  const hoy=new Date(); hoy.setHours(0,0,0,0);
  let cursor=new Date(hoy);
  return sorted.map(u=>{
    const inicioReal=new Date(cursor);
    const finReal=new Date(cursor); finReal.setDate(finReal.getDate()+u.diasRep);
    cursor=new Date(finReal); // siguiente empieza cuando termina ésta
    const diasEspera=Math.max(0,Math.round((inicioReal-hoy)/86400000));
    // Validar promesa
    let riesgoAtraso=false;
    if(u.fechaCompromiso&&u.fechaCompromiso!=="—"){
      const promD=new Date(u.fechaCompromiso+"T12:00:00");
      if(!isNaN(promD)&&finReal>promD) riesgoAtraso=true;
    }
    // Acción ejecutiva
    let accion=u.accionBase;
    if(u.prioridad===1) accion="🔴 DETENER UNIDAD / INGRESAR INMEDIATO A TALLER. "+accion;
    if(diasEspera>2)    accion+=" ⏰ ESCALAR: lleva "+diasEspera+"d en cola.";
    if(riesgoAtraso)    accion+=" 📅 REPROGRAMAR PROMESA o ASIGNAR RECURSO ADICIONAL.";
    if(u.prioridad>=4)  accion="🟢 PROGRAMAR SIN AFECTAR OPERACIÓN. "+accion;
    const fmtD=d=>d.toISOString().slice(0,10);
    return {...u,inicioReal:fmtD(inicioReal),finReal:fmtD(finReal),diasEspera,riesgoAtraso,accionFinal:accion};
  });
};

const Mantenimiento=({data,setData})=>{
  const res=data.resumen;
  if(!res) return <div style={{color:"#475569",textAlign:"center",padding:40}}>Sincroniza para cargar datos</div>;
  const grupos=res.flota?.grupos||{};
  const [selTab,setSelTab]=useState("CP");
  const MTTO_LS_KEY="nal_mtto_estados_v10";
  const [mttoEstados,setMttoEstados]=useState(()=>{
    try{const r=localStorage.getItem("nal_mtto_estados_v10");return r?JSON.parse(r):{};}catch(e){return{};}
  });
  const [modalGest,setModalGest]=useState(null);
  const [formGest,setFormGest]=useState({});
  const [saving,setSaving]=useState(false);
  const [vistaMode,setVistaMode]=useState("tabla"); // "tabla" | "triage"
  const [liberadasModal,setLiberadasModal]=useState(false);
  const alertasMtto=res.alertasMtto||[];

  const CONF=[
    {k:"CP",l:"CP — Correctivo/Prev.",col:"#f59e0b",ic:"🔧",desc:"Correctivo preventivo"},
    {k:"RM",l:"RM — Reparación Mayor", col:"#ef4444",ic:"🔩",desc:"Reparación mayor"},
    {k:"SG",l:"SG — Siniestro/Garantía",col:"#ef4444",ic:"💥",desc:"Siniestro o garantía"},
  ];
  const cfg=CONF.find(c=>c.k===selTab)||CONF[0];
  const filas=grupos[selTab]||[];

  // Merge Sheets data with local state (local wins for edited items)
  useEffect(()=>{
    const rows=data.mttoList||[];
    if(rows.length===0) return;
    const m={};
    rows.forEach(r=>{ if(r["Unidad"]) m[r["Unidad"]]={estado:r["Estado"]||"",nuevaFecha:r["Nueva Fecha"]||"",comentario:r["Comentario"]||""}; });
    setMttoEstados(prev=>{
      // Keep local changes, merge with sheets
      const merged={...m};
      Object.keys(prev).forEach(u=>{ if(prev[u].estado) merged[u]=prev[u]; });
      return merged;
    });
  },[data.mttoList]);

  // Persist mttoEstados to localStorage on every change
  useEffect(()=>{
    try{localStorage.setItem("nal_mtto_estados_v10",JSON.stringify(mttoEstados));}catch(e){}
  },[mttoEstados]);

  const guardarGestion=async()=>{
    if(!modalGest) return;
    const unidad=modalGest.unidad;
    const nuevo={...mttoEstados,[unidad]:{...formGest}};
    setMttoEstados(nuevo);
    setSaving(true);
    const rows=Object.entries(nuevo).map(([u,v])=>({Unidad:u,Estado:v.estado,["Nueva Fecha"]:v.nuevaFecha,Comentario:v.comentario,Fecha:new Date().toISOString().slice(0,10)}));
    try{
      await apiPost("MANTENIMIENTO",rows);
      // Update local data immediately so it persists across tab changes
      setData(prev=>({...prev,mttoList:rows}));
    }catch(e){ console.error(e); }
    setSaving(false);
    setModalGest(null);
  };

  const enrichRow=(row)=>{
    const fc=row.fechaCompromisoUnidad||row["FechaCompromisoUnidad"]||row["Fecha compromiso unidad"]||"";
    const dias=diasDesde(fc);
    const sem=semaforoDias(dias);
    const est=mttoEstados[row.unidad]||{};
    const clas=clasificarFalla(row.comentarios);
    return {...row,
      fechaCompromiso:fc, diasAtraso:dias, semaforo:sem,
      estadoGestion:est.estado||"", nuevaFecha:est.nuevaFecha||"", comentarioGestion:est.comentario||"",
      prioridad:clas.prioridad, diasRep:clas.diasRep, accionBase:clas.accionBase, keyword:clas.keyword
    };
  };

  // Todas las unidades MTTO para triage (CP+RM+SG juntas)
  const todasMtto=[
    ...(grupos.CP||[]).map(r=>({...enrichRow(r),tipo:"CP"})),
    ...(grupos.RM||[]).map(r=>({...enrichRow(r),tipo:"RM"})),
    ...(grupos.SG||[]).map(r=>({...enrichRow(r),tipo:"SG"})),
  ];
  const triageData=simularTaller(todasMtto);

  const prioColor=(p)=>p===1?"#ef4444":p===2?"#f59e0b":p===3?"#3b82f6":"#10b981";
  const prioLabel=(p)=>p===1?"🔴 CRÍTICA":p===2?"🟡 ALTA":p===3?"🔵 MEDIA":"🟢 BAJA";

  // Separate liberadas from active queue
  const todasFilas=filas.map(enrichRow);
  const liberadas=todasFilas.filter(r=>r.estadoGestion==="Liberada");
  const filasEnriquecidas=todasFilas.filter(r=>r.estadoGestion!=="Liberada");
  const atrasadas=filasEnriquecidas.filter(r=>r.diasAtraso!==null&&r.diasAtraso>0);
  // All liberadas across CP/RM/SG for the week
  const todasLiberadas=[
    ...((grupos.CP||[]).map(enrichRow).filter(r=>r.estadoGestion==="Liberada")),
    ...((grupos.RM||[]).map(enrichRow).filter(r=>r.estadoGestion==="Liberada")),
    ...((grupos.SG||[]).map(enrichRow).filter(r=>r.estadoGestion==="Liberada")),
  ];

  return(
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      {/* Modal gestión */}
      {modalGest&&(
        <Modal title={`🔧 Gestión — ${modalGest.unidad}`} onClose={()=>setModalGest(null)}>
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            {/* Info triage */}
            <div style={{background:"#0a1628",borderRadius:8,padding:12,display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
              <div><div style={{color:"#475569",fontSize:9,textTransform:"uppercase"}}>Prioridad</div>
                <div style={{color:prioColor(modalGest.prioridad),fontWeight:700,fontSize:13}}>{prioLabel(modalGest.prioridad)}</div></div>
              <div><div style={{color:"#475569",fontSize:9,textTransform:"uppercase"}}>Días estimados</div>
                <div style={{color:"#f1f5f9",fontWeight:700}}>{modalGest.diasRep} días en taller</div></div>
              <div><div style={{color:"#475569",fontSize:9,textTransform:"uppercase"}}>F. Compromiso</div>
                <div style={{color:modalGest.semaforo?.col||"#475569",fontWeight:700}}>{modalGest.fechaCompromiso||"—"}</div></div>
              <div><div style={{color:"#475569",fontSize:9,textTransform:"uppercase"}}>Estado semáforo</div>
                <div style={{color:modalGest.semaforo?.col||"#475569",fontWeight:700}}>{modalGest.semaforo?.label||"—"}</div></div>
            </div>
            {/* Acción sugerida */}
            <div style={{background:"#1a1000",border:"1px solid #f59e0b40",borderRadius:8,padding:"10px 12px"}}>
              <div style={{color:"#f59e0b",fontSize:10,fontWeight:700,marginBottom:4}}>💡 Acción sugerida</div>
              <div style={{color:"#94a3b8",fontSize:11}}>{modalGest.accionBase}</div>
            </div>
            <Input label="Estado de gestión" value={formGest.estado||""} onChange={v=>setFormGest(p=>({...p,estado:v}))}
              options={["Pendiente","En proceso","No cumplió — reprogramada","Liberada","Nueva falla"]}/>
            <Input label="Nueva fecha compromiso" value={formGest.nuevaFecha||""} onChange={v=>setFormGest(p=>({...p,nuevaFecha:v}))} type="date"/>
            <div style={{display:"flex",flexDirection:"column",gap:4}}>
              <label style={{fontSize:11,color:"#64748b",textTransform:"uppercase"}}>Comentario</label>
              <textarea value={formGest.comentario||""} onChange={e=>setFormGest(p=>({...p,comentario:e.target.value}))} rows={3}
                style={{background:"#0f172a",border:"1px solid #1e293b",borderRadius:7,padding:"8px 10px",color:"#f1f5f9",fontSize:12,outline:"none",resize:"vertical"}}/>
            </div>
            <button onClick={guardarGestion} style={{background:"#3b82f620",border:"1px solid #3b82f660",borderRadius:8,padding:"10px",color:"#3b82f6",fontWeight:700,cursor:"pointer",fontSize:12}}>
              💾 Guardar {USAR_SHEETS?"+ Sync Sheets":""}
            </button>
            {saving&&<div style={{color:"#f59e0b",fontSize:11,textAlign:"center"}}>Guardando...</div>}
          </div>
        </Modal>
      )}

      <div style={{background:"#0a1628",border:"1px solid #1e3a5f",borderRadius:8,padding:"8px 12px",fontSize:11,color:"#3b82f6"}}>
        ℹ️ MTTO = CP + RM + SG · Fechas compromiso desde Estatus_diario · {todasMtto.length} unidades total
      </div>

      {/* Alertas tiempo excedido */}
      {alertasMtto.length>0&&(
        <div style={{background:"#1f0f0a",border:"1px solid #ef444440",borderRadius:10,padding:"12px 14px"}}>
          <div style={{color:"#ef4444",fontWeight:700,fontSize:12,marginBottom:8}}>⏱ {alertasMtto.length} unidades EXCEDEN tiempo estimado</div>
          {alertasMtto.map((a,i)=>(
            <div key={i} style={{background:"#2d0a0a",borderRadius:7,padding:"8px 10px",marginBottom:6,fontSize:10}}>
              <span style={{color:"#f1f5f9",fontWeight:700,fontFamily:"monospace"}}>{a.unidad}</span>&nbsp;
              <Badge text={a.tipo} small/>&nbsp;
              <span style={{color:"#ef4444",fontWeight:700}}>{a.diasEnMtto}d de {a.limiteEsperado}d</span>
              <span style={{color:"#64748b",marginLeft:6}}>{a.comentarios}</span>
              <div style={{color:"#f59e0b",marginTop:4}}>💡 {a.accion}</div>
            </div>
          ))}
        </div>
      )}

      {/* Atrasadas vs promesa */}
      {atrasadas.length>0&&(
        <div style={{background:"#1a1100",border:"1px solid #f59e0b40",borderRadius:10,padding:"12px 14px"}}>
          <div style={{color:"#f59e0b",fontWeight:700,fontSize:12,marginBottom:8}}>📅 {atrasadas.length} unidades con fecha compromiso VENCIDA</div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            {atrasadas.map((r,i)=>(
              <div key={i} style={{background:"#2d1a00",borderRadius:7,padding:"6px 10px",fontSize:10}}>
                <span style={{color:"#f1f5f9",fontWeight:700,fontFamily:"monospace"}}>{r.unidad}</span>
                <span style={{color:r.semaforo.col,marginLeft:6,fontWeight:700}}>{r.semaforo.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Liberadas modal */}
      {liberadasModal&&<Modal title={`✅ Unidades Liberadas esta semana (${todasLiberadas.length})`} onClose={()=>setLiberadasModal(false)} wide>
        <div style={{marginBottom:12,color:"#10b981",fontSize:12}}>Unidades que salieron de mantenimiento — guardado en historial</div>
        <TablaDetalle rows={todasLiberadas} cols={[
          {k:"unidad",l:"Unidad",col:()=>"#f1f5f9",bold:true,mono:true},
          {k:"tipo",l:"Tipo",render:r=><Badge text={r.tipo||selTab} small/>},
          {k:"operador",l:"Operador",mw:140,col:()=>"#94a3b8"},
          {k:"coordinador",l:"Coord",render:r=><span style={{color:cc(r.coordinador||""),fontWeight:700}}>{(r.coordinador||"").split(" ")[0]}</span>},
          {k:"nuevaFecha",l:"F.Liberación",col:()=>"#10b981",bold:true},
          {k:"comentarioGestion",l:"Comentarios",mw:200,col:()=>"#64748b",fs:10},
        ]}/>
      </Modal>}

      {/* Tabs CP/RM/SG + Liberadas */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
        {CONF.map(c=>(
          <div key={c.k} onClick={()=>setSelTab(c.k)} style={{background:selTab===c.k?c.col+"30":c.col+"15",border:`2px solid ${c.col}${selTab===c.k?"80":"30"}`,borderRadius:10,padding:"12px 8px",cursor:"pointer",textAlign:"center"}}>
            <div style={{fontSize:24}}>{c.ic}</div>
            <div style={{color:c.col,fontWeight:900,fontSize:26}}>{(grupos[c.k]||[]).length}</div>
            <div style={{color:"#475569",fontSize:9,textTransform:"uppercase"}}>{c.k}</div>
          </div>
        ))}
      </div>

      {/* Liberadas button */}
      {todasLiberadas.length>0&&(
        <button onClick={()=>setLiberadasModal(true)}
          style={{width:"100%",background:"#10b98115",border:"1px solid #10b98140",borderRadius:9,padding:"10px",color:"#10b981",fontSize:12,cursor:"pointer",fontWeight:700,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span>✅ Liberadas esta semana: {todasLiberadas.length} unidades</span>
          <span>↗ ver historial</span>
        </button>
      )}

      {/* Vista selector: Tabla | Triage */}
      <div style={{display:"flex",gap:4,borderBottom:"1px solid #0f1e33"}}>
        {[["tabla","📋 Tabla detalle"],["triage","🏥 Cola de taller"]].map(([id,l])=>(
          <button key={id} onClick={()=>setVistaMode(id)}
            style={{background:"none",border:"none",borderBottom:vistaMode===id?"2px solid #3b82f6":"2px solid transparent",
              color:vistaMode===id?"#f1f5f9":"#475569",padding:"8px 16px",cursor:"pointer",
              fontSize:12,fontWeight:vistaMode===id?700:400,marginBottom:-1}}>
            {l}
          </button>
        ))}
      </div>

      {/* ── VISTA: TABLA DETALLE ── */}
      {vistaMode==="tabla"&&(
        <div style={{background:"#0a1628",border:`1px solid ${cfg.col}30`,borderRadius:11,padding:14}}>
          <div style={{color:cfg.col,fontWeight:700,fontSize:13,marginBottom:4}}>{cfg.ic} {cfg.l} — {filas.length} unidades</div>
          {filas.length===0
            ?<div style={{color:"#334155",textAlign:"center",padding:16}}>Sin unidades en esta categoría</div>
            :<div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
                <thead><tr style={{borderBottom:"2px solid #1e293b"}}>
                  {["Unidad","Operador","Coord","Motivo","Prioridad","Días Rep.","F.Compromiso","Estado","Semáforo","Circuito","Gestión"].map(h=>
                    <th key={h} style={{textAlign:"left",padding:"7px 8px",color:"#475569",fontSize:9,textTransform:"uppercase",whiteSpace:"nowrap"}}>{h}</th>
                  )}
                </tr></thead>
                <tbody>{filasEnriquecidas.map((e,i)=>(
                  <tr key={e.unidad+i} style={{borderBottom:"1px solid #0d1626",background:i%2===0?"#080e1c":"transparent"}}>
                    <td style={{padding:"8px 8px",color:"#f1f5f9",fontWeight:800,fontFamily:"monospace"}}>{e.unidad}</td>
                    <td style={{padding:"8px 8px",color:"#94a3b8",maxWidth:130,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{e.operador}</td>
                    <td style={{padding:"8px 8px"}}><span style={{color:cc(e.coordinador),fontWeight:700,fontSize:10}}>{(e.coordinador||"").split(" ")[0]}</span></td>
                    <td style={{padding:"8px 8px"}}><Badge text={e.motivo||""} small/></td>
                    <td style={{padding:"8px 8px"}}><span style={{color:prioColor(e.prioridad),fontWeight:700,fontSize:10}}>{prioLabel(e.prioridad)}</span></td>
                    <td style={{padding:"8px 8px",color:"#6366f1",fontWeight:700,textAlign:"center"}}>{e.diasRep}d</td>
                    <td style={{padding:"8px 8px",color:e.semaforo?.col||"#475569",fontWeight:700,fontSize:10}}>{e.fechaCompromiso||"—"}</td>
                    <td style={{padding:"8px 8px",fontSize:9}}>{e.estadoGestion?<Badge text={e.estadoGestion} small/>:"—"}</td>
                    <td style={{padding:"8px 8px",fontWeight:700,color:e.semaforo?.col||"#475569",fontSize:10}}>{e.semaforo?.label||"—"}</td>
                    <td style={{padding:"8px 8px",color:e.circuito&&e.circuito!=="Sin circuito"?"#a78bfa":"#334155",fontSize:10,fontWeight:700}}>{e.circuito||"—"}</td>
                    <td style={{padding:"8px 8px"}}>
                      <button onClick={()=>{setModalGest(e);setFormGest({estado:e.estadoGestion||"",nuevaFecha:e.nuevaFecha||"",comentario:e.comentarioGestion||""});}}
                        style={{background:"#1e293b",border:"none",borderRadius:6,padding:"4px 10px",color:"#94a3b8",cursor:"pointer",fontSize:10}}>✏️ Gestión</button>
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          }
        </div>
      )}

      {/* ── VISTA: COLA DE TALLER (TRIAGE) ── */}
      {vistaMode==="triage"&&(
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          <div style={{background:"#0a1628",border:"1px solid #6366f130",borderRadius:8,padding:"8px 14px",fontSize:11,color:"#6366f1"}}>
            🏥 Cola de taller simulada — {triageData.length} unidades ordenadas por prioridad + fecha. Los tiempos son estimados.
          </div>
          {triageData.length===0&&<div style={{color:"#334155",textAlign:"center",padding:24}}>Sin unidades en MTTO actualmente</div>}
          {triageData.map((u,i)=>{
            const pc=prioColor(u.prioridad);
            return(
              <div key={u.unidad+i} style={{background:"#0a1628",border:`1px solid ${pc}${u.riesgoAtraso?"80":"30"}`,borderLeft:`4px solid ${pc}`,borderRadius:10,padding:"14px 16px"}}>
                {/* Header */}
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:6,marginBottom:10}}>
                  <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                    <span style={{fontSize:18,fontWeight:900,color:"#334155"}}>{i+1}</span>
                    <span style={{color:"#f1f5f9",fontWeight:900,fontFamily:"monospace",fontSize:15}}>{u.unidad}</span>
                    <Badge text={u.tipo} small/>
                    <span style={{background:pc+"20",color:pc,borderRadius:6,padding:"2px 8px",fontSize:10,fontWeight:700}}>{prioLabel(u.prioridad)}</span>
                    {u.riesgoAtraso&&<span style={{background:"#ef444420",color:"#ef4444",borderRadius:6,padding:"2px 8px",fontSize:10,fontWeight:700}}>⚠️ RIESGO ATRASO</span>}
                  </div>
                  <span style={{color:cc(u.coordinador),fontSize:11,fontWeight:700}}>{(u.coordinador||"").split(" ")[0]}</span>
                </div>
                {/* Métricas */}
                <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:10}}>
                  {[
                    ["⏳ Espera",`${u.diasEspera}d`,u.diasEspera>2?"#ef4444":"#10b981"],
                    ["🔧 Reparación",`${u.diasRep}d`,"#6366f1"],
                    ["📅 Inicio real",u.inicioReal,"#3b82f6"],
                    ["✅ Fin real",u.finReal,u.riesgoAtraso?"#ef4444":"#10b981"],
                  ].map(([l,v,col])=>(
                    <div key={l} style={{background:col+"10",border:`1px solid ${col}25`,borderRadius:7,padding:"8px",textAlign:"center"}}>
                      <div style={{color:col,fontWeight:900,fontSize:12}}>{v}</div>
                      <div style={{color:"#475569",fontSize:8,textTransform:"uppercase",marginTop:2}}>{l}</div>
                    </div>
                  ))}
                </div>
                {/* Promesa vs fin */}
                {u.fechaCompromiso&&<div style={{display:"flex",gap:8,marginBottom:8,fontSize:10,flexWrap:"wrap"}}>
                  <span style={{color:"#64748b"}}>Promesa: <b style={{color:u.semaforo?.col||"#f1f5f9"}}>{u.fechaCompromiso}</b></span>
                  <span style={{color:"#334155"}}>→</span>
                  <span style={{color:"#64748b"}}>Fin real: <b style={{color:u.riesgoAtraso?"#ef4444":"#10b981"}}>{u.finReal}</b></span>
                  {u.riesgoAtraso&&<span style={{color:"#ef4444",fontWeight:700}}>⚠️ ATRASO ESTIMADO</span>}
                </div>}
                {/* Comentario */}
                {u.comentarios&&<div style={{background:"#060d1a",borderRadius:6,padding:"6px 10px",fontSize:10,color:"#64748b",marginBottom:8}}>
                  📝 {u.comentarios.slice(0,100)}{u.comentarios.length>100?"...":""}
                </div>}
                {/* Acción ejecutiva */}
                <div style={{background:"#1a1000",border:"1px solid #f59e0b30",borderRadius:7,padding:"8px 12px",fontSize:10}}>
                  <span style={{color:"#f59e0b",fontWeight:700}}>💡 Acción: </span>
                  <span style={{color:"#94a3b8"}}>{u.accionFinal}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};


// ── DISTRIBUCIÓN — circuitos dinámicos ────────────────────────────────────────

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
              <div key={p.patio} onClick={()=>setModalPatio(p)}
                style={{background:"#0a1628",border:"1px solid #1e293b",borderRadius:8,padding:"8px 12px",cursor:"pointer",minWidth:100}}>
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
  const [q,setQ]=useState(""); const [coordFil,setCoordFil]=useState(""); const [vistaMode,setVistaMode]=useState("lista");
  const viajesSrc=data.resumen?.viajesSemana||data.viajesList||[];
  const viajes=viajesSrc.filter(v=>{const t=q.toLowerCase();return(!q||(String(v.Unidad)+v.Cliente+v.Coordinador+v.Caja).toLowerCase().includes(t))&&(!coordFil||ck(v.Coordinador)===coordFil);});
  const otif=data.resumen?.otif;
  const $v=v=>$n(v["Venta real"]||v["Monto"]||v["Venta"]||0);
  const finalizados=viajes.filter(v=>["finalizado","entregado","terminado"].some(s=>(v["Estatus viaje"]||"").toLowerCase().includes(s)));
  const totV=finalizados.reduce((s,v)=>s+$v(v),0);
  const weekNum=data.resumen?.weekNum||"";

  // ── Tablero Ventanas ── agrupado por Circuito x Día desde hoja VIAJES
  const Tablero=()=>{
    const [modalV,setModalV]=useState(null);
    const ahora=new Date();
    const cardColor=(v)=>{
      const cita=v["Cita descarga"]?new Date(v["Cita descarga"]):null;
      const real=v["Fecha descarga"]?new Date(v["Fecha descarga"]):null;
      const fin=["finalizado","entregado","terminado"].some(s=>(v["Estatus viaje"]||"").toLowerCase().includes(s));
      if(fin&&cita&&real&&!isNaN(cita)&&!isNaN(real)){const d=Math.round((real-cita)/60000);return d<=0?"#10b981":d<=60?"#f59e0b":"#ef4444";}
      if(fin) return "#10b981";
      if(cita&&!isNaN(cita)&&!real){const d=Math.round((ahora-cita)/60000);return d>120?"#ef4444":d>0?"#f59e0b":"#3b82f6";}
      return "#475569";
    };
    const rawCircuitos=[...new Set(viajes.map(v=>v.Circuito||v["Circuito"]||"Sin circuito"))].sort();
    const rawDias=[...new Set(viajes.map(v=>String(v["Fecha de carga"]||"").slice(0,10)).filter(Boolean))].sort();
    return(
      <div>
        {modalV&&<Modal title={`🚛 ${modalV.Unidad||modalV["Unidad"]} — ${modalV.Cliente||modalV["Cliente"]}`} onClose={()=>setModalV(null)} wide>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:12}}>
            {[["Caja",modalV.Caja||modalV["Caja"]],["Circuito",modalV.Circuito||modalV["Circuito"]||"—"],
              ["Coordinador",(modalV.Coordinador||modalV["Coordinador"]||"").split(" ")[0]],
              ["Origen",modalV.Origen||modalV["Origen"]||"—"],["Destino",modalV.Destino||modalV["Destino"]||"—"],
              ["Estatus",modalV["Estatus viaje"]||"—"],["Cita desc.",modalV["Cita descarga"]||"—"],
              ["F.Descarga",modalV["Fecha descarga"]||"—"],
              ["Venta",modalV["Venta real"]?fmt$($v(modalV)):"—"]].map(([l,val])=>(
              <div key={l}><div style={{color:"#475569",fontSize:8,textTransform:"uppercase"}}>{l}</div>
              <div style={{color:"#f1f5f9",fontWeight:700,fontSize:11}}>{val||"—"}</div></div>
            ))}
          </div>
          {(modalV.Observaciones||modalV["Observaciones"])&&<div style={{background:"#0d1626",borderRadius:7,padding:"8px 12px",fontSize:10,color:"#64748b"}}>📝 {modalV.Observaciones||modalV["Observaciones"]}</div>}
        </Modal>}
        {rawDias.length===0&&<div style={{color:"#334155",textAlign:"center",padding:24}}>Sin viajes con fecha de carga registrada en la semana actual</div>}
        {rawDias.length>0&&<div style={{overflowX:"auto"}}>
          <table style={{borderCollapse:"collapse",minWidth:"100%",fontSize:11}}>
            <thead>
              <tr>
                <th style={{textAlign:"left",padding:"8px 12px",color:"#3b82f6",fontSize:9,textTransform:"uppercase",background:"#08111f",minWidth:150,position:"sticky",left:0,zIndex:3,borderRight:"2px solid #1e3a5f"}}>Circuito</th>
                {rawDias.map(d=><th key={d} style={{padding:"8px 12px",color:"#475569",fontSize:9,textAlign:"center",background:"#08111f",whiteSpace:"nowrap",fontWeight:700,borderBottom:"1px solid #1e293b"}}>{d}</th>)}
              </tr>
            </thead>
            <tbody>
              {rawCircuitos.map(ci=>{
                const vsCi=viajes.filter(v=>(v.Circuito||v["Circuito"]||"Sin circuito")===ci);
                return(<tr key={ci} style={{borderTop:"1px solid #0f1e33"}}>
                  <td style={{padding:"8px 12px",color:ci==="Sin circuito"?"#334155":"#a78bfa",fontWeight:700,fontSize:11,background:"#08111f",position:"sticky",left:0,zIndex:1,borderRight:"2px solid #1e3a5f"}}>{ci}</td>
                  {rawDias.map(d=>{
                    const celdas=vsCi.filter(v=>String(v["Fecha de carga"]||"").slice(0,10)===d);
                    return(<td key={d} style={{padding:5,verticalAlign:"top",minWidth:140,background:"#060d1a",borderRight:"1px solid #0f1e33"}}>
                      {celdas.length===0
                        ?<div style={{background:"#08111f",borderRadius:6,padding:"18px 8px",textAlign:"center",color:"#1e293b",fontSize:16}}>—</div>
                        :celdas.map((v,ci2)=>{
                          const col=cardColor(v);
                          const fin=["finalizado","entregado","terminado"].some(s=>(v["Estatus viaje"]||"").toLowerCase().includes(s));
                          const unidad=v.Unidad||v["Unidad"]||"";
                          const cliente=v.Cliente||v["Cliente"]||"";
                          const coord=v.Coordinador||v["Coordinador"]||"";
                          const cita=v["Cita descarga"]||"";
                          return(<div key={ci2} onClick={()=>setModalV(v)}
                            style={{background:col+"18",border:`2px solid ${col}60`,borderRadius:8,padding:"8px 10px",cursor:"pointer",marginBottom:4,transition:"transform .1s"}}
                            onMouseOver={e=>e.currentTarget.style.transform="translateY(-1px)"}
                            onMouseOut={e=>e.currentTarget.style.transform="none"}>
                            <div style={{color:"#f1f5f9",fontWeight:900,fontFamily:"monospace",fontSize:12}}>{unidad}</div>
                            <div style={{color:"#94a3b8",fontSize:9}}>📦 {v.Caja||v["Caja"]||"—"}</div>
                            <div style={{color:"#64748b",fontSize:9,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:130}}>{cliente}</div>
                            <div style={{color:col,fontWeight:700,fontSize:9,marginTop:3}}>{fin?"✅ Entregado":v["Estatus viaje"]||"Pendiente"}</div>
                            {cita&&<div style={{color:"#334155",fontSize:8}}>🕐 {String(cita).slice(0,16)}</div>}
                            <div style={{color:cc(coord),fontSize:8,marginTop:1}}>{coord.split(" ")[0]}</div>
                          </div>);
                        })
                      }
                    </td>);
                  })}
                </tr>);
              })}
            </tbody>
          </table>
        </div>}
      </div>
    );
  };

  return(
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      <div style={{background:"#0a1628",border:"1px solid #1e3a5f",borderRadius:8,padding:"8px 12px",fontSize:11,color:"#3b82f6"}}>
        📋 Semana {weekNum} — {viajesSrc.length} viajes · Fuente: hoja VIAJES
      </div>
      <div style={{background:"#0a1628",border:"1px solid #6366f130",borderRadius:11,padding:12}}>
        <div style={{color:"#6366f1",fontWeight:700,fontSize:13,marginBottom:8}}>🎯 OTIF Sem {weekNum} — {otif?.totalSem||0} viajes · {otif?.pctSem||0}%</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6,textAlign:"center"}}>
          {[[`${otif?.pctSem||0}%`,"OTIF",+(otif?.pctSem||0)>=85?"#10b981":"#ef4444"],[otif?.onTimeSem||0,"A tiempo","#10b981"],[otif?.late||0,"Tardías","#ef4444"],[otif?.sinFecha||0,"Sin fecha","#64748b"]].map(([v,l,col])=>(
            <div key={l} style={{background:col+"10",borderRadius:7,padding:"8px 4px"}}><div style={{color:col,fontWeight:900,fontSize:l==="OTIF"?18:14}}>{v}</div><div style={{color:"#475569",fontSize:9}}>{l}</div></div>
          ))}
        </div>
      </div>
      {finalizados.length>0&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
        <div style={{background:"#0a1628",border:"1px solid #10b98130",borderRadius:10,padding:"12px"}}><div style={{color:"#10b981",fontWeight:900,fontSize:18}}>{fmt$(totV)}</div><div style={{color:"#475569",fontSize:10}}>💵 Venta ({finalizados.length} finalizados)</div></div>
        <div style={{background:"#0a1628",border:"1px solid #3b82f630",borderRadius:10,padding:"12px"}}><div style={{color:"#3b82f6",fontWeight:900,fontSize:18}}>{finalizados.length}</div><div style={{color:"#475569",fontSize:10}}>✅ Finalizados sem {weekNum}</div></div>
      </div>}
      {/* Sub-tabs: Lista | Tablero Ventanas */}
      <div style={{display:"flex",gap:4,borderBottom:"1px solid #0f1e33",marginBottom:4}}>
        {[["lista","📋 Lista"],["tablero","📅 Tablero Ventanas"]].map(([id,l])=>(
          <button key={id} onClick={()=>setVistaMode(id)}
            style={{background:"none",border:"none",borderBottom:vistaMode===id?"2px solid #3b82f6":"2px solid transparent",color:vistaMode===id?"#f1f5f9":"#475569",padding:"8px 16px",cursor:"pointer",fontSize:12,fontWeight:vistaMode===id?700:400,marginBottom:-1}}>
            {l}
          </button>
        ))}
      </div>
      {vistaMode==="tablero"&&<Tablero/>}
      {vistaMode==="lista"&&(<>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          <input placeholder="🔍 Buscar..." value={q} onChange={e=>setQ(e.target.value)} style={{flex:1,minWidth:160,background:"#0a1628",border:"1px solid #1e293b",borderRadius:8,padding:"8px 12px",color:"#f1f5f9",fontSize:12,outline:"none"}}/>
          <select value={coordFil} onChange={e=>setCoordFil(e.target.value)} style={{background:"#0a1628",border:"1px solid #1e293b",borderRadius:8,padding:"8px 10px",color:"#f1f5f9",fontSize:12,outline:"none"}}>
            <option value="">Todos</option><option value="TELLO">Tello</option><option value="CRISTIAN">Cristian</option><option value="JULIO">Julio</option>
          </select>
          <button onClick={()=>dlCSV(toCSV(viajes,["Semana","Fecha de carga","Coordinador","Unidad","Caja","Cliente","Origen","Destino","Estatus viaje","Km cargados","Venta real","Cita descarga","Fecha descarga","Circuito","Observaciones"]),"viajes_sem"+weekNum+".csv")} style={{background:"#1e3a2f",border:"1px solid #10b98144",borderRadius:8,padding:"8px 12px",color:"#10b981",fontSize:11,cursor:"pointer",fontWeight:700}}>⬇️ CSV</button>
        </div>
        <div style={{color:"#475569",fontSize:11}}>{viajes.length} viajes</div>
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
            <thead><tr style={{borderBottom:"2px solid #1e293b"}}>{["Coord","Unidad","Caja","Cliente","Origen","Destino","Estatus","Km","Venta","Circuito","F.Carga","Cita","F.Desc.","OTIF"].map(h=><th key={h} style={{textAlign:"left",padding:"7px 8px",color:"#475569",fontSize:9,textTransform:"uppercase",whiteSpace:"nowrap"}}>{h}</th>)}</tr></thead>
            <tbody>{viajes.map((v,i)=>{
              const ent=["finalizado","entregado","terminado"].some(s=>(v["Estatus viaje"]||"").toLowerCase().includes(s));
              const circ=v.Circuito||v["Circuito"]||"";
              return(<tr key={i} style={{borderBottom:"1px solid #0d1626",background:i%2===0?"#080e1c":"transparent"}}>
                <td style={{padding:"8px 8px"}}><span style={{color:cc(v.Coordinador||""),fontWeight:700,fontSize:10}}>{(v.Coordinador||"").split(" ")[0]}</span></td>
                <td style={{padding:"8px 8px",color:"#f1f5f9",fontFamily:"monospace",fontWeight:700}}>{v.Unidad}</td>
                <td style={{padding:"8px 8px",color:"#94a3b8",fontFamily:"monospace"}}>{v.Caja}</td>
                <td style={{padding:"8px 8px",color:"#94a3b8",maxWidth:90,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{v.Cliente||v["Cliente"]}</td>
                <td style={{padding:"8px 8px",color:"#64748b",fontSize:9}}>{v.Origen||v["Origen"]||"—"}</td>
                <td style={{padding:"8px 8px",color:"#64748b",fontSize:9}}>{v.Destino||v["Destino"]||"—"}</td>
                <td style={{padding:"8px 8px"}}><Badge text={v["Estatus viaje"]||""} small/></td>
                <td style={{padding:"8px 8px",color:"#64748b"}}>{v["Km cargados"]||"—"}</td>
                <td style={{padding:"8px 8px",color:$v(v)>0?"#10b981":"#334155",fontWeight:$v(v)>0?700:400}}>{$v(v)>0?fmt$($v(v)):"—"}</td>
                <td style={{padding:"8px 8px",color:circ&&circ!=="Sin circuito"?"#a78bfa":"#334155",fontSize:9,fontWeight:700}}>{circ||"—"}</td>
                <td style={{padding:"8px 8px",color:"#64748b",fontSize:9}}>{v["Fecha de carga"]||"—"}</td>
                <td style={{padding:"8px 8px",color:"#64748b",fontSize:9}}>{v["Cita descarga"]||"—"}</td>
                <td style={{padding:"8px 8px",color:"#64748b",fontSize:9}}>{v["Fecha descarga"]||"—"}</td>
                <td style={{padding:"8px 8px",color:ent?"#10b981":"#64748b",fontWeight:700}}>{ent?"✅":"—"}</td>
              </tr>);
            })}</tbody>
          </table>
        </div>
      </>)}
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
              <td style={{padding:"8px 8px",color:Number(op.ventaTotal||0)>0?"#10b981":"#334155",fontWeight:700}}>{Number(op.ventaTotal||0)>0?fmt$(Number(op.ventaTotal)):"—"}</td>
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

// ── VENTANAS OPERATIVAS — Torre de Control Logística ─────────────────────────
// Integrado con datos existentes: viajes, flota, circuitos, coordinadores
// ── VENTANAS OPERATIVAS — cargado desde ventanas.jsx ──────────────────────────
// El componente real está en ventanas.jsx (se carga después en index.html)
// Aquí solo se declara el wrapper que usa window.VentanasOperativas
const VentanasOperativas = (props) => {
  const Comp = window.VentanasOperativas;
  if (!Comp) return (
    <div style={{color:"#ef4444",textAlign:"center",padding:40}}>
      Error: ventanas.jsx no se cargó. Verifica que el archivo está en la misma carpeta.
    </div>
  );
  return React.createElement(Comp, props);
};


// ── APP ROOT ──────────────────────────────────────────────────────────────────
const APP_TABS=[
  {id:"inicio",       label:"Inicio",    icon:"🏠"},
  {id:"tractos",      label:"Unidades",  icon:"🚛"},
  {id:"tracker",      label:"Tracker",   icon:"🛣️"},
  {id:"mantenimiento",label:"MTTO",      icon:"🔧"},
  {id:"cajas",        label:"Cajas",     icon:"📦"},
  {id:"viajes",       label:"Viajes",    icon:"💰"},
  {id:"ranking",      label:"Ranking",   icon:"🏆"},
  {id:"alertas",      label:"Alertas",   icon:"🔔"},
];

function App(){
  const [data,setData]=useState(()=>initData());
  const [tab,setTab]=useState("inicio");
  const [syncState,setSyncState]=useState("idle");
  const [lastSync,setLastSync]=useState("");
  const [autoInterval,setAutoInterval]=useState(0);
  const syncRef=useRef(null);

  useEffect(()=>{sd(data);},[data]);
  useEffect(()=>{if(USAR_SHEETS)syncAll();},[]);

  useEffect(()=>{
    if(syncRef.current) clearInterval(syncRef.current);
    if(autoInterval>0&&USAR_SHEETS){ syncRef.current=setInterval(()=>syncAll(),autoInterval*1000); }
    return()=>{if(syncRef.current) clearInterval(syncRef.current);};
  },[autoInterval]);

  const syncAll=async()=>{
    setSyncState("syncing");
    try{
      const [resumen,cajasRaw,viajesRaw,alertasRaw,mttoRaw]=await Promise.all([
        apiGet("resumen_completo"),
        apiGet("Control_Cajas"),
        apiGet("VIAJES"),
        apiGet("ALERTAS").catch(()=>[]),
        apiGet("MANTENIMIENTO").catch(()=>[]),
      ]);
      const upd={
        ...data,
        resumen:resumen.ok!==undefined?resumen:null,
        cajasList:Array.isArray(cajasRaw)?cajasRaw:[],
        viajesList:Array.isArray(viajesRaw)?viajesRaw:[],
        alertasList:Array.isArray(alertasRaw)?alertasRaw:[],
        mttoList:Array.isArray(mttoRaw)?mttoRaw:[],
        v:10,lastSync:new Date().toISOString()
      };
      setData(upd);sd(upd);
      setSyncState("ok");
      setLastSync(new Date().toLocaleTimeString("es-MX",{hour:"2-digit",minute:"2-digit"}));
      setTimeout(()=>setSyncState("idle"),3000);
    }catch(e){
      console.error(e);
      setSyncState("error");
      setTimeout(()=>setSyncState("idle"),6000);
    }
  };

  const alertCount=(data.resumen?.entregas?.totalVencidas||0)
    +(data.resumen?.flota?.grupos?.SG?.length||0);

  return(
    <div style={{minHeight:"100vh",background:"#060d1a",color:"#e2e8f0",fontFamily:"'DM Sans','Segoe UI',sans-serif"}}>
      <HeaderReloj lastSync={lastSync} autoInterval={autoInterval}/>
      {/* Tabs */}
      <div style={{background:"#08111f",borderBottom:"1px solid #0f1e33",display:"flex",overflowX:"auto",padding:"0 14px"}}>
        {APP_TABS.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)}
            style={{background:"none",border:"none",borderBottom:tab===t.id?"2px solid #3b82f6":"2px solid transparent",
              color:tab===t.id?"#f1f5f9":"#475569",padding:"10px 14px",cursor:"pointer",
              fontSize:11,fontWeight:tab===t.id?700:400,whiteSpace:"nowrap",
              display:"flex",alignItems:"center",gap:4}}>
            <span>{t.icon}</span>
            <span>{t.label}</span>
            {t.id==="alertas"&&alertCount>0&&(
              <span style={{background:"#ef4444",color:"#fff",borderRadius:"50%",width:16,height:16,fontSize:9,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700}}>{alertCount}</span>
            )}
          </button>
        ))}
      </div>
      {/* Content */}
      <div style={{padding:"14px 16px",maxWidth:1100,margin:"0 auto"}}>
        <SyncBanner state={syncState} onSync={syncAll} lastSync={lastSync} autoInterval={autoInterval} setAutoInterval={setAutoInterval}/>
        {tab!=="inicio"&&(
          <div style={{display:"flex",justifyContent:"flex-end",marginBottom:8}}>
            <button onClick={()=>setTab("inicio")}
              style={{background:"#0a1628",border:"1px solid #1e3a5f",borderRadius:8,padding:"7px 14px",
                color:"#3b82f6",fontSize:12,cursor:"pointer",fontWeight:700,display:"flex",alignItems:"center",gap:6}}>
              🏠 Inicio
            </button>
          </div>
        )}
        {tab==="inicio"       &&<Inicio data={data} setTab={setTab}/>}
        {tab==="tractos"      &&<Tractos data={data}/>}
        {tab==="tracker"      &&<Tracker data={data}/>}
        {tab==="mantenimiento"&&<Mantenimiento data={data} setData={setData}/>}
        {tab==="cajas"        &&<Cajas data={data}/>}
        {tab==="viajes"       &&<Viajes data={data}/>}
        {tab==="ranking"      &&<RankingOperadores data={data}/>}
        {tab==="alertas"      &&<Alertas data={data} setData={setData}/>}
      </div>
    </div>
  );
}

ReactDOM.render(<App/>, document.getElementById("root"));
