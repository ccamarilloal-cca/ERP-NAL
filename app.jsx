// ═══════════════════════════════════════════════════════════════════════════
//  NACIONAL AUTOTRANSPORTE — ERP TMS v6
//  Fuente: sistema_logistico.xlsx → Google Sheets
//  Nuevo: Mantenimiento | Venta/día | Diesel semana | Gráficas | Utilización
// ═══════════════════════════════════════════════════════════════════════════

const { useState, useEffect, useRef, useCallback } = React;

// ─── CONFIG ───────────────────────────────────────────────────────────────────
const SHEETS_URL = window.SHEETS_URL || "PEGA_TU_URL_AQUI";
const USAR_SHEETS = SHEETS_URL !== "PEGA_TU_URL_AQUI";
const STORAGE_KEY = "nal_erp_v6";

// ─── CIRCUITOS ────────────────────────────────────────────────────────────────
const CIRCUITOS_CONFIG = {
  "Reynosa - Bajio":{ paradas:["Reynosa","Mty","Saltillo","SLP","Ags","Qro","Bajío"], siguiente:"Regreso Reynosa o Adient", tiempoEst:"18-22h", color:"#3b82f6" },
  "Remolacha":      { paradas:["Reynosa","Pharr TX","McAllen TX","Harlingen TX"], siguiente:"Reynosa o Carrier MTY", tiempoEst:"4-6h", color:"#10b981" },
  "DX":             { paradas:["Nuevo Laredo","Laredo TX","Dallas TX"], siguiente:"Regreso NLD o Mty-Bajio", tiempoEst:"8-10h", color:"#f59e0b" },
  "Adient":         { paradas:["Reynosa","Saltillo","Arteaga","Ramos"], siguiente:"Remolacha o Reynosa-Bajio", tiempoEst:"6-8h", color:"#a855f7" },
  "Mty-Bajio":      { paradas:["Monterrey","Saltillo","SLP","Bajío"], siguiente:"DX o Remolacha", tiempoEst:"8-10h", color:"#6366f1" },
  "Nld-Bajio":      { paradas:["Nuevo Laredo","Mty","Saltillo","Bajío"], siguiente:"DX o Reynosa-Bajio", tiempoEst:"10-12h", color:"#ef4444" },
  "Carrier":        { paradas:["Monterrey","Nuevo León"], siguiente:"Mty-Bajio o Remolacha", tiempoEst:"2-3h", color:"#f97316" },
};

// ─── STORAGE ──────────────────────────────────────────────────────────────────
const loadLocal = () => { try{const r=localStorage.getItem(STORAGE_KEY);return r?JSON.parse(r):null;}catch{return null;} };
const saveLocal = (d) => { try{localStorage.setItem(STORAGE_KEY,JSON.stringify(d));}catch{} };
const initData = () => {
  const s=loadLocal();
  if(s&&s.version===6) return s;
  return {version:6,tractos:[],cajas:[],viajes:[],rendimientos:[],diesel:[],ventaResumen:null,lastUpdate:""};
};

// ─── SHEETS API ───────────────────────────────────────────────────────────────
const sheetsGet = async (tab) => {
  const r = await fetch(`${SHEETS_URL}?tab=${encodeURIComponent(tab)}`);
  const j = await r.json();
  return Array.isArray(j) ? j : (j.data || []);
};
const sheetsPost = async (tab, rows) => {
  await fetch(SHEETS_URL,{method:"POST",mode:"no-cors",headers:{"Content-Type":"application/json"},body:JSON.stringify({tab,action:"replace",rows})});
};

// ─── MAPPERS ──────────────────────────────────────────────────────────────────
const n = (v) => parseFloat(String(v||"0").replace(/[$,]/g,""))||0;

const mapEstatus = (r) => ({
  fecha: String(r["Fecha"]||"").slice(0,10),
  unidad: r["Unidad"]||"",
  operador: r["Operador"]||"—",
  unidadNegocio: r["UnidadDeNegocio"]||"",
  estatus: r["Estatus"]||"",
  motivo: r["Motivo"]||"",
  ruta: r["NombreRuta"]||"",
  monto: n(r["Monto"]),
  coordinador: r["Coordinador"]||"",
  comentarios: r["Comentarios"]||"",
});

const motivoToEstatus = (m="") => {
  const u=m.toUpperCase();
  if(u.includes("VTA")) return "VTA - Facturando";
  if(u.includes("TRN")) return "TRN - En Tránsito";
  if(u.includes("MOV")) return "MOV - En Movimiento";
  if(u.includes("DCO")) return "DCO - Disponible c/Op";
  if(u.includes("DSO")) return "DSO - Disponible s/Op";
  if(u.includes("LIB")) return "LIB - Por Liberar";
  if(u.includes("CP")) return "CP - Correctivo/Preventivo";
  if(u.includes("RM")) return "RM - Reparación Mayor";
  if(u.includes("SG")) return "SG - Siniestro/Garantía";
  if(u.includes("SO")) return "SO - Sin Operador";
  if(u.includes("IND")) return "IND - Indisciplina";
  if(u.includes("PER")) return "PER - Permiso";
  return m;
};

const mapCaja = (r) => ({
  caja: r["Caja"]||"",
  tipo: r["Tipo"]||"Seca",
  coordinador: r["Coordinador"]||"",
  ciudad: r["Ciudad / Ubicación"]||"",
  ubicEsp: r["Ubicación Específica"]||"",
  estatus: r["Estatus"]||"",
  cliente: r["Cliente"]||"",
  deQuienCliente: r["De quion es cliente"]||"",
  desdeCuando: r["Desde Cuándo"]||"",
  comentarios: r["Comentarios"]||"",
});

const mapViaje = (r,i) => ({
  id: r["Referencia / ID"]||`V-${i+1}`,
  semana: r["Semana"]||"",
  fecha: r["Fecha"]||"",
  coordinador: r["Coordinador"]||"",
  unidad: String(r["Unidad"]||""),
  operador: r["Operador"]||"",
  caja: String(r["Caja"]||""),
  cliente: r["Cliente"]||"",
  origen: r["Origen"]||"",
  destino: r["Destino"]||"",
  estatus: r["Estatus viaje"]||"",
  kmCargados: n(r["Km cargados"]),
  kmVacios: n(r["Km Vacíos"]),
  diesel: n(r["Diesel programado"]),
  comisiones: n(r["Comisiones"]),
  casetas: n(r["Casetas"]),
  costoMtto: n(r["Costo mantenimiento"]),
  ventaEst: n(r["Venta estimada"]),
  ventaReal: r["Venta real"]&&r["Venta real"]!==""&&r["Venta real"]!=="0"?n(r["Venta real"]):null,
  circuito: r["Circuito"]||"",
  kml: r["Rendimiento real (km/l)"]||"—",
  siguienteOrigen: r["Siguiente Origen Sugerido"]||"",
  moverA: r["Mover a:"]||"",
  alerta: r["Alerta Movimiento"]||"",
  entregado: ["entregado","terminado","finalizado"].some(x=>(r["Estatus viaje"]||"").toLowerCase().includes(x)),
  fechaEntregaProg: r["Cita descarga"]||r["Fecha descarga"]||"",
  litrosDiesel: 0,
});

const mapRendimiento = (r) => ({
  unidad: r["Numero Economico"]||"",
  operador: r["Operador"]||"",
  kml: parseFloat(r["Rendimiento Calculado"]||r["RendimientoKmLt"]||"0")||0,
  clasificacion: r["Clasificacion"]||"",
  fecha: r["Fecha Registro"]||"",
  litros: n(r["Litros Carga"]||r["TotalLitrosDiesel"]||"0"),
  km: n(r["Kms Recorridos"]||r["TotalKmCargados"]||"0"),
});

const mapDiesel = (r) => ({
  folio: r["Folio"]||"",
  fecha: String(r["Fecha Registro"]||"").slice(0,10),
  unidad: r["Numero Economico"]||"",
  operador: r["Operador"]||"",
  litros: n(r["Litros"]),
  precio: n(r["Precio"]),
  costoTotal: n(r["Costo Total ($)"]),
  kml: parseFloat(r["Rendimiento Km/Lt"]||"0")||0,
  alerta: r["🚨 Alerta Diesel"]||"",
  estacion: r["Estacion"]||"",
});

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const C={TELLO:"#3b82f6",CRISTIAN:"#10b981",JULIO:"#f59e0b"};
const coordColor=(c="")=>{const u=c.toUpperCase();if(u.includes("TELLO"))return C.TELLO;if(u.includes("CRISTIAN")||u.includes("ZUÑIGA")||u.includes("ZUNIGA"))return C.CRISTIAN;if(u.includes("JULIO")||u.includes("HERNANDEZ"))return C.JULIO;return"#6366f1";};
const coordKey=(c="")=>{const u=c.toUpperCase();if(u.includes("TELLO"))return"TELLO";if(u.includes("CRISTIAN")||u.includes("ZUÑIGA")||u.includes("ZUNIGA"))return"CRISTIAN";if(u.includes("JULIO")||u.includes("HERNANDEZ"))return"JULIO";return null;};
const estatusColor=(e="")=>{const s=e.toLowerCase();if(s.includes("facturando")||s.includes("vta")||s.includes("entregado")||s.includes("terminado")||s.includes("finalizado")||s.includes("operando"))return"#10b981";if(s.includes("trn")||s.includes("tránsito"))return"#3b82f6";if(s.includes("mov"))return"#10b981";if(s.includes("dco")||s.includes("disponible"))return"#3b82f6";if(s.includes("dso"))return"#64748b";if(s.includes("lib"))return"#a855f7";if(s.includes("programado")||s.includes("esperando"))return"#6366f1";if(s.includes("siniestro")||s.includes("sg")||s.includes("dañada")||s.includes("no localizada"))return"#ef4444";if(s.includes("reparacion")||s.includes("rm")||s.includes("cp")||s.includes("correctivo")||s.includes("mtto")||s.includes("mantenimiento")||s.includes("taller"))return"#f59e0b";if(s.includes("so")||s.includes("sin operador")||s.includes("vacante"))return"#64748b";if(s.includes("ind")||s.includes("indis"))return"#ef4444";if(s.includes("per")||s.includes("permiso"))return"#a855f7";if(s.includes("cargada"))return"#10b981";if(s.includes("tránsito"))return"#3b82f6";return"#64748b";};
const Badge=({text})=>(<span style={{background:estatusColor(text)+"22",color:estatusColor(text),border:`1px solid ${estatusColor(text)}44`,borderRadius:5,padding:"2px 7px",fontSize:10,fontWeight:700,letterSpacing:.5,textTransform:"uppercase",whiteSpace:"nowrap"}}>{text}</span>);
const sem=(fp,ent)=>{if(ent)return{color:"#10b981",icon:"✅",texto:"Entregado"};if(!fp||fp==="")return{color:"#64748b",icon:"⚪",texto:"Sin fecha"};const h=new Date();h.setHours(0,0,0,0);const p=new Date(fp);if(isNaN(p))return{color:"#64748b",icon:"⚪",texto:"Sin fecha"};p.setHours(0,0,0,0);const d=Math.floor((p-h)/86400000);if(d<0)return{color:"#ef4444",icon:"🔴",texto:`${Math.abs(d)}d vencido`};if(d===0)return{color:"#f59e0b",icon:"🟡",texto:"Hoy"};if(d===1)return{color:"#f97316",icon:"🟠",texto:"Mañana"};return{color:"#10b981",icon:"🟢",texto:`${d}d restantes`};};
const toCSV=(rows,cols)=>cols.join(",")+"\n"+rows.map(r=>cols.map(c=>`"${r[c]??''}"`).join(",")).join("\n");
const dlCSV=(c,fn)=>{const b=new Blob([c],{type:"text/csv;charset=utf-8;"});const a=document.createElement("a");a.href=URL.createObjectURL(b);a.download=fn;a.click();};
const fmt$=(v)=>v>=1000000?`$${(v/1000000).toFixed(2)}M`:v>=1000?`$${(v/1000).toFixed(0)}K`:`$${v.toLocaleString()}`;
const getWeekDates=()=>{const t=new Date();const day=t.getDay();const mon=new Date(t);mon.setDate(t.getDate()-(day===0?6:day-1));return Array.from({length:7},(_,i)=>{const d=new Date(mon);d.setDate(mon.getDate()+i);return d.toISOString().slice(0,10);});};
const TODAY=new Date().toISOString().slice(0,10);
const WEEK_DATES=getWeekDates();
const WEEK_NUM=Math.ceil((new Date()-new Date(new Date().getFullYear(),0,1))/604800000);
const DIAS=["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"];

// ─── COMPUTE VENTA DESDE ESTATUS ─────────────────────────────────────────────
const computeVenta=(estatusList)=>{
  const hoy={TELLO:0,CRISTIAN:0,JULIO:0,TOTAL:0};
  const semana={TELLO:0,CRISTIAN:0,JULIO:0,TOTAL:0};
  const porDia={};
  WEEK_DATES.forEach(d=>{porDia[d]={TELLO:0,CRISTIAN:0,JULIO:0,TOTAL:0,fecha:d,dia:DIAS[new Date(d).getDay()]};});
  estatusList.forEach(e=>{
    const m=(e.motivo||"").toUpperCase();
    const esVenta=m.includes("VTA")||m.includes("TRN")||m.includes("MOV");
    if(!esVenta||e.monto<=0) return;
    const ck=coordKey(e.coordinador);
    if(!ck) return;
    if(e.fecha===TODAY){hoy[ck]+=e.monto;hoy.TOTAL+=e.monto;}
    if(WEEK_DATES.includes(e.fecha)){semana[ck]+=e.monto;semana.TOTAL+=e.monto;if(porDia[e.fecha]){porDia[e.fecha][ck]+=e.monto;porDia[e.fecha].TOTAL+=e.monto;}}
  });
  return{hoy,semana,porDia:Object.values(porDia),semanaNum:WEEK_NUM};
};

// ─── COMPUTE DIESEL SEMANA ────────────────────────────────────────────────────
const computeDiesel=(dieselList)=>{
  const semana={litros:0,costo:0,porUnidad:{}};
  dieselList.forEach(d=>{
    if(!WEEK_DATES.includes(d.fecha)||d.costoTotal<=0) return;
    semana.litros+=d.litros;semana.costo+=d.costoTotal;
    semana.porUnidad[d.unidad]=(semana.porUnidad[d.unidad]||0)+d.costoTotal;
  });
  return semana;
};

// ─── COMPUTE MANTENIMIENTO DESDE ESTATUS ────────────────────────────────────
const computeMant=(estatusList)=>{
  const grupos={CP:[],RM:[],SG:[],SO:[],IND:[],PER:[],DSO:[],DCO:[],LIB:[],VTA:[],TRN:[],MOV:[],OTROS:[]};
  const hoyRows=estatusList.filter(e=>e.fecha===TODAY);
  hoyRows.forEach(e=>{
    const m=(e.motivo||"").toUpperCase();
    const key=m.includes("CP")?"CP":m.includes("RM")?"RM":m.includes("SG")?"SG":m.includes("IND")?"IND":m.includes("PER")&&!m.includes("PERM")?"PER":m.includes("DSO")?"DSO":m.includes("DCO")?"DCO":m.includes("LIB")?"LIB":m.includes("SO")?"SO":m.includes("VTA")?"VTA":m.includes("TRN")?"TRN":m.includes("MOV")?"MOV":"OTROS";
    grupos[key].push(e);
  });
  return grupos;
};

// ─── UI COMPONENTS ────────────────────────────────────────────────────────────
const Input=({label,value,onChange,type="text",options,required})=>(<div style={{display:"flex",flexDirection:"column",gap:4}}><label style={{fontSize:11,color:"#64748b",textTransform:"uppercase",letterSpacing:.8}}>{label}{required&&<span style={{color:"#ef4444"}}> *</span>}</label>{options?(<select value={value||""} onChange={e=>onChange(e.target.value)} style={{background:"#0f172a",border:"1px solid #1e293b",borderRadius:7,padding:"8px 10px",color:"#f1f5f9",fontSize:12,outline:"none"}}><option value="">— Seleccionar —</option>{options.map(o=><option key={o} value={o}>{o}</option>)}</select>):(<input type={type} value={value||""} onChange={e=>onChange(e.target.value)} style={{background:"#0f172a",border:"1px solid #1e293b",borderRadius:7,padding:"8px 10px",color:"#f1f5f9",fontSize:12,outline:"none"}}/>)}</div>);
const Modal=({title,onClose,children,wide})=>(<div style={{position:"fixed",inset:0,background:"#000d",zIndex:999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}><div style={{background:"#0d1829",border:"1px solid #1e293b",borderRadius:14,width:"100%",maxWidth:wide?860:560,maxHeight:"92vh",overflow:"auto"}}><div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"16px 20px",borderBottom:"1px solid #1e293b",position:"sticky",top:0,background:"#0d1829",zIndex:1}}><div style={{color:"#f1f5f9",fontWeight:700,fontSize:14}}>{title}</div><button onClick={onClose} style={{background:"none",border:"none",color:"#64748b",fontSize:22,cursor:"pointer"}}>×</button></div><div style={{padding:20}}>{children}</div></div></div>);
const SyncBanner=({syncState,onSync,lastSync})=>{const cfg={idle:{bg:"#0a1628",border:"#1e3a5f",color:"#3b82f6",text:USAR_SHEETS?`☁️ Google Sheets${lastSync?" · "+lastSync:""}` :"💾 Local — pega tu URL de Sheets en index.html"},syncing:{bg:"#0a1f0f",border:"#10b98140",color:"#10b981",text:"🔄 Sincronizando..."},ok:{bg:"#0a1f0f",border:"#10b98140",color:"#10b981",text:"✅ Sincronizado"},error:{bg:"#1f0a0a",border:"#ef444440",color:"#ef4444",text:"⚠️ Error Sheets — revisa tu URL en index.html"}};const c=cfg[syncState]||cfg.idle;return(<div style={{background:c.bg,border:`1px solid ${c.border}`,borderRadius:9,padding:"8px 14px",display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}><span style={{color:c.color,fontSize:12}}>{c.text}</span>{USAR_SHEETS&&<button onClick={onSync} disabled={syncState==="syncing"} style={{background:"#1e293b",border:"none",borderRadius:6,padding:"4px 12px",color:"#94a3b8",fontSize:11,cursor:"pointer"}}>🔄 Sincronizar</button>}</div>);};

// ─── MINI CHART (barras simples inline) ──────────────────────────────────────
const BarChart=({data,valueKey,labelKey,colorFn,height=120,title})=>{
  if(!data||data.length===0) return <div style={{color:"#334155",fontSize:11,textAlign:"center",padding:16}}>Sin datos</div>;
  const maxVal=Math.max(...data.map(d=>d[valueKey]||0),1);
  return(
    <div>
      {title&&<div style={{color:"#475569",fontSize:10,textTransform:"uppercase",letterSpacing:1,marginBottom:8}}>{title}</div>}
      <div style={{display:"flex",alignItems:"flex-end",gap:4,height,paddingBottom:20,position:"relative"}}>
        {data.map((d,i)=>{
          const val=d[valueKey]||0;
          const pct=val/maxVal*100;
          const col=colorFn?colorFn(d,i):"#3b82f6";
          return(
            <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:2,position:"relative"}}>
              <div style={{fontSize:8,color:col,fontWeight:700,whiteSpace:"nowrap"}}>{val>0?fmt$(val):""}</div>
              <div style={{width:"100%",background:col+"30",borderRadius:"3px 3px 0 0",height:`${Math.max(pct,2)}%`,transition:"height .4s",position:"relative",overflow:"hidden"}}>
                <div style={{position:"absolute",bottom:0,left:0,right:0,background:col,height:"100%",opacity:.8}}/>
              </div>
              <div style={{fontSize:9,color:"#475569",position:"absolute",bottom:-18,whiteSpace:"nowrap"}}>{d[labelKey]}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const LineChart=({data,valueKey,labelKey,color="#3b82f6",height=80,title})=>{
  if(!data||data.length<2) return null;
  const vals=data.map(d=>d[valueKey]||0);
  const maxV=Math.max(...vals,1);
  const minV=Math.min(...vals,0);
  const range=maxV-minV||1;
  const W=300,H=height;
  const pts=vals.map((v,i)=>`${(i/(vals.length-1))*W},${H-((v-minV)/range)*(H-10)-5}`).join(" ");
  return(
    <div>
      {title&&<div style={{color:"#475569",fontSize:10,textTransform:"uppercase",letterSpacing:1,marginBottom:6}}>{title}</div>}
      <svg viewBox={`0 0 ${W} ${H}`} style={{width:"100%",height,overflow:"visible"}}>
        <polyline fill="none" stroke={color} strokeWidth="2" points={pts}/>
        {vals.map((v,i)=>(
          <g key={i}>
            <circle cx={(i/(vals.length-1))*W} cy={H-((v-minV)/range)*(H-10)-5} r="3" fill={color}/>
            <text x={(i/(vals.length-1))*W} y={H+12} textAnchor="middle" fill="#475569" fontSize="8">{data[i][labelKey]}</text>
            {v>0&&<text x={(i/(vals.length-1))*W} y={H-((v-minV)/range)*(H-10)-10} textAnchor="middle" fill={color} fontSize="8">{fmt$(v)}</text>}
          </g>
        ))}
      </svg>
    </div>
  );
};

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
const Dashboard=({data})=>{
  const {tractos,cajas,viajes,rendimientos,diesel:dieselList}=data;
  const estatusList=(tractos||[]);
  const venta=computeVenta(estatusList);
  const dieselSem=computeDiesel(dieselList||[]);

  // Tractos hoy
  const hoyTractos=estatusList.filter(e=>e.fecha===TODAY);
  const enRuta=hoyTractos.filter(e=>{const m=(e.motivo||"").toUpperCase();return m.includes("VTA")||m.includes("TRN")||m.includes("MOV");}).length;
  const disponibles=hoyTractos.filter(e=>{const m=(e.motivo||"").toUpperCase();return m.includes("DCO")||m.includes("DSO")||m.includes("LIB");}).length;
  const enMtto=hoyTractos.filter(e=>{const m=(e.motivo||"").toUpperCase();return m.includes("CP")||m.includes("RM")||m.includes("SG");}).length;
  const sinOp=hoyTractos.filter(e=>{const m=(e.motivo||"").toUpperCase();return m.includes("SO")||m.includes("IND")||m.includes("PER");}).length;
  const totalFlota=hoyTractos.length||78;
  const pctFlota=totalFlota>0?((enRuta/totalFlota)*100).toFixed(1):"0";

  // Cajas
  const cajaStats={Cargada:0,Disponible:0,Dañada:0,Transito:0,Siniestro:0,NoLocalizada:0,Vacia:0,Venta:0};
  (cajas||[]).forEach(c=>{const s=c.estatus||"";if(s==="Cargada")cajaStats.Cargada++;else if(s==="Disponible")cajaStats.Disponible++;else if(s==="Dañada")cajaStats.Dañada++;else if(s.includes("ránsito"))cajaStats.Transito++;else if(s==="Siniestro")cajaStats.Siniestro++;else if(s==="No localizada")cajaStats.NoLocalizada++;else if(s==="Vacia"||s==="En patio"||s==="En cliente")cajaStats.Vacia++;else if(s==="Venta")cajaStats.Venta++;});
  const totalCajas=(cajas||[]).length||130;
  const pctCajas=totalCajas>0?((cajaStats.Cargada/totalCajas)*100).toFixed(1):"0";

  // KML promedio
  const rKml=(rendimientos||[]).filter(r=>r.kml>0);
  const kmlG=rKml.length>0?(rKml.reduce((s,r)=>s+r.kml,0)/rKml.length).toFixed(2):"—";

  // Utilidad (venta - diesel semana como proxy)
  const utilDia=venta.hoy.TOTAL-0; // costo se irá agregando
  const utilSem=venta.semana.TOTAL-dieselSem.costo;

  // Alertas
  const h=new Date();h.setHours(0,0,0,0);
  const vencidas=(viajes||[]).filter(v=>!v.entregado&&v.fechaEntregaProg&&v.fechaEntregaProg!==""&&new Date(v.fechaEntregaProg)<h);
  const hoyEntrega=(viajes||[]).filter(v=>!v.entregado&&v.fechaEntregaProg&&new Date(v.fechaEntregaProg).toDateString()===h.toDateString());

  const KPI=({label,val,color,icon,sub})=>(<div style={{background:"#0a1628",border:`1px solid ${color}30`,borderRadius:11,padding:"14px 16px",position:"relative",overflow:"hidden"}}><div style={{position:"absolute",top:0,left:0,right:0,height:2,background:color}}/><div style={{fontSize:16}}>{icon}</div><div style={{fontSize:22,fontWeight:900,color,lineHeight:1.1,marginTop:4}}>{val}</div><div style={{fontSize:10,color:"#64748b",textTransform:"uppercase",letterSpacing:.8,marginTop:2}}>{label}</div>{sub&&<div style={{fontSize:10,color:"#334155",marginTop:2}}>{sub}</div>}</div>);

  // META (editable aquí hasta tener en Sheets)
  const META={TELLO:500000,CRISTIAN:450000,JULIO:350000,TOTAL:1300000};
  const cumpl=(v,m)=>m>0?((v/m)*100).toFixed(1):"0";

  return(
    <div style={{display:"flex",flexDirection:"column",gap:18}}>
      <div>
        <div style={{color:"#475569",fontSize:11,letterSpacing:2,textTransform:"uppercase"}}>Torre de Control · Sem {WEEK_NUM} · {new Date().toLocaleDateString("es-MX",{day:"2-digit",month:"short",year:"numeric"})}</div>
        <div style={{color:"#f1f5f9",fontSize:20,fontWeight:900,marginTop:2}}>Nacional Autotransporte</div>
      </div>

      {/* Alertas */}
      {(vencidas.length>0||hoyEntrega.length>0)&&<div style={{display:"flex",flexDirection:"column",gap:6}}>
        {vencidas.length>0&&<div style={{background:"#1f0a0a",border:"1px solid #ef444450",borderLeft:"4px solid #ef4444",borderRadius:9,padding:"10px 14px"}}><span style={{color:"#ef4444",fontWeight:700,fontSize:12}}>🔴 {vencidas.length} entrega(s) VENCIDA(S) — {vencidas.map(v=>v.unidad).join(", ")}</span></div>}
        {hoyEntrega.length>0&&<div style={{background:"#1f1200",border:"1px solid #f59e0b50",borderLeft:"4px solid #f59e0b",borderRadius:9,padding:"10px 14px"}}><span style={{color:"#f59e0b",fontWeight:700,fontSize:12}}>🟡 {hoyEntrega.length} entrega(s) HOY — {hoyEntrega.map(v=>v.unidad).join(", ")}</span></div>}
      </div>}

      {/* Utilización flota y cajas */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        <div style={{background:"#0a1628",border:"1px solid #3b82f630",borderRadius:11,padding:14}}>
          <div style={{fontSize:11,color:"#64748b",marginBottom:8,textTransform:"uppercase",letterSpacing:.8}}>🚛 Utilización Flota Hoy</div>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <div style={{flex:1}}>
              <div style={{height:8,background:"#1e293b",borderRadius:4,overflow:"hidden"}}>
                <div style={{height:"100%",width:`${pctFlota}%`,background:"#10b981",borderRadius:4,transition:"width .4s"}}/>
              </div>
            </div>
            <span style={{color:"#10b981",fontWeight:900,fontSize:20}}>{pctFlota}%</span>
          </div>
          <div style={{display:"flex",gap:8,marginTop:8,flexWrap:"wrap"}}>
            {[["En Ruta",enRuta,"#10b981"],["Disponible",disponibles,"#3b82f6"],["Mtto",enMtto,"#f59e0b"],["Sin Op",sinOp,"#64748b"]].map(([l,v,c])=>(
              <div key={l} style={{background:c+"15",borderRadius:6,padding:"4px 8px",textAlign:"center"}}>
                <div style={{color:c,fontWeight:900,fontSize:16}}>{v}</div>
                <div style={{color:"#475569",fontSize:9}}>{l}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{background:"#0a1628",border:"1px solid #10b98130",borderRadius:11,padding:14}}>
          <div style={{fontSize:11,color:"#64748b",marginBottom:8,textTransform:"uppercase",letterSpacing:.8}}>📦 Utilización Cajas</div>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <div style={{flex:1}}>
              <div style={{height:8,background:"#1e293b",borderRadius:4,overflow:"hidden"}}>
                <div style={{height:"100%",width:`${pctCajas}%`,background:"#10b981",borderRadius:4,transition:"width .4s"}}/>
              </div>
            </div>
            <span style={{color:"#10b981",fontWeight:900,fontSize:20}}>{pctCajas}%</span>
          </div>
          <div style={{display:"flex",gap:8,marginTop:8,flexWrap:"wrap"}}>
            {[["Cargadas",cajaStats.Cargada,"#10b981"],["Disponibles",cajaStats.Disponible,"#3b82f6"],["Dañadas",cajaStats.Dañada,"#ef4444"],["No loc.",cajaStats.NoLocalizada,"#f97316"]].map(([l,v,c])=>(
              <div key={l} style={{background:c+"15",borderRadius:6,padding:"4px 8px",textAlign:"center"}}>
                <div style={{color:c,fontWeight:900,fontSize:16}}>{v}</div>
                <div style={{color:"#475569",fontSize:9}}>{l}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Venta del día */}
      <div style={{background:"#0a1628",border:"1px solid #10b98130",borderRadius:11,padding:14}}>
        <div style={{fontSize:11,color:"#64748b",textTransform:"uppercase",letterSpacing:.8,marginBottom:10}}>💵 Venta del Día ({TODAY}) — desde Estatus Diario</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,textAlign:"center"}}>
          {[["Tello",venta.hoy.TELLO,C.TELLO],["Cristian",venta.hoy.CRISTIAN,C.CRISTIAN],["Julio",venta.hoy.JULIO,C.JULIO],["TOTAL",venta.hoy.TOTAL,"#f1f5f9"]].map(([l,v,c])=>(
            <div key={l} style={{background:c+"10",borderRadius:8,padding:"10px 6px"}}>
              <div style={{color:c,fontWeight:900,fontSize:l==="TOTAL"?18:15}}>{fmt$(v)}</div>
              <div style={{color:"#475569",fontSize:10,marginTop:2}}>{l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Venta semana + meta */}
      <div style={{background:"#0a1628",border:"1px solid #6366f130",borderRadius:11,padding:14}}>
        <div style={{fontSize:11,color:"#64748b",textTransform:"uppercase",letterSpacing:.8,marginBottom:10}}>📊 Semana {WEEK_NUM} — Venta Acumulada vs Meta</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:12}}>
          {[["Tello",venta.semana.TELLO,META.TELLO,C.TELLO],["Cristian",venta.semana.CRISTIAN,META.CRISTIAN,C.CRISTIAN],["Julio",venta.semana.JULIO,META.JULIO,C.JULIO],["TOTAL",venta.semana.TOTAL,META.TOTAL,"#f1f5f9"]].map(([l,v,m,c])=>{
            const pct=m>0?(v/m*100).toFixed(0):0;
            return(
              <div key={l} style={{background:c+"10",borderRadius:8,padding:"10px 6px"}}>
                <div style={{color:c,fontWeight:900,fontSize:l==="TOTAL"?16:13}}>{fmt$(v)}</div>
                <div style={{color:"#475569",fontSize:9,marginTop:2}}>{l}</div>
                <div style={{height:4,background:"#1e293b",borderRadius:2,marginTop:4,overflow:"hidden"}}>
                  <div style={{height:"100%",width:`${Math.min(pct,100)}%`,background:pct>=100?"#10b981":pct>=70?"#f59e0b":"#ef4444",borderRadius:2}}/>
                </div>
                <div style={{color:pct>=100?"#10b981":pct>=70?"#f59e0b":"#ef4444",fontSize:9,marginTop:2}}>{pct}% de meta</div>
              </div>
            );
          })}
        </div>
        {/* Gráfica de tendencia semanal */}
        <LineChart data={venta.porDia} valueKey="TOTAL" labelKey="dia" color="#6366f1" height={80} title="Tendencia venta diaria ($)"/>
      </div>

      {/* Gráfica quién vende más */}
      <div style={{background:"#0a1628",border:"1px solid #f59e0b30",borderRadius:11,padding:14}}>
        <div style={{fontSize:11,color:"#64748b",textTransform:"uppercase",letterSpacing:.8,marginBottom:10}}>🏆 Venta por día y coordinador — Semana {WEEK_NUM}</div>
        <BarChart data={venta.porDia.filter(d=>d.TOTAL>0)} valueKey="TOTAL" labelKey="dia" colorFn={(_,i)=>["#3b82f6","#10b981","#f59e0b","#6366f1","#a855f7","#ef4444","#f97316"][i%7]} height={130}/>
        <div style={{display:"flex",gap:8,marginTop:10,justifyContent:"center"}}>
          {[["Tello",C.TELLO],["Cristian",C.CRISTIAN],["Julio",C.JULIO]].map(([l,c])=>(
            <div key={l} style={{display:"flex",alignItems:"center",gap:4}}><div style={{width:8,height:8,borderRadius:"50%",background:c}}/><span style={{color:"#64748b",fontSize:10}}>{l}: {fmt$(venta.semana[l.toUpperCase()==="TELLO"?"TELLO":l.toUpperCase()==="CRISTIAN"?"CRISTIAN":"JULIO"])}</span></div>
          ))}
        </div>
      </div>

      {/* Diesel semana */}
      <div style={{background:"#0a1628",border:"1px solid #f59e0b30",borderRadius:11,padding:14}}>
        <div style={{fontSize:11,color:"#64748b",textTransform:"uppercase",letterSpacing:.8,marginBottom:10}}>⛽ Diesel Semana {WEEK_NUM}</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,textAlign:"center"}}>
          {[["Costo Total",fmt$(dieselSem.costo),"#f59e0b"],["Litros",dieselSem.litros>0?`${(dieselSem.litros/1000).toFixed(1)}K L`:"—","#6366f1"],["Registros",Object.keys(dieselSem.porUnidad||{}).length+" unidades","#64748b"]].map(([l,v,c])=>(
            <div key={l} style={{background:c+"10",borderRadius:8,padding:"10px 6px"}}>
              <div style={{color:c,fontWeight:900,fontSize:14}}>{v}</div>
              <div style={{color:"#475569",fontSize:9,marginTop:2}}>{l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* KML */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(130px,1fr))",gap:8}}>
        <KPI label="KM/L Flota" val={kmlG} color="#6366f1" icon="⛽" sub="Rend. Calculado"/>
        <KPI label="Viajes Reg." val={(viajes||[]).length} color="#a855f7" icon="✅"/>
        <KPI label="Utilidad Sem." val={utilSem>=0?fmt$(utilSem):`-${fmt$(Math.abs(utilSem))}`} color={utilSem>=0?"#10b981":"#ef4444"} icon="📊" sub="Venta - Diesel"/>
      </div>

      {/* Por coordinador */}
      <div style={{color:"#475569",fontSize:11,textTransform:"uppercase",letterSpacing:1}}>👥 Por Coordinador — Semana {WEEK_NUM}</div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:10}}>
        {[{n:"Juan José Tello",k:"TELLO"},{n:"Cristian Zuñiga",k:"CRISTIAN"},{n:"Julio Hernandez",k:"JULIO"}].map(c=>{
          const vSem=venta.semana[c.k];
          const meta=META[c.k];
          const pct=meta>0?(vSem/meta*100).toFixed(0):0;
          const col=coordColor(c.k);
          const kmlC=(rendimientos||[]).filter(r=>r.kml>0);
          const kmlAvg=kmlC.length>0?(kmlC.reduce((s,r)=>s+r.kml,0)/kmlC.length).toFixed(2):"—";
          const tCount=hoyTractos.filter(t=>coordKey(t.coordinador)===c.k).length;
          return(
            <div key={c.k} style={{background:"#0a1628",border:`1px solid ${col}30`,borderRadius:11,padding:14}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                <div style={{width:9,height:9,borderRadius:"50%",background:col}}/>
                <div style={{color:"#f1f5f9",fontWeight:700,fontSize:13}}>{c.n}</div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:6,textAlign:"center",marginBottom:8}}>
                {[["Venta sem.",fmt$(vSem),col],["Unidades hoy",tCount,col]].map(([l,v,cc])=>(
                  <div key={l}><div style={{color:cc,fontWeight:900,fontSize:14}}>{v}</div><div style={{color:"#475569",fontSize:9}}>{l}</div></div>
                ))}
              </div>
              <div style={{height:4,background:"#1e293b",borderRadius:2,overflow:"hidden",marginBottom:4}}>
                <div style={{height:"100%",width:`${Math.min(pct,100)}%`,background:pct>=100?"#10b981":pct>=70?"#f59e0b":"#ef4444",borderRadius:2}}/>
              </div>
              <div style={{color:"#475569",fontSize:9,textAlign:"right"}}>{pct}% de meta ({fmt$(meta)})</div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ─── MANTENIMIENTO ────────────────────────────────────────────────────────────
const Mantenimiento=({data})=>{
  const estatusList=data.tractos||[];
  const grupos=computeMant(estatusList);
  const [tab,setTab]=useState("CP");

  const GRUPOS_CONFIG=[
    {key:"CP",label:"CP — Correctivo/Preventivo",color:"#f59e0b",icon:"🔧"},
    {key:"RM",label:"RM — Reparación Mayor",color:"#ef4444",icon:"🔩"},
    {key:"SG",label:"SG — Siniestro/Garantía",color:"#ef4444",icon:"💥"},
    {key:"SO",label:"SO — Sin Operador",color:"#64748b",icon:"👤"},
    {key:"IND",label:"IND — Indisciplina",color:"#ef4444",icon:"⚠️"},
    {key:"PER",label:"PER — Permiso",color:"#a855f7",icon:"📋"},
    {key:"DSO",label:"DSO — Disponible s/Op",color:"#64748b",icon:"🔵"},
    {key:"DCO",label:"DCO — Disponible c/Op",color:"#3b82f6",icon:"🔵"},
    {key:"LIB",label:"LIB — Por Liberar",color:"#6366f1",icon:"🔓"},
    {key:"VTA",label:"VTA — Facturando",color:"#10b981",icon:"💰"},
    {key:"TRN",label:"TRN — En Tránsito",color:"#3b82f6",icon:"🔄"},
  ];

  return(
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      <div style={{background:"#0a1628",border:"1px solid #1e3a5f",borderRadius:8,padding:"8px 12px",fontSize:11,color:"#3b82f6"}}>
        ℹ️ Datos del día {TODAY} desde <b>Estatus_diario</b>. Cuando cargues la hoja MANTENIMIENTO en Sheets, se mostrará también el historial preventivo.
      </div>

      {/* Resumen tarjetas */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(100px,1fr))",gap:6}}>
        {GRUPOS_CONFIG.map(g=>(
          <div key={g.key} onClick={()=>setTab(g.key)} style={{background:tab===g.key?g.color+"30":g.color+"15",border:`1px solid ${g.color}${tab===g.key?"80":"33"}`,borderRadius:8,padding:"8px 10px",cursor:"pointer",textAlign:"center",transition:"all .15s"}}>
            <div style={{fontSize:16}}>{g.icon}</div>
            <div style={{color:g.color,fontWeight:900,fontSize:20}}>{(grupos[g.key]||[]).length}</div>
            <div style={{color:"#475569",fontSize:9,textTransform:"uppercase",marginTop:2}}>{g.key}</div>
          </div>
        ))}
      </div>

      {/* Detalle del grupo seleccionado */}
      {(() => {
        const cfg=GRUPOS_CONFIG.find(g=>g.key===tab);
        const filas=grupos[tab]||[];
        return(
          <div style={{background:"#0a1628",border:`1px solid ${cfg?.color||"#1e293b"}30`,borderRadius:11,padding:14}}>
            <div style={{color:cfg?.color||"#f1f5f9",fontWeight:700,fontSize:13,marginBottom:10}}>{cfg?.icon} {cfg?.label} — {filas.length} unidades</div>
            {filas.length===0?<div style={{color:"#334155",fontSize:12,textAlign:"center",padding:16}}>Sin unidades en esta categoría hoy</div>:(
              <div style={{overflowX:"auto"}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                  <thead><tr style={{borderBottom:"2px solid #1e293b"}}>{["Unidad","Operador","Coordinador","Motivo","Ruta / Detalle","Comentarios"].map(h=><th key={h} style={{textAlign:"left",padding:"8px 10px",color:"#475569",fontSize:10,textTransform:"uppercase"}}>{h}</th>)}</tr></thead>
                  <tbody>{filas.map((e,i)=>(
                    <tr key={e.unidad+i} style={{borderBottom:"1px solid #0d1626",background:i%2===0?"#080e1c":"transparent"}}>
                      <td style={{padding:"9px 10px",color:"#f1f5f9",fontWeight:800,fontFamily:"monospace"}}>{e.unidad}</td>
                      <td style={{padding:"9px 10px",color:"#94a3b8",maxWidth:150,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{e.operador}</td>
                      <td style={{padding:"9px 10px"}}><span style={{color:coordColor(e.coordinador),fontWeight:700,fontSize:11}}>{e.coordinador?.split(" ")[0]}</span></td>
                      <td style={{padding:"9px 10px"}}><Badge text={motivoToEstatus(e.motivo)}/></td>
                      <td style={{padding:"9px 10px",color:"#64748b",fontSize:10,maxWidth:150,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{e.ruta}</td>
                      <td style={{padding:"9px 10px",color:"#334155",fontSize:10,maxWidth:180,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{e.comentarios}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
};

// ─── DISTRIBUCIÓN ─────────────────────────────────────────────────────────────
const Distribucion=({data})=>{
  const hoyTractos=(data.tractos||[]).filter(e=>e.fecha===TODAY);
  const circMap={};
  hoyTractos.forEach(e=>{
    // Get circuito from CATALOGO or ruta
    const c=e.ruta||"-";
    if(!circMap[c])circMap[c]={total:0,enRuta:0,disp:0,mtto:0,sinOp:0};
    circMap[c].total++;
    const m=(e.motivo||"").toUpperCase();
    if(m.includes("VTA")||m.includes("TRN")||m.includes("MOV"))circMap[c].enRuta++;
    else if(m.includes("DCO")||m.includes("DSO")||m.includes("LIB"))circMap[c].disp++;
    else if(m.includes("CP")||m.includes("RM")||m.includes("SG"))circMap[c].mtto++;
    else circMap[c].sinOp++;
  });
  const coords=[{n:"Juan José Tello",k:"TELLO",col:"#3b82f6"},{n:"Cristian Zuñiga",k:"CRISTIAN",col:"#10b981"},{n:"Julio Hernandez",k:"JULIO",col:"#f59e0b"}].map(coord=>{
    const ts=hoyTractos.filter(t=>coordKey(t.coordinador)===coord.k);
    const enRuta=ts.filter(t=>{const m=(t.motivo||"").toUpperCase();return m.includes("VTA")||m.includes("TRN")||m.includes("MOV");}).length;
    const disp=ts.filter(t=>{const m=(t.motivo||"").toUpperCase();return m.includes("DCO")||m.includes("DSO")||m.includes("LIB");}).length;
    const mtto=ts.filter(t=>{const m=(t.motivo||"").toUpperCase();return m.includes("CP")||m.includes("RM")||m.includes("SG");}).length;
    const sinOp=ts.length-enRuta-disp-mtto;
    const rKml=(data.rendimientos||[]).filter(r=>r.kml>0);
    const kml=rKml.length>0?(rKml.reduce((s,r)=>s+r.kml,0)/rKml.length).toFixed(2):"—";
    return{...coord,total:ts.length,enRuta,disp,mtto,sinOp,kml};
  });
  return(
    <div style={{display:"flex",flexDirection:"column",gap:20}}>
      <div style={{color:"#475569",fontSize:11,textTransform:"uppercase",letterSpacing:1}}>📊 Datos del día — {TODAY} — desde Estatus_diario (motivos VTA+TRN+MOV = en operación)</div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:10}}>
        {coords.map(c=>(
          <div key={c.k} style={{background:"#0a1628",border:`1px solid ${c.col}30`,borderRadius:12,padding:16}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
              <div style={{width:10,height:10,borderRadius:"50%",background:c.col,boxShadow:`0 0 8px ${c.col}`}}/>
              <div style={{color:"#f1f5f9",fontWeight:800,fontSize:14}}>{c.n}</div>
              <div style={{marginLeft:"auto",background:c.col+"20",color:c.col,borderRadius:6,padding:"2px 8px",fontSize:12,fontWeight:700}}>{c.total}</div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6,textAlign:"center",marginBottom:12}}>
              {[["En Ruta",c.enRuta,"#10b981"],["Disp.",c.disp,"#3b82f6"],["Mtto",c.mtto,"#f59e0b"],["Sin Op",c.sinOp,"#64748b"]].map(([l,v,col])=>(
                <div key={l} style={{background:col+"15",borderRadius:7,padding:"6px 4px"}}>
                  <div style={{color:col,fontWeight:900,fontSize:18}}>{v}</div>
                  <div style={{color:"#475569",fontSize:9,textTransform:"uppercase"}}>{l}</div>
                </div>
              ))}
            </div>
            <div style={{display:"flex",justifyContent:"flex-end",borderTop:"1px solid #1e293b",paddingTop:10}}>
              <div style={{background:"#0d1626",borderRadius:7,padding:"4px 10px",textAlign:"center"}}>
                <div style={{color:c.col,fontWeight:900,fontSize:16}}>{c.kml}</div>
                <div style={{color:"#475569",fontSize:9}}>KM/L prom</div>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div>
        <div style={{color:"#475569",fontSize:11,textTransform:"uppercase",letterSpacing:1.5,marginBottom:10}}>🔁 Por Ruta (Estatus_diario → NombreRuta)</div>
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
            <thead><tr style={{borderBottom:"2px solid #1e293b"}}>{["Ruta","Total","En Ruta","Disponible","Mtto","Sin Op","% Operando","Siguiente"].map(h=><th key={h} style={{textAlign:"left",padding:"8px 12px",color:"#475569",fontSize:10,textTransform:"uppercase",whiteSpace:"nowrap"}}>{h}</th>)}</tr></thead>
            <tbody>{Object.entries(circMap).sort((a,b)=>b[1].total-a[1].total).filter(([c])=>c&&c!=="-"&&c!=="").map(([circ,v],i)=>{
              const pct=v.total>0?(((v.enRuta+v.disp)/v.total)*100).toFixed(0):0;
              const cfg=CIRCUITOS_CONFIG[circ];
              return(
                <tr key={circ} style={{borderBottom:"1px solid #0d1626",background:i%2===0?"#080e1c":"transparent"}}>
                  <td style={{padding:"10px 12px",color:"#f1f5f9",fontWeight:700,maxWidth:140,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{circ}</td>
                  <td style={{padding:"10px 12px",color:"#94a3b8",fontWeight:700}}>{v.total}</td>
                  <td style={{padding:"10px 12px"}}><span style={{color:"#10b981",fontWeight:700}}>{v.enRuta}</span></td>
                  <td style={{padding:"10px 12px"}}><span style={{color:"#3b82f6",fontWeight:700}}>{v.disp}</span></td>
                  <td style={{padding:"10px 12px"}}><span style={{color:"#f59e0b",fontWeight:700}}>{v.mtto}</span></td>
                  <td style={{padding:"10px 12px"}}><span style={{color:"#64748b",fontWeight:700}}>{v.sinOp}</span></td>
                  <td style={{padding:"10px 12px"}}>
                    <div style={{display:"flex",alignItems:"center",gap:6}}>
                      <div style={{flex:1,height:5,background:"#1e293b",borderRadius:3,overflow:"hidden"}}>
                        <div style={{height:"100%",width:`${pct}%`,background:pct>=70?"#10b981":pct>=40?"#f59e0b":"#ef4444",borderRadius:3}}/>
                      </div>
                      <span style={{color:pct>=70?"#10b981":pct>=40?"#f59e0b":"#ef4444",fontWeight:700,fontSize:11,minWidth:28}}>{pct}%</span>
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

// ─── TRACTOS (Unidades) ───────────────────────────────────────────────────────
const Tractos=({data})=>{
  const [q,setQ]=useState(""); const [coordFil,setCoordFil]=useState(""); const [mFil,setMFil]=useState("");
  const estatusList=data.tractos||[];
  const hoyTractos=estatusList.filter(e=>e.fecha===TODAY);
  const venta=computeVenta(estatusList);

  const lista=hoyTractos.filter(e=>{
    const tx=q.toLowerCase();
    return(!q||(e.unidad+e.operador+e.ruta+e.comentarios).toLowerCase().includes(tx))
      &&(!coordFil||coordKey(e.coordinador)===coordFil)
      &&(!mFil||(e.motivo||"").toUpperCase().includes(mFil));
  });

  return(
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      {/* Venta del día por coordinador */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,textAlign:"center"}}>
        {[["TELLO","Tello",C.TELLO],["CRISTIAN","Cristian",C.CRISTIAN],["JULIO","Julio",C.JULIO],["TOTAL","Total","#f1f5f9"]].map(([k,l,c])=>(
          <div key={k} style={{background:c+"10",border:`1px solid ${c}30`,borderRadius:9,padding:"10px 6px"}}>
            <div style={{color:c,fontWeight:900,fontSize:l==="Total"?18:14}}>{fmt$(venta.hoy[k])}</div>
            <div style={{color:"#475569",fontSize:10,marginTop:2}}>💵 {l} hoy</div>
            <div style={{color:"#334155",fontSize:9}}>Sem: {fmt$(venta.semana[k])}</div>
          </div>
        ))}
      </div>

      <div style={{background:"#0a1628",border:"1px solid #1e3a5f",borderRadius:8,padding:"8px 12px",fontSize:11,color:"#3b82f6"}}>
        ℹ️ Mostrando {hoyTractos.length} unidades del día {TODAY} — desde Estatus_diario
      </div>

      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
        <input placeholder="🔍 Buscar unidad, operador..." value={q} onChange={e=>setQ(e.target.value)} style={{flex:1,minWidth:180,background:"#0a1628",border:"1px solid #1e293b",borderRadius:8,padding:"8px 12px",color:"#f1f5f9",fontSize:12,outline:"none"}}/>
        <select value={coordFil} onChange={e=>setCoordFil(e.target.value)} style={{background:"#0a1628",border:"1px solid #1e293b",borderRadius:8,padding:"8px 10px",color:"#f1f5f9",fontSize:12,outline:"none"}}>
          <option value="">Todos</option><option value="TELLO">Tello</option><option value="CRISTIAN">Cristian</option><option value="JULIO">Julio</option>
        </select>
        <select value={mFil} onChange={e=>setMFil(e.target.value)} style={{background:"#0a1628",border:"1px solid #1e293b",borderRadius:8,padding:"8px 10px",color:"#f1f5f9",fontSize:12,outline:"none"}}>
          <option value="">Todos</option><option value="VTA">VTA</option><option value="TRN">TRN</option><option value="CP">CP</option><option value="RM">RM</option><option value="SG">SG</option><option value="SO">SO</option><option value="DCO">DCO</option><option value="DSO">DSO</option><option value="LIB">LIB</option>
        </select>
        <button onClick={()=>dlCSV(toCSV(hoyTractos,["unidad","operador","coordinador","motivo","ruta","monto","comentarios"]),"unidades_"+TODAY+".csv")} style={{background:"#1e3a2f",border:"1px solid #10b98144",borderRadius:8,padding:"8px 12px",color:"#10b981",fontSize:11,cursor:"pointer",fontWeight:700}}>⬇️ CSV</button>
      </div>
      <div style={{color:"#475569",fontSize:11}}>{lista.length} unidades</div>
      <div style={{overflowX:"auto"}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
          <thead><tr style={{borderBottom:"2px solid #1e293b"}}>{["Unidad","Operador","Coordinador","Motivo","Ruta","Monto","Comentarios"].map(h=><th key={h} style={{textAlign:"left",padding:"8px 10px",color:"#475569",fontSize:10,textTransform:"uppercase"}}>{h}</th>)}</tr></thead>
          <tbody>{lista.map((e,i)=>(
            <tr key={e.unidad+i} style={{borderBottom:"1px solid #0d1626",background:i%2===0?"#080e1c":"transparent"}}>
              <td style={{padding:"9px 10px",color:"#f1f5f9",fontWeight:800,fontFamily:"monospace"}}>{e.unidad}</td>
              <td style={{padding:"9px 10px",color:"#94a3b8",maxWidth:160,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{e.operador}</td>
              <td style={{padding:"9px 10px"}}><span style={{color:coordColor(e.coordinador),fontWeight:700,fontSize:11}}>{e.coordinador?.split(" ")[0]}</span></td>
              <td style={{padding:"9px 10px"}}><Badge text={motivoToEstatus(e.motivo)}/></td>
              <td style={{padding:"9px 10px",color:"#64748b",fontSize:10,maxWidth:130,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{e.ruta}</td>
              <td style={{padding:"9px 10px",color:e.monto>0?"#10b981":"#334155",fontWeight:e.monto>0?700:400}}>{e.monto>0?fmt$(e.monto):"—"}</td>
              <td style={{padding:"9px 10px",color:"#334155",fontSize:10,maxWidth:160,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{e.comentarios}</td>
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
  const resumen={};(data.cajas||[]).forEach(c=>{resumen[c.estatus]=(resumen[c.estatus]||0)+1;});
  const patios=[...new Set((data.cajas||[]).map(c=>c.ciudad).filter(p=>p&&p!=="-"&&p!==""))].slice(0,12);
  const lista=(data.cajas||[]).filter(c=>{const tx=q.toLowerCase();return(!q||(c.caja+c.cliente+c.ciudad).toLowerCase().includes(tx))&&(!coordFil||c.coordinador.toUpperCase().includes(coordFil))&&(!eFil||c.estatus===eFil)&&(!patioFil||c.ciudad===patioFil);});
  const guardar=()=>{const updated={...data,cajas:(data.cajas||[]).map(c=>c.caja===editando?{...c,...form}:c),lastUpdate:new Date().toISOString()};setData(updated);saveLocal(updated);setEditando(null);if(USAR_SHEETS)sheetsPost("Control_Cajas",updated.cajas);};
  return(
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      {editando&&<Modal title={`Editar ${editando}`} onClose={()=>setEditando(null)}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          <Input label="Estatus" value={form.estatus||""} onChange={v=>setForm(f=>({...f,estatus:v}))} options={["Cargada","Disponible","En patio","En tránsito","Dañada","Siniestro","No localizada","Vacia","Venta"]}/>
          <Input label="Ciudad / Ubicación" value={form.ciudad||""} onChange={v=>setForm(f=>({...f,ciudad:v}))}/>
          <Input label="Ubicación Específica" value={form.ubicEsp||""} onChange={v=>setForm(f=>({...f,ubicEsp:v}))}/>
          <Input label="Cliente" value={form.cliente||""} onChange={v=>setForm(f=>({...f,cliente:v}))}/>
          <Input label="Coordinador" value={form.coordinador||""} onChange={v=>setForm(f=>({...f,coordinador:v}))} options={["JUAN JOSE TELLO LAMAS","CRISTIAN SAUL ZUÑIGA CASTILLO","JULIO ALEJANDRO HERNANDEZ GALVAN"]}/>
          <Input label="Comentarios" value={form.comentarios||""} onChange={v=>setForm(f=>({...f,comentarios:v}))}/>
        </div>
        <button onClick={guardar} style={{marginTop:14,width:"100%",background:"#3b82f6",border:"none",borderRadius:8,padding:"10px",color:"#fff",fontWeight:700,cursor:"pointer",fontSize:13}}>💾 Guardar {USAR_SHEETS?"+ Sync":""}</button>
      </Modal>}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(90px,1fr))",gap:6}}>
        {Object.entries(resumen).map(([k,v])=>(
          <div key={k} onClick={()=>setEFil(eFil===k?"":k)} style={{background:eFil===k?estatusColor(k)+"30":estatusColor(k)+"15",border:`1px solid ${estatusColor(k)}${eFil===k?"80":"33"}`,borderRadius:8,padding:"8px 10px",cursor:"pointer",textAlign:"center"}}>
            <div style={{color:estatusColor(k),fontWeight:900,fontSize:18}}>{v}</div>
            <div style={{color:"#475569",fontSize:9,textTransform:"uppercase",marginTop:2}}>{k}</div>
          </div>
        ))}
      </div>
      {patios.length>0&&<div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
        {patios.map(p=>{const cnt=(data.cajas||[]).filter(c=>c.ciudad===p).length;return<div key={p} onClick={()=>setPatioFil(patioFil===p?"":p)} style={{background:patioFil===p?"#1e3a5f":"#0a1628",border:`1px solid ${patioFil===p?"#3b82f6":"#1e293b"}`,borderRadius:7,padding:"5px 10px",cursor:"pointer",fontSize:11}}><span style={{color:"#3b82f6",fontWeight:700}}>{cnt}</span><span style={{color:"#475569",marginLeft:5}}>{p}</span></div>;})}
      </div>}
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
        <input placeholder="🔍 Buscar caja..." value={q} onChange={e=>setQ(e.target.value)} style={{flex:1,minWidth:180,background:"#0a1628",border:"1px solid #1e293b",borderRadius:8,padding:"8px 12px",color:"#f1f5f9",fontSize:12,outline:"none"}}/>
        <select value={coordFil} onChange={e=>setCoordFil(e.target.value)} style={{background:"#0a1628",border:"1px solid #1e293b",borderRadius:8,padding:"8px 10px",color:"#f1f5f9",fontSize:12,outline:"none"}}>
          <option value="">Todos</option><option value="TELLO">Tello</option><option value="CRISTIAN">Cristian</option><option value="JULIO">Julio</option>
        </select>
        <button onClick={()=>dlCSV(toCSV(data.cajas||[],["caja","tipo","coordinador","ciudad","ubicEsp","estatus","cliente","comentarios"]),"cajas.csv")} style={{background:"#1e3a2f",border:"1px solid #10b98144",borderRadius:8,padding:"8px 12px",color:"#10b981",fontSize:11,cursor:"pointer",fontWeight:700}}>⬇️ CSV</button>
      </div>
      <div style={{color:"#475569",fontSize:11}}>{lista.length} de {(data.cajas||[]).length} cajas</div>
      <div style={{overflowX:"auto"}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
          <thead><tr style={{borderBottom:"2px solid #1e293b"}}>{["Caja","Tipo","Coord","Ciudad","Específica","Estatus","Cliente","De quién","Comentarios",""].map(h=><th key={h} style={{textAlign:"left",padding:"8px 10px",color:"#475569",fontSize:10,textTransform:"uppercase",whiteSpace:"nowrap"}}>{h}</th>)}</tr></thead>
          <tbody>{lista.map((c,i)=>(
            <tr key={c.caja+i} style={{borderBottom:"1px solid #0d1626",background:i%2===0?"#080e1c":"transparent"}}>
              <td style={{padding:"9px 10px",color:"#f1f5f9",fontWeight:800,fontFamily:"monospace"}}>{c.caja}</td>
              <td style={{padding:"9px 10px",color:"#64748b"}}>{c.tipo}</td>
              <td style={{padding:"9px 10px"}}><span style={{color:coordColor(c.coordinador),fontWeight:700,fontSize:11}}>{c.coordinador.split(" ")[0]}</span></td>
              <td style={{padding:"9px 10px",color:"#94a3b8",maxWidth:110,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.ciudad}</td>
              <td style={{padding:"9px 10px",color:"#64748b"}}>{c.ubicEsp}</td>
              <td style={{padding:"9px 10px"}}><Badge text={c.estatus}/></td>
              <td style={{padding:"9px 10px",color:"#94a3b8",maxWidth:110,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.cliente}</td>
              <td style={{padding:"9px 10px",color:"#64748b",fontSize:10}}>{c.deQuienCliente}</td>
              <td style={{padding:"9px 10px",color:"#334155",fontSize:10,maxWidth:130,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.comentarios}</td>
              <td style={{padding:"9px 10px"}}><button onClick={()=>{setEditando(c.caja);setForm({...c});}} style={{background:"#1e293b",border:"none",borderRadius:6,padding:"4px 10px",color:"#94a3b8",cursor:"pointer",fontSize:11}}>✏️</button></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
};

// ─── VIAJES ───────────────────────────────────────────────────────────────────
const Viajes=({data})=>{
  const [q,setQ]=useState(""); const [coordFil,setCoordFil]=useState("");
  const viajes=(data.viajes||[]).filter(v=>{const t=q.toLowerCase();return(!q||(v.unidad+v.cliente+v.coordinador+v.caja).toLowerCase().includes(t))&&(!coordFil||coordKey(v.coordinador)===coordFil);});
  const realizados=viajes.filter(v=>v.ventaReal);
  const totV=realizados.reduce((s,v)=>s+(v.ventaReal||0),0);
  const totC=realizados.reduce((s,v)=>s+(v.comisiones||0)+(v.casetas||0)+(v.costoMtto||0),0);
  return(
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      {realizados.length>0&&<div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
        {[["💵 Venta",fmt$(totV),"#10b981"],["📉 Costo",fmt$(totC),"#f59e0b"],["📊 Utilidad",fmt$(totV-totC),(totV-totC)>=0?"#10b981":"#ef4444"]].map(([l,v,c])=>(
          <div key={l} style={{background:"#0a1628",border:`1px solid ${c}30`,borderRadius:10,padding:"12px 14px"}}>
            <div style={{color:c,fontWeight:900,fontSize:18}}>{v}</div>
            <div style={{color:"#475569",fontSize:10}}>{l}</div>
            <div style={{color:"#334155",fontSize:9,marginTop:2}}>Nota: Falta diesel y otros costos</div>
          </div>
        ))}
      </div>}
      <div style={{background:"#0a1628",border:"1px solid #1e3a5f",borderRadius:8,padding:"8px 12px",fontSize:11,color:"#3b82f6"}}>
        ℹ️ Viajes desde pestaña VIAJES de Sheets. Venta real se irá capturando ahí. Utillidad completa cuando integres todos los costos.
      </div>
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
        <input placeholder="🔍 Buscar..." value={q} onChange={e=>setQ(e.target.value)} style={{flex:1,minWidth:160,background:"#0a1628",border:"1px solid #1e293b",borderRadius:8,padding:"8px 12px",color:"#f1f5f9",fontSize:12,outline:"none"}}/>
        <select value={coordFil} onChange={e=>setCoordFil(e.target.value)} style={{background:"#0a1628",border:"1px solid #1e293b",borderRadius:8,padding:"8px 10px",color:"#f1f5f9",fontSize:12,outline:"none"}}>
          <option value="">Todos</option><option value="TELLO">Tello</option><option value="CRISTIAN">Cristian</option><option value="JULIO">Julio</option>
        </select>
        <button onClick={()=>dlCSV(toCSV(data.viajes||[],["id","semana","fecha","coordinador","unidad","caja","cliente","origen","destino","estatus","kmCargados","ventaEst","ventaReal","circuito"]),"viajes.csv")} style={{background:"#1e3a2f",border:"1px solid #10b98144",borderRadius:8,padding:"8px 12px",color:"#10b981",fontSize:11,cursor:"pointer",fontWeight:700}}>⬇️ CSV</button>
      </div>
      <div style={{overflowX:"auto"}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
          <thead><tr style={{borderBottom:"2px solid #1e293b"}}>{["Sem","Coord","Unidad","Caja","Cliente","Origen","Destino","Estatus","Km","Venta Real","Circuito","Entrega"].map(h=><th key={h} style={{textAlign:"left",padding:"8px 10px",color:"#475569",fontSize:10,textTransform:"uppercase",whiteSpace:"nowrap"}}>{h}</th>)}</tr></thead>
          <tbody>{viajes.map((v,i)=>{const s=sem(v.fechaEntregaProg,v.entregado);return(
            <tr key={(v.id||i)} style={{borderBottom:"1px solid #0d1626",background:i%2===0?"#080e1c":"transparent"}}>
              <td style={{padding:"9px 10px",color:"#64748b"}}>{v.semana}</td>
              <td style={{padding:"9px 10px"}}><span style={{color:coordColor(v.coordinador),fontWeight:700,fontSize:11}}>{v.coordinador?.split(" ")[0]}</span></td>
              <td style={{padding:"9px 10px",color:"#f1f5f9",fontFamily:"monospace",fontWeight:700}}>{v.unidad}</td>
              <td style={{padding:"9px 10px",color:"#94a3b8",fontFamily:"monospace"}}>{v.caja}</td>
              <td style={{padding:"9px 10px",color:"#94a3b8",maxWidth:100,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{v.cliente}</td>
              <td style={{padding:"9px 10px",color:"#64748b",fontSize:10}}>{v.origen}</td>
              <td style={{padding:"9px 10px",color:"#64748b",fontSize:10}}>{v.destino}</td>
              <td style={{padding:"9px 10px"}}><Badge text={v.estatus}/></td>
              <td style={{padding:"9px 10px",color:"#64748b"}}>{v.kmCargados||"—"}</td>
              <td style={{padding:"9px 10px",color:v.ventaReal?"#10b981":"#334155",fontWeight:v.ventaReal?700:400}}>{v.ventaReal?fmt$(v.ventaReal):"—"}</td>
              <td style={{padding:"9px 10px",color:"#64748b",fontSize:10}}>{v.circuito}</td>
              <td style={{padding:"9px 10px",whiteSpace:"nowrap"}}><span style={{color:s.color,fontSize:11,fontWeight:700}}>{s.icon} {s.texto}</span></td>
            </tr>
          );})}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ─── TRACKER LINEAL ───────────────────────────────────────────────────────────
const TrackerLineal=({data})=>{
  const estatusList=data.tractos||[];
  const hoyTractos=estatusList.filter(e=>e.fecha===TODAY);
  const enRuta=hoyTractos.filter(e=>{const m=(e.motivo||"").toUpperCase();return m.includes("VTA")||m.includes("TRN")||m.includes("MOV");});
  return(
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      <div style={{color:"#475569",fontSize:11,textTransform:"uppercase",letterSpacing:1.5}}>🛣️ Tracker — {enRuta.length} unidades en movimiento hoy</div>
      {enRuta.length===0&&<div style={{color:"#334155",fontSize:13,textAlign:"center",padding:24}}>Sin unidades en movimiento registradas hoy ({TODAY})</div>}
      {enRuta.slice(0,15).map((e,idx)=>{
        const cfg=CIRCUITOS_CONFIG[e.ruta]||{paradas:["Origen","En Ruta","Destino"],siguiente:"Definir circuito",tiempoEst:"—",color:"#6366f1"};
        const posIdx=1;
        return(
          <div key={e.unidad+idx} style={{background:"#0a1628",border:`1px solid ${cfg.color}30`,borderRadius:12,padding:14,overflow:"hidden"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
              <div style={{display:"flex",gap:10,alignItems:"center"}}>
                <span style={{color:"#f1f5f9",fontWeight:900,fontFamily:"monospace",fontSize:14}}>{e.unidad}</span>
                <span style={{color:"#64748b",fontSize:11}}>{e.operador?.split(" ").slice(0,2).join(" ")}</span>
                <Badge text={motivoToEstatus(e.motivo)}/>
              </div>
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                {e.monto>0&&<span style={{color:"#10b981",fontSize:11,fontWeight:700}}>{fmt$(e.monto)}</span>}
                <span style={{color:coordColor(e.coordinador),fontSize:10,fontWeight:700}}>{e.coordinador?.split(" ")[0]}</span>
              </div>
            </div>
            <div style={{marginBottom:10,color:"#94a3b8",fontSize:11}}>{e.ruta||"Sin ruta asignada"}</div>
            <div style={{position:"relative",overflowX:"auto"}}>
              <div style={{display:"flex",alignItems:"center",minWidth:cfg.paradas.length*90,paddingBottom:8}}>
                {cfg.paradas.map((parada,pi)=>{
                  const esActual=pi===posIdx,esAnterior=pi<posIdx;
                  return(
                    <React.Fragment key={pi}>
                      <div style={{display:"flex",flexDirection:"column",alignItems:"center",minWidth:80,zIndex:2}}>
                        <div style={{width:esActual?22:14,height:esActual?22:14,borderRadius:"50%",background:esActual?cfg.color:esAnterior?cfg.color+"80":"#1e293b",border:esActual?`3px solid ${cfg.color}`:`2px solid ${esAnterior?cfg.color+"60":"#1e293b"}`,boxShadow:esActual?`0 0 12px ${cfg.color}`:"none",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                          {esActual&&<span style={{fontSize:8}}>🚛</span>}
                          {esAnterior&&<span style={{color:"#fff",fontSize:8,fontWeight:900}}>✓</span>}
                        </div>
                        <div style={{color:esActual?"#f1f5f9":esAnterior?"#475569":"#334155",fontSize:9,marginTop:5,textAlign:"center",fontWeight:esActual?700:400,whiteSpace:"nowrap"}}>{parada}</div>
                      </div>
                      {pi<cfg.paradas.length-1&&<div style={{flex:1,height:3,background:pi<posIdx?cfg.color+"80":"#1e293b",minWidth:20,position:"relative",top:-14,flexShrink:0}}/>}
                    </React.Fragment>
                  );
                })}
              </div>
            </div>
            <div style={{background:"#060d1a",borderRadius:8,padding:"6px 12px",marginTop:6,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{color:"#475569",fontSize:10}}>📍 {e.comentarios?.slice(0,40)||"—"}</span>
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
  const h=new Date();h.setHours(0,0,0,0);
  const alertas=[];
  (data.viajes||[]).filter(v=>!v.entregado&&v.fechaEntregaProg&&v.fechaEntregaProg!=="").forEach(v=>{
    const prog=new Date(v.fechaEntregaProg);if(isNaN(prog))return;prog.setHours(0,0,0,0);
    const diff=Math.floor((prog-h)/86400000);
    if(diff<0)alertas.push({tipo:"Entrega Vencida",unidad:v.unidad,caja:v.caja,op:v.cliente,coord:v.coordinador?.split(" ")[0],desc:`Vencida hace ${Math.abs(diff)}d — ${v.circuito}`,fecha:v.fechaEntregaProg});
    else if(diff===0)alertas.push({tipo:"Entrega Hoy",unidad:v.unidad,caja:v.caja,op:v.cliente,coord:v.coordinador?.split(" ")[0],desc:`Entrega HOY — ${v.destino}`,fecha:v.fechaEntregaProg});
  });
  const hoyTractos=(data.tractos||[]).filter(e=>e.fecha===TODAY);
  const grupos=computeMant(data.tractos||[]);
  grupos.CP.forEach(e=>alertas.push({tipo:"CP - Correctivo",unidad:e.unidad,caja:"-",op:e.operador,coord:e.coordinador?.split(" ")[0],desc:e.comentarios||e.motivo,fecha:TODAY}));
  grupos.SG.forEach(e=>alertas.push({tipo:"SG - Siniestro",unidad:e.unidad,caja:"-",op:e.operador,coord:e.coordinador?.split(" ")[0],desc:e.comentarios||"Siniestro/Garantía",fecha:TODAY}));
  grupos.SO.slice(0,5).forEach(e=>alertas.push({tipo:"Sin Operador",unidad:e.unidad,caja:"-",op:"VACANTE",coord:e.coordinador?.split(" ")[0],desc:e.comentarios||"Sin operador asignado",fecha:TODAY}));
  grupos.IND.forEach(e=>alertas.push({tipo:"IND - Indisciplina",unidad:e.unidad,caja:"-",op:e.operador,coord:e.coordinador?.split(" ")[0],desc:e.comentarios||"Indisciplina reportada",fecha:TODAY}));
  (data.cajas||[]).filter(c=>c.estatus==="Dañada").forEach(c=>alertas.push({tipo:"Caja Dañada",unidad:"-",caja:c.caja,op:"-",coord:c.coordinador?.split(" ")[0],desc:`${c.ciudad} — ${c.comentarios}`,fecha:""}));
  (data.cajas||[]).filter(c=>c.estatus==="No localizada").forEach(c=>alertas.push({tipo:"Caja Perdida",unidad:"-",caja:c.caja,op:"-",coord:c.coordinador?.split(" ")[0],desc:c.comentarios||"No localizada",fecha:""}));
  const COLS={"Entrega Vencida":"#ef4444","Entrega Hoy":"#f59e0b","Sin Operador":"#64748b","SG - Siniestro":"#ef4444","Caja Dañada":"#f97316","Caja Perdida":"#ef4444","CP - Correctivo":"#f59e0b","IND - Indisciplina":"#ef4444"};
  return(
    <div style={{display:"flex",flexDirection:"column",gap:8}}>
      <div style={{color:"#475569",fontSize:11}}>{alertas.length} alertas activas — generadas automáticamente desde tus datos</div>
      {alertas.length===0&&<div style={{color:"#334155",textAlign:"center",padding:24,fontSize:13}}>✅ Sin alertas. Toca 🔄 Sincronizar para actualizar.</div>}
      {alertas.map((a,i)=>{const col=COLS[a.tipo]||"#6366f1";return(
        <div key={i} style={{background:"#0a1628",border:`1px solid ${col}25`,borderLeft:`3px solid ${col}`,borderRadius:8,padding:"12px 14px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
            <div>
              <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:4}}><Badge text={a.tipo}/>{a.fecha&&<span style={{color:"#334155",fontSize:10}}>{a.fecha}</span>}</div>
              <div style={{color:"#cbd5e1",fontSize:12,fontWeight:600}}>{a.op}</div>
              <div style={{color:"#475569",fontSize:11,marginTop:2}}>{a.unidad!=="-"&&<span>🚛 {a.unidad} </span>}{a.caja!=="-"&&<span>📦 {a.caja} </span>}— {a.desc}</div>
            </div>
            <span style={{color:coordColor(a.coord||""),fontSize:10,fontWeight:700}}>{a.coord}</span>
          </div>
        </div>
      );})}
    </div>
  );
};

// ─── APP ROOT ─────────────────────────────────────────────────────────────────
const TABS=[
  {id:"dashboard",label:"Dashboard",icon:"📊"},
  {id:"tracker",label:"Tracker",icon:"🛣️"},
  {id:"distribucion",label:"Distribución",icon:"🗂️"},
  {id:"tractos",label:"Unidades",icon:"🚛"},
  {id:"mantenimiento",label:"Mantenimiento",icon:"🔧"},
  {id:"cajas",label:"Cajas",icon:"📦"},
  {id:"viajes",label:"Viajes",icon:"💰"},
  {id:"alertas",label:"Alertas",icon:"🔔"},
];

function App(){
  const [data,setData]=useState(()=>initData());
  const [tab,setTab]=useState("dashboard");
  const [syncState,setSyncState]=useState("idle");
  const [lastSync,setLastSync]=useState("");

  useEffect(()=>{saveLocal(data);},[data]);
  useEffect(()=>{if(!USAR_SHEETS)return;syncFromSheets();},[]);

  const syncFromSheets=async()=>{
    setSyncState("syncing");
    try{
      const [estatusRaw,cajasRaw,viajesRaw,rendRaw,dieselRaw]=await Promise.all([
        sheetsGet("Estatus_diario"),
        sheetsGet("Control_Cajas"),
        sheetsGet("VIAJES"),
        sheetsGet("RENDIMIENTOS"),
        sheetsGet("CARGAS_DIESEL"),
      ]);
      const tractos=(estatusRaw||[]).map(mapEstatus).filter(e=>e.unidad);
      const cajas=(cajasRaw||[]).map(mapCaja).filter(c=>c.caja);
      const viajes=(viajesRaw||[]).map((r,i)=>mapViaje(r,i)).filter(v=>v.unidad||v.cliente);
      const rendimientos=(rendRaw||[]).map(mapRendimiento).filter(r=>r.unidad);
      const diesel=(dieselRaw||[]).map(mapDiesel).filter(d=>d.unidad);
      const updated={...data,tractos,cajas,viajes,rendimientos,diesel,version:6,lastUpdate:new Date().toISOString()};
      setData(updated);saveLocal(updated);
      setSyncState("ok");
      setLastSync(new Date().toLocaleTimeString("es-MX",{hour:"2-digit",minute:"2-digit"}));
      setTimeout(()=>setSyncState("idle"),4000);
    }catch(e){
      console.error("Sync error:",e);
      setSyncState("error");
      setTimeout(()=>setSyncState("idle"),6000);
    }
  };

  const h=new Date();h.setHours(0,0,0,0);
  const alertCount=(data.viajes||[]).filter(v=>!v.entregado&&v.fechaEntregaProg&&v.fechaEntregaProg!==""&&new Date(v.fechaEntregaProg)<=h).length
    +(data.cajas||[]).filter(c=>c.estatus==="Dañada"||c.estatus==="No localizada").length
    +computeMant(data.tractos||[]).SG.length
    +computeMant(data.tractos||[]).IND.length;

  return(
    <div style={{minHeight:"100vh",background:"#060d1a",color:"#e2e8f0",fontFamily:"'DM Sans','Segoe UI',sans-serif"}}>
      <div style={{background:"#08111f",borderBottom:"1px solid #0f1e33",padding:"12px 18px",display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:100}}>
        <div>
          <div style={{fontSize:15,fontWeight:900,color:"#f1f5f9",letterSpacing:-.5}}>🚚 Nacional Autotransporte</div>
          <div style={{fontSize:9,color:"#334155",letterSpacing:1.5,textTransform:"uppercase"}}>ERP TMS v6 {USAR_SHEETS?`· ☁️ ${lastSync}`:"· 💾 Local"}</div>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <div style={{width:7,height:7,borderRadius:"50%",background:"#10b981",boxShadow:"0 0 8px #10b981"}}/>
          <span style={{color:"#10b981",fontSize:10,fontWeight:700}}>OPERATIVO</span>
        </div>
      </div>
      <div style={{background:"#08111f",borderBottom:"1px solid #0f1e33",display:"flex",overflowX:"auto",padding:"0 14px"}}>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)}
            style={{background:"none",border:"none",borderBottom:tab===t.id?"2px solid #3b82f6":"2px solid transparent",color:tab===t.id?"#f1f5f9":"#475569",padding:"11px 12px",cursor:"pointer",fontSize:11,fontWeight:tab===t.id?700:400,whiteSpace:"nowrap",display:"flex",gap:4,alignItems:"center",position:"relative"}}>
            {t.icon} {t.label}
            {t.id==="alertas"&&alertCount>0&&<span style={{background:"#ef4444",color:"#fff",borderRadius:"50%",width:16,height:16,fontSize:9,fontWeight:900,display:"flex",alignItems:"center",justifyContent:"center",marginLeft:2}}>{alertCount}</span>}
          </button>
        ))}
      </div>
      <div style={{padding:16,maxWidth:1400,margin:"0 auto"}}>
        <SyncBanner syncState={syncState} onSync={syncFromSheets} lastSync={lastSync}/>
        {tab==="dashboard"     &&<Dashboard data={data}/>}
        {tab==="tracker"       &&<TrackerLineal data={data}/>}
        {tab==="distribucion"  &&<Distribucion data={data}/>}
        {tab==="tractos"       &&<Tractos data={data} setData={setData}/>}
        {tab==="mantenimiento" &&<Mantenimiento data={data}/>}
        {tab==="cajas"         &&<Cajas data={data} setData={setData}/>}
        {tab==="viajes"        &&<Viajes data={data}/>}
        {tab==="alertas"       &&<Alertas data={data}/>}
      </div>
      <div style={{padding:"12px 18px",borderTop:"1px solid #0f1e33",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <span style={{color:"#1e3a5f",fontSize:10}}>{(data.tractos||[]).filter(e=>e.fecha===TODAY).length} Unidades hoy · {(data.cajas||[]).length} Cajas · {(data.viajes||[]).length} Viajes · v6</span>
        <button onClick={()=>{if(window.confirm("¿Resetear datos locales?")){localStorage.removeItem(STORAGE_KEY);window.location.reload();}}} style={{background:"none",border:"1px solid #1e293b",borderRadius:6,padding:"4px 10px",color:"#334155",fontSize:10,cursor:"pointer"}}>🔄 Reset</button>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(React.createElement(App));
