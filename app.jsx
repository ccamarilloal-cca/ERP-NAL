// ═══════════════════════════════════════════════════════════════════════════
//  NACIONAL AUTOTRANSPORTE — ERP TMS v5
//  Conectado a: sistema_logistico.xlsx (Google Sheets)
//  Pestañas: VIAJES | Estatus_diario | Control_Cajas | CATALOGO_UNIDADES
//            RENDIMIENTOS | Circuito | CLIENTES | CONTROL_OPERADORES
//  Interfaz: sin cambios — solo datos actualizados
// ═══════════════════════════════════════════════════════════════════════════

const { useState, useEffect, useRef, useCallback } = React;

// ─── CONFIG ───────────────────────────────────────────────────────────────────
const SHEETS_URL = window.SHEETS_URL || "PEGA_TU_URL_AQUI";
const USAR_SHEETS = SHEETS_URL !== "PEGA_TU_URL_AQUI";
const STORAGE_KEY = "nal_erp_v5";

// ─── CIRCUITOS CONFIG ─────────────────────────────────────────────────────────
const CIRCUITOS_CONFIG = {
  "Reynosa - Bajio": { paradas:["Reynosa","Mty","Saltillo","SLP","Aguascalientes","Querétaro","Bajío"], siguiente:"Regreso Reynosa o Adient Saltillo", tiempoEst:"18-22 hrs", color:"#3b82f6" },
  "Remolacha":       { paradas:["Reynosa","Pharr TX","McAllen TX","Harlingen TX"], siguiente:"Reynosa patio o Carrier MTY", tiempoEst:"4-6 hrs", color:"#10b981" },
  "DX":              { paradas:["Nuevo Laredo","Laredo TX","Dallas TX"], siguiente:"Regreso NLD o Mty-Bajio", tiempoEst:"8-10 hrs", color:"#f59e0b" },
  "Adient":          { paradas:["Reynosa","Saltillo","Arteaga","Ramos"], siguiente:"Remolacha o Reynosa-Bajio", tiempoEst:"6-8 hrs", color:"#a855f7" },
  "Mty-Bajio":       { paradas:["Monterrey","Saltillo","SLP","Bajío"], siguiente:"DX Nuevo Laredo o Remolacha", tiempoEst:"8-10 hrs", color:"#6366f1" },
  "Nld-Bajio":       { paradas:["Nuevo Laredo","Monterrey","Saltillo","Bajío"], siguiente:"DX o Reynosa-Bajio", tiempoEst:"10-12 hrs", color:"#ef4444" },
  "Carrier":         { paradas:["Monterrey","Nuevo León"], siguiente:"Mty-Bajio o Remolacha", tiempoEst:"2-3 hrs", color:"#f97316" },
};

// ─── STORAGE ──────────────────────────────────────────────────────────────────
const loadLocal = () => { try { const r=localStorage.getItem(STORAGE_KEY); return r?JSON.parse(r):null; } catch{return null;} };
const saveLocal = (d) => { try{localStorage.setItem(STORAGE_KEY,JSON.stringify(d));}catch{} };

// ─── GOOGLE SHEETS API ────────────────────────────────────────────────────────
const sheetsGet = async (tab) => {
  const r = await fetch(`${SHEETS_URL}?tab=${encodeURIComponent(tab)}`);
  const j = await r.json();
  return j.data || j; // handle both {data:[]} and plain array
};
const sheetsPost = async (tab, rows) => {
  await fetch(SHEETS_URL, {
    method:"POST", mode:"no-cors",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({tab, action:"replace", rows})
  });
};

// ─── MAP FUNCTIONS: Sheet columns → App fields ────────────────────────────────
// VIAJES sheet → app viaje object
const mapViaje = (r, i) => ({
  id: r["Referencia / ID"] || `V-${i+1}`,
  semana: r["Semana"] || "",
  fecha: r["Fecha"] || "",
  dia: r["Día"] || "",
  coordinador: r["Coordinador"] || "",
  unidad: String(r["Unidad"] || ""),
  operador: r["Operador"] || "",
  caja: String(r["Caja"] || ""),
  referenciaId: r["Referencia / ID"] || "",
  cliente: r["Cliente"] || "",
  origen: r["Origen"] || "",
  destino: r["Destino"] || "",
  tipoCarga: r["Tipo de carga"] || "",
  estatus: r["Estatus viaje"] || "",
  cartaPorte: r["Carta Porte"] || "",
  patioActual: r["Patio Actual"] || "",
  patioDestino: r["Patio Destino"] || "",
  horaCarga: r["Hora carga"] || "",
  horaSalida: r["Hora salida"] || "",
  horaLlegada: r["Hora llegada"] || "",
  fechaCarga: r["Fecha de carga"] || "",
  fechaDescarga: r["Fecha descarga"] || "",
  citaDescarga: r["Cita descarga"] || "",
  kmProgramados: parseFloat(String(r["Km programados"]||"0").replace(/[$,]/g,""))||0,
  kmCargados: parseFloat(String(r["Km cargados"]||"0").replace(/[$,]/g,""))||0,
  kmVacios: parseFloat(String(r["Km Vacíos"]||"0").replace(/[$,]/g,""))||0,
  costoKmVacios: parseFloat(String(r["Costo km vacíos"]||"0").replace(/[$,]/g,""))||0,
  diesel: parseFloat(String(r["Diesel programado"]||"0").replace(/[$,]/g,""))||0,
  comisiones: parseFloat(String(r["Comisiones"]||"0").replace(/[$,]/g,""))||0,
  dadivas: parseFloat(String(r["Dádivas"]||"0").replace(/[$,]/g,""))||0,
  casetas: parseFloat(String(r["Casetas"]||"0").replace(/[$,]/g,""))||0,
  incidencia: r["Incidencia"] || "0",
  tipoIncidencia: r["Tipo incidencia"] || "",
  observaciones: r["Observaciones"] || "",
  costoMtto: parseFloat(String(r["Costo mantenimiento"]||"0").replace(/[$,]/g,""))||0,
  tipoCambio: r["Tipo de cambio"] || "",
  moneda: r["Moneda"] || "MXN",
  ventaEst: parseFloat(String(r["Venta estimada"]||"0").replace(/[$,]/g,""))||0,
  ventaReal: r["Venta real"]&&r["Venta real"]!=""&&r["Venta real"]!="0"? parseFloat(String(r["Venta real"]).replace(/[$,]/g,""))||null : null,
  utilidad: r["Utilidad"] || "",
  ultimaAct: r["Última actualización"] || "",
  usuario: r["Usuario captura"] || "",
  kml: r["Rendimiento real (km/l)"] || "—",
  circuito: r["Circuito"] || "",
  siguienteOrigen: r["Siguiente Origen Sugerido"] || "",
  moverA: r["Mover a:"] || "",
  diasSinViaje: r["Días Sin Viaje"] || "",
  alerta: r["Alerta Movimiento"] || "",
  litrosDiesel: 0,
  entregado: (r["Estatus viaje"]||"").toLowerCase().includes("entregado")||(r["Estatus viaje"]||"").toLowerCase().includes("terminado")||(r["Estatus viaje"]||"").toLowerCase().includes("finalizado"),
  fechaEntregaProg: r["Cita descarga"] || r["Fecha descarga"] || "",
});

// Estatus_diario → tracto
const mapEstatus = (r) => ({
  fecha: r["Fecha"] || "",
  unidad: r["Unidad"] || "",
  operador: r["Operador"] || "",
  unidadNegocio: r["UnidadDeNegocio"] || "",
  estatus: r["Estatus"] || "",
  motivo: r["Motivo"] || "",
  ruta: r["NombreRuta"] || "",
  monto: parseFloat(r["Monto"]||0)||0,
  coordinador: r["Coordinador"] || "",
  comentarios: r["Comentarios"] || "",
});

// Estatus_diario → app tracto format
const estatusToTracto = (e) => ({
  unidad: e.unidad,
  operador: e.operador || "—",
  coordinador: e.coordinador,
  estatus: motivoToEstatus(e.motivo, e.estatus),
  circuito: e.ruta || "-",
  ubicacion: e.ruta || e.comentarios?.slice(0,20) || "—",
  motivo: e.motivo,
});

const motivoToEstatus = (motivo, est) => {
  const m = (motivo||"").toUpperCase();
  const e = (est||"").toUpperCase();
  if (m.includes("VTA")||m.includes("FACTURANDO")) return "VTA - Facturando";
  if (m.includes("TRN")||m.includes("TRANSITO")) return "VTA - Facturando";
  if (m.includes("DCO")||m.includes("DISPONIBLE")) return "DCO - Disponible";
  if (m.includes("SG")||m.includes("SINIESTRO")) return "SG - Siniestro";
  if (m.includes("RM")||m.includes("REPARACION")) return "RM - Reparacion Mayor";
  if (m.includes("CP")||m.includes("CORRECTIVO")) return "CP - Correctivo";
  if (m.includes("SO")||m.includes("SIN OPERADOR")) return "Sin Operador";
  if (e.includes("MANTEIMIENTO")||e.includes("MANTEN")) return "Mantenimiento";
  if (e.includes("PROBLEMA")) return "CP - Correctivo";
  if (e.includes("OPERANDO")) return "VTA - Facturando";
  if (e.includes("DISPONIBLE")) return "DCO - Disponible";
  return motivo || est || "Activo";
};

// Control_Cajas → app caja
const mapCaja = (r) => ({
  caja: r["Caja"] || "",
  tipo: r["Tipo"] || "Seca",
  coordinador: r["Coordinador"] || "",
  ciudad: r["Ciudad / Ubicación"] || "",
  patio: r["Ciudad / Ubicación"] || "",
  ubicEsp: r["Ubicación Específica"] || "",
  estatus: r["Estatus"] || "",
  cliente: r["Cliente"] || "",
  deQuienCliente: r["De quion es cliente"] || "",
  desdeCuando: r["Desde Cuándo"] || "",
  comentarios: r["Comentarios"] || "",
  permisionario: "-",
  fechaEntregaProg: "",
  fechaEntregaReal: "",
});

// CATALOGO_UNIDADES → tracto (fallback if no Estatus_diario)
const mapUnidad = (r) => ({
  unidad: r["Unidad"] || "",
  operador: r["Operador"] || "",
  coordinador: r["Coordinador"] || "",
  estatus: r["Estatus, Activo, detenido"] || r["Estatus / Detalle"] || "Activo",
  circuito: r["Circuito"] || "-",
  ubicacion: "-",
});

// RENDIMIENTOS → kml por unidad
const mapRendimiento = (r) => ({
  unidad: r["Numero Economico"] || "",
  operador: r["Operador"] || "",
  kml: r["RendimientoKmLt"] || r["Rendimiento Calculado"] || "—",
  clasificacion: r["Clasificacion"] || "",
  litrosCarga: parseFloat(r["Litros Carga"]||0)||0,
  kmRecorridos: parseFloat(r["Kms Recorridos"]||0)||0,
  fecha: r["Fecha Registro"] || "",
});

// ─── INIT DATA ────────────────────────────────────────────────────────────────
const initData = () => {
  const s = loadLocal();
  if (s && s.version === 5) return s;
  const d = { version:5, tractos:[], cajas:[], viajes:[], rendimientos:[], lastUpdate:new Date().toISOString() };
  saveLocal(d); return d;
};

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const C = { TELLO:"#3b82f6", CRISTIAN:"#10b981", JULIO:"#f59e0b" };
const coordColor = (c="") => {
  const u = c.toUpperCase();
  if (u.includes("TELLO")) return C.TELLO;
  if (u.includes("CRISTIAN")||u.includes("ZUÑIGA")||u.includes("ZUNIGA")) return C.CRISTIAN;
  if (u.includes("JULIO")||u.includes("HERNANDEZ")) return C.JULIO;
  return "#6366f1";
};
const estatusColor = (e="") => {
  const s = e.toLowerCase();
  if (s.includes("facturando")||s.includes("vta")||s.includes("entregado")||s.includes("terminado")||s.includes("finalizado")||s.includes("activo")||s.includes("operando")||s.includes("transito")) return "#10b981";
  if (s.includes("dco")||s.includes("disponible")) return "#3b82f6";
  if (s.includes("programado")||s.includes("esperando")) return "#6366f1";
  if (s.includes("siniestro")||s.includes("sg")||s.includes("dañada")||s.includes("perdida")||s.includes("no localizada")) return "#ef4444";
  if (s.includes("reparacion")||s.includes("rm")||s.includes("correctivo")||s.includes("cp")||s.includes("mtto")||s.includes("mantenimiento")||s.includes("manteimiento")||s.includes("taller")) return "#f59e0b";
  if (s.includes("sin operador")||s.includes("vacante")||s.includes("so")) return "#64748b";
  if (s.includes("liberar")||s.includes("lib")) return "#a855f7";
  if (s.includes("cargada")) return "#10b981";
  if (s.includes("tránsito")) return "#3b82f6";
  if (s.includes("revisar")) return "#f59e0b";
  if (s.includes("permisionario")) return "#f97316";
  if (s.includes("patio")||s.includes("vacia")) return "#64748b";
  return "#64748b";
};
const Badge = ({ text }) => (
  <span style={{ background:estatusColor(text)+"22", color:estatusColor(text), border:`1px solid ${estatusColor(text)}44`, borderRadius:5, padding:"2px 7px", fontSize:10, fontWeight:700, letterSpacing:.5, textTransform:"uppercase", whiteSpace:"nowrap" }}>{text}</span>
);
const semaforoEntrega = (fechaProg, entregado) => {
  if (entregado) return { color:"#10b981", icon:"✅", texto:"Entregado" };
  if (!fechaProg||fechaProg==="") return { color:"#64748b", icon:"⚪", texto:"Sin fecha" };
  const hoy=new Date(); hoy.setHours(0,0,0,0);
  const prog=new Date(fechaProg); if(isNaN(prog)) return {color:"#64748b",icon:"⚪",texto:"Sin fecha"};
  prog.setHours(0,0,0,0);
  const diff=Math.floor((prog-hoy)/86400000);
  if(diff<0) return {color:"#ef4444",icon:"🔴",texto:`${Math.abs(diff)}d vencido`};
  if(diff===0) return {color:"#f59e0b",icon:"🟡",texto:"Hoy"};
  if(diff===1) return {color:"#f97316",icon:"🟠",texto:"Mañana"};
  return {color:"#10b981",icon:"🟢",texto:`${diff}d restantes`};
};
const toCSV=(rows,cols)=>cols.join(",")+"\n"+rows.map(r=>cols.map(c=>`"${r[c]??''}"`).join(",")).join("\n");
const downloadCSV=(content,filename)=>{const blob=new Blob([content],{type:"text/csv;charset=utf-8;"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=filename;a.click();};
const parseTSV=(text)=>{const lines=text.trim().split("\n").filter(l=>l.trim());if(lines.length<2)return null;const headers=lines[0].split("\t").map(h=>h.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/\s+/g,""));return lines.slice(1).map(line=>{const vals=line.split("\t");const obj={};headers.forEach((h,i)=>{obj[h]=(vals[i]||"").trim();});return obj;});};

// ─── UI PRIMITIVES ────────────────────────────────────────────────────────────
const Input = ({ label, value, onChange, type="text", options, required }) => (
  <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
    <label style={{ fontSize:11, color:"#64748b", textTransform:"uppercase", letterSpacing:.8 }}>{label}{required&&<span style={{color:"#ef4444"}}> *</span>}</label>
    {options?(
      <select value={value||""} onChange={e=>onChange(e.target.value)} style={{ background:"#0f172a", border:"1px solid #1e293b", borderRadius:7, padding:"8px 10px", color:"#f1f5f9", fontSize:12, outline:"none" }}>
        <option value="">— Seleccionar —</option>
        {options.map(o=><option key={o} value={o}>{o}</option>)}
      </select>
    ):(
      <input type={type} value={value||""} onChange={e=>onChange(e.target.value)} style={{ background:"#0f172a", border:"1px solid #1e293b", borderRadius:7, padding:"8px 10px", color:"#f1f5f9", fontSize:12, outline:"none" }}/>
    )}
  </div>
);

const Modal = ({ title, onClose, children, wide }) => (
  <div style={{ position:"fixed", inset:0, background:"#000d", zIndex:999, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
    <div style={{ background:"#0d1829", border:"1px solid #1e293b", borderRadius:14, width:"100%", maxWidth:wide?860:560, maxHeight:"92vh", overflow:"auto" }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"16px 20px", borderBottom:"1px solid #1e293b", position:"sticky", top:0, background:"#0d1829", zIndex:1 }}>
        <div style={{ color:"#f1f5f9", fontWeight:700, fontSize:14 }}>{title}</div>
        <button onClick={onClose} style={{ background:"none", border:"none", color:"#64748b", fontSize:22, cursor:"pointer" }}>×</button>
      </div>
      <div style={{ padding:20 }}>{children}</div>
    </div>
  </div>
);

const SyncBanner = ({ syncState, onSync, lastUpdate }) => {
  const cfg = {
    idle:    { bg:"#0a1628", border:"#1e3a5f", color:"#3b82f6", text: USAR_SHEETS?"☁️ Conectado a Google Sheets — "+lastUpdate:"💾 Modo local — pega tu URL de Sheets en index.html" },
    syncing: { bg:"#0a1f0f", border:"#10b98140", color:"#10b981", text:"🔄 Sincronizando con Sheets..." },
    ok:      { bg:"#0a1f0f", border:"#10b98140", color:"#10b981", text:"✅ Datos actualizados desde Sheets" },
    error:   { bg:"#1f0a0a", border:"#ef444440", color:"#ef4444", text:"⚠️ Error al conectar — revisa tu URL de Apps Script" },
  };
  const c=cfg[syncState]||cfg.idle;
  return (
    <div style={{ background:c.bg, border:`1px solid ${c.border}`, borderRadius:9, padding:"8px 14px", display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
      <span style={{ color:c.color, fontSize:12 }}>{c.text}</span>
      {USAR_SHEETS&&<button onClick={onSync} disabled={syncState==="syncing"} style={{ background:"#1e293b", border:"none", borderRadius:6, padding:"4px 12px", color:"#94a3b8", fontSize:11, cursor:"pointer" }}>🔄 Sincronizar</button>}
    </div>
  );
};

// ─── IMPORTADOR MASIVO ────────────────────────────────────────────────────────
const ImportadorMasivo = ({ tipo, onImportar, onClose }) => {
  const [texto,setTexto]=useState(""); const [preview,setPreview]=useState(null); const [error,setError]=useState(""); const [modo,setModo]=useState("reemplazar");
  const plantillas = {
    tractos:{ cols:"Unidad\tOperador\tCoordinador\tEstatus\tCircuito\tUbicacion", ej:"018-ABC\tVICTOR ARAMBULA\tJULIO HERNANDEZ\tActivo\tRemolacha\tReynosa" },
    cajas:  { cols:"Caja\tTipo\tCoordinador\tCiudad / Ubicación\tUbicación Específica\tEstatus\tCliente\tComentarios", ej:"1003-ABC\tSeca\tCristian Zuñiga\tJUAREZ CHIH\tPatio\tDañada\tPENSKE\tVACIA DAÑADA" },
    viajes: { cols:"Semana\tFecha\tCoordinador\tUnidad\tOperador\tCaja\tCliente\tOrigen\tDestino\tEstatus viaje\tKm cargados\tVenta estimada\tVenta real\tCircuito", ej:"15\t2026-04-07\tJUAN JOSE TELLO LAMAS\t105\tFEBRONIO\t1178\tTI PENSKE\tREYNOSA\tSAN LUIS POTOSI\tEntregado\t659\t20000\t20000\tReynosa - Bajio" },
  };
  const p=plantillas[tipo]||plantillas.viajes;
  const parsear=()=>{
    setError("");
    if(!texto.trim()){setError("Pega datos primero.");return;}
    const rows=parseTSV(texto);
    if(!rows||rows.length===0){setError("No se detectaron filas. Incluye encabezados en fila 1.");return;}
    setPreview({filas:rows,total:rows.length});
  };
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
      <div style={{ background:"#0a1628", border:"1px solid #1e3a5f", borderRadius:10, padding:12 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
          <div style={{ color:"#3b82f6", fontWeight:700, fontSize:11 }}>📋 Encabezados para tu Excel (fila 1)</div>
          <button onClick={()=>{const b=new Blob([p.cols+"\n"+p.ej],{type:"text/plain"});const a=document.createElement("a");a.href=URL.createObjectURL(b);a.download=`plantilla_${tipo}.txt`;a.click();}} style={{ background:"#1e3a2f", border:"1px solid #10b98140", borderRadius:6, padding:"4px 10px", color:"#10b981", fontSize:10, cursor:"pointer", fontWeight:700 }}>⬇️ Plantilla</button>
        </div>
        <code style={{ color:"#10b981", fontSize:9, fontFamily:"monospace", overflowX:"auto", display:"block", whiteSpace:"pre" }}>{p.cols}</code>
      </div>
      <div style={{ display:"flex", gap:8 }}>
        {["reemplazar","agregar"].map(m=>(
          <button key={m} onClick={()=>setModo(m)} style={{ flex:1, padding:"8px", borderRadius:8, border:`1px solid ${modo===m?"#3b82f6":"#1e293b"}`, background:modo===m?"#1e3a5f":"#0a1628", color:modo===m?"#f1f5f9":"#64748b", fontSize:11, cursor:"pointer", fontWeight:700 }}>
            {m==="reemplazar"?"🔄 Reemplazar todo":"➕ Agregar"}
          </button>
        ))}
      </div>
      <textarea value={texto} onChange={e=>{setTexto(e.target.value);setPreview(null);setError("");}} placeholder="Copia desde Excel y pega aquí (con encabezados)..." style={{ width:"100%", height:130, background:"#060d1a", border:"1px solid #1e3a5f", borderRadius:8, padding:10, color:"#f1f5f9", fontSize:11, fontFamily:"monospace", resize:"vertical", outline:"none", boxSizing:"border-box" }}/>
      {error&&<div style={{ background:"#2d0a0a", border:"1px solid #ef444440", borderRadius:8, padding:10, color:"#ef4444", fontSize:11 }}>⚠️ {error}</div>}
      {preview&&<div style={{ background:"#0a1c10", border:"1px solid #10b98140", borderRadius:10, padding:12 }}><div style={{ color:"#10b981", fontWeight:700, fontSize:12 }}>✅ {preview.filas.length} registros listos</div></div>}
      <div style={{ display:"flex", gap:8 }}>
        <button onClick={parsear} style={{ flex:1, background:"#1e293b", border:"1px solid #334155", borderRadius:8, padding:"10px", color:"#f1f5f9", fontWeight:700, cursor:"pointer", fontSize:12 }}>🔍 Vista Previa</button>
        {preview&&<button onClick={()=>{onImportar(preview.filas,modo);onClose();}} style={{ flex:2, background:"#10b981", border:"none", borderRadius:8, padding:"10px", color:"#fff", fontWeight:700, cursor:"pointer", fontSize:12 }}>✅ Confirmar ({preview.filas.length})</button>}
      </div>
    </div>
  );
};

// ─── TRACKER LINEAL ───────────────────────────────────────────────────────────
const TrackerLineal = ({ data }) => {
  const enRuta = data.viajes.filter(v=>v.estatus&&(v.estatus.toLowerCase().includes("tránsito")||v.estatus.toLowerCase().includes("transito")||v.estatus.toLowerCase().includes("ruta")||v.estatus.toLowerCase().includes("programado")));
  const entregados = data.viajes.filter(v=>v.entregado).slice(-3);
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
      <div style={{ color:"#475569", fontSize:11, textTransform:"uppercase", letterSpacing:1.5 }}>🛣️ Tracker Lineal — Unidades en Movimiento</div>
      {enRuta.length===0&&<div style={{ color:"#334155", fontSize:13, textAlign:"center", padding:24 }}>No hay unidades en tránsito registradas. Los datos se actualizan desde la pestaña VIAJES de tu Sheets.</div>}
      {enRuta.map((v,idx)=>{
        const cfg=CIRCUITOS_CONFIG[v.circuito]||{paradas:["Origen","Destino"],siguiente:"—",tiempoEst:"—",color:"#6366f1"};
        const sem=semaforoEntrega(v.fechaEntregaProg,v.entregado);
        const posIdx=Math.min(1,cfg.paradas.length-1);
        return (
          <div key={v.id||idx} style={{ background:"#0a1628", border:`1px solid ${cfg.color}30`, borderRadius:12, padding:14, overflow:"hidden" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
              <div style={{ display:"flex", gap:10, alignItems:"center" }}>
                <span style={{ color:"#f1f5f9", fontWeight:900, fontFamily:"monospace", fontSize:14 }}>{v.unidad}</span>
                <span style={{ color:"#64748b", fontSize:11 }}>{v.operador?.split(" ").slice(0,2).join(" ")}</span>
                <Badge text={v.estatus}/>
              </div>
              <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                <span style={{ color:sem.color, fontSize:11, fontWeight:700 }}>{sem.icon} {sem.texto}</span>
                <span style={{ color:coordColor(v.coordinador), fontSize:10, fontWeight:700 }}>{v.coordinador?.split(" ")[0]}</span>
              </div>
            </div>
            <div style={{ display:"flex", gap:14, marginBottom:10, flexWrap:"wrap" }}>
              <span style={{ color:"#94a3b8", fontSize:11 }}>📦 {v.caja}</span>
              <span style={{ color:"#94a3b8", fontSize:11 }}>🏢 {v.cliente}</span>
              <span style={{ color:"#94a3b8", fontSize:11 }}>📍 {v.origen} → {v.destino}</span>
            </div>
            <div style={{ position:"relative", overflowX:"auto" }}>
              <div style={{ display:"flex", alignItems:"center", minWidth:cfg.paradas.length*90, paddingBottom:8 }}>
                {cfg.paradas.map((parada,pi)=>{
                  const esActual=pi===posIdx; const esAnterior=pi<posIdx;
                  return (
                    <React.Fragment key={pi}>
                      <div style={{ display:"flex", flexDirection:"column", alignItems:"center", minWidth:80, zIndex:2 }}>
                        <div style={{ width:esActual?22:14, height:esActual?22:14, borderRadius:"50%", background:esActual?cfg.color:esAnterior?cfg.color+"80":"#1e293b", border:esActual?`3px solid ${cfg.color}`:`2px solid ${esAnterior?cfg.color+"60":"#1e293b"}`, boxShadow:esActual?`0 0 12px ${cfg.color}`:"none", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                          {esActual&&<span style={{fontSize:8}}>🚛</span>}
                          {esAnterior&&<span style={{color:"#fff",fontSize:8,fontWeight:900}}>✓</span>}
                        </div>
                        <div style={{ color:esActual?"#f1f5f9":esAnterior?"#475569":"#334155", fontSize:9, marginTop:5, textAlign:"center", fontWeight:esActual?700:400, whiteSpace:"nowrap", maxWidth:80, overflow:"hidden", textOverflow:"ellipsis" }}>{parada}</div>
                        {esActual&&<div style={{ color:cfg.color, fontSize:8, fontWeight:700, marginTop:2 }}>← AQUÍ</div>}
                      </div>
                      {pi<cfg.paradas.length-1&&<div style={{ flex:1, height:3, background:pi<posIdx?cfg.color+"80":"#1e293b", minWidth:20, position:"relative", top:-14, flexShrink:0 }}/>}
                    </React.Fragment>
                  );
                })}
              </div>
            </div>
            <div style={{ background:"#060d1a", borderRadius:8, padding:"8px 12px", marginTop:8, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <span style={{ color:"#475569", fontSize:10 }}>➡️ Siguiente ruta sugerida:</span>
              <span style={{ color:cfg.color, fontSize:11, fontWeight:700 }}>{v.moverA||v.siguienteOrigen||cfg.siguiente}</span>
            </div>
          </div>
        );
      })}
      {entregados.length>0&&(
        <div>
          <div style={{ color:"#475569", fontSize:10, textTransform:"uppercase", letterSpacing:1, marginBottom:6 }}>✅ Últimas entregas</div>
          {entregados.map((v,i)=>(
            <div key={i} style={{ background:"#0a1628", border:"1px solid #10b98130", borderRadius:8, padding:"10px 14px", marginBottom:6, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <span style={{ color:"#f1f5f9", fontFamily:"monospace", fontWeight:700 }}>{v.unidad}</span>
              <span style={{ color:"#64748b", fontSize:11 }}>{v.cliente}</span>
              <span style={{ color:"#64748b", fontSize:11 }}>{v.origen} → {v.destino}</span>
              <Badge text={v.estatus}/>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── DISTRIBUCIÓN ─────────────────────────────────────────────────────────────
const Distribucion = ({ data }) => {
  const { tractos, viajes } = data;
  const circMap = {};
  tractos.forEach(t=>{
    const c=t.circuito||"-";
    if(!circMap[c]) circMap[c]={total:0,enRuta:0,activos:0,mtto:0,sinOp:0};
    circMap[c].total++;
    const s=t.estatus||"";
    if(s.includes("VTA")||s.includes("Facturando")||s.includes("Operando")||s.includes("tránsito")||s.includes("transito")) circMap[c].enRuta++;
    else if(s.includes("Activo")||s.includes("DCO")||s.includes("Disponible")) circMap[c].activos++;
    else if(["SG","RM","CP","Mantenimiento","Correctivo","Siniestro","taller"].some(x=>s.includes(x))) circMap[c].mtto++;
    else circMap[c].sinOp++;
  });
  const coords=[{n:"Juan José Tello",k:"TELLO",col:"#3b82f6"},{n:"Cristian Zuñiga",k:"CRISTIAN",col:"#10b981"},{n:"Julio Hernandez",k:"JULIO",col:"#f59e0b"}].map(coord=>{
    const ts=tractos.filter(t=>t.coordinador.toUpperCase().includes(coord.k));
    const enRuta=ts.filter(t=>{const s=t.estatus||"";return s.includes("VTA")||s.includes("Facturando")||s.includes("Operando")||s.includes("tránsito");}).length;
    const activos=ts.filter(t=>(t.estatus||"").includes("Activo")||(t.estatus||"").includes("DCO")).length;
    const mtto=ts.filter(t=>["SG","RM","CP","Mantenimiento","Correctivo","Siniestro"].some(x=>(t.estatus||"").includes(x))).length;
    const sinOp=ts.length-enRuta-activos-mtto;
    const vK=viajes.filter(v=>v.coordinador.toUpperCase().includes(coord.k)&&v.kmCargados>0&&v.litrosDiesel>0);
    const kml=vK.length>0?(vK.reduce((s,v)=>s+v.kmCargados/v.litrosDiesel,0)/vK.length).toFixed(2):"—";
    return {...coord,total:ts.length,enRuta,activos,mtto,sinOp,kml};
  });
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:20 }}>
      <div>
        <div style={{ color:"#475569", fontSize:11, textTransform:"uppercase", letterSpacing:1.5, marginBottom:10 }}>👥 Por Coordinador</div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))", gap:10 }}>
          {coords.map(c=>(
            <div key={c.k} style={{ background:"#0a1628", border:`1px solid ${c.col}30`, borderRadius:12, padding:16 }}>
              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:12 }}>
                <div style={{ width:10, height:10, borderRadius:"50%", background:c.col, boxShadow:`0 0 8px ${c.col}` }}/>
                <div style={{ color:"#f1f5f9", fontWeight:800, fontSize:14 }}>{c.n}</div>
                <div style={{ marginLeft:"auto", background:c.col+"20", color:c.col, borderRadius:6, padding:"2px 8px", fontSize:12, fontWeight:700 }}>{c.total}</div>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:6, textAlign:"center", marginBottom:12 }}>
                {[["En Ruta",c.enRuta,"#10b981"],["Activos",c.activos,"#3b82f6"],["Mtto",c.mtto,"#f59e0b"],["Sin Op",c.sinOp,"#64748b"]].map(([l,v,col])=>(
                  <div key={l} style={{ background:col+"15", borderRadius:7, padding:"6px 4px" }}>
                    <div style={{ color:col, fontWeight:900, fontSize:18 }}>{v}</div>
                    <div style={{ color:"#475569", fontSize:9, textTransform:"uppercase" }}>{l}</div>
                  </div>
                ))}
              </div>
              <div style={{ display:"flex", justifyContent:"flex-end", borderTop:"1px solid #1e293b", paddingTop:10 }}>
                <div style={{ background:"#0d1626", borderRadius:7, padding:"4px 10px", textAlign:"center" }}>
                  <div style={{ color:c.col, fontWeight:900, fontSize:16 }}>{c.kml}</div>
                  <div style={{ color:"#475569", fontSize:9 }}>KM/L</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div>
        <div style={{ color:"#475569", fontSize:11, textTransform:"uppercase", letterSpacing:1.5, marginBottom:10 }}>🔁 Por Circuito</div>
        <div style={{ overflowX:"auto" }}>
          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
            <thead><tr style={{ borderBottom:"2px solid #1e293b" }}>{["Circuito","Total","En Ruta","Activos","Mtto","Sin Op","% Operando","Siguiente Ruta"].map(h=><th key={h} style={{ textAlign:"left", padding:"8px 12px", color:"#475569", fontSize:10, textTransform:"uppercase", whiteSpace:"nowrap" }}>{h}</th>)}</tr></thead>
            <tbody>{Object.entries(circMap).sort((a,b)=>b[1].total-a[1].total).map(([circ,v],i)=>{
              const pct=v.total>0?(((v.enRuta+v.activos)/v.total)*100).toFixed(0):0;
              const cfg=CIRCUITOS_CONFIG[circ];
              return (
                <tr key={circ} style={{ borderBottom:"1px solid #0d1626", background:i%2===0?"#080e1c":"transparent" }}>
                  <td style={{ padding:"10px 12px", color:"#f1f5f9", fontWeight:700 }}>{circ}</td>
                  <td style={{ padding:"10px 12px", color:"#94a3b8", fontWeight:700 }}>{v.total}</td>
                  <td style={{ padding:"10px 12px" }}><span style={{ color:"#10b981", fontWeight:700 }}>{v.enRuta}</span></td>
                  <td style={{ padding:"10px 12px" }}><span style={{ color:"#3b82f6", fontWeight:700 }}>{v.activos}</span></td>
                  <td style={{ padding:"10px 12px" }}><span style={{ color:"#f59e0b", fontWeight:700 }}>{v.mtto}</span></td>
                  <td style={{ padding:"10px 12px" }}><span style={{ color:"#64748b", fontWeight:700 }}>{v.sinOp}</span></td>
                  <td style={{ padding:"10px 12px" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                      <div style={{ flex:1, height:5, background:"#1e293b", borderRadius:3, overflow:"hidden" }}>
                        <div style={{ height:"100%", width:`${pct}%`, background:pct>=70?"#10b981":pct>=40?"#f59e0b":"#ef4444", borderRadius:3 }}/>
                      </div>
                      <span style={{ color:pct>=70?"#10b981":pct>=40?"#f59e0b":"#ef4444", fontWeight:700, fontSize:11, minWidth:28 }}>{pct}%</span>
                    </div>
                  </td>
                  <td style={{ padding:"10px 12px", color:cfg?cfg.color:"#475569", fontSize:10, fontWeight:cfg?700:400 }}>{cfg?"➡️ "+cfg.siguiente:"—"}</td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
const Dashboard = ({ data }) => {
  const { tractos, cajas, viajes } = data;
  const enRuta    = tractos.filter(t=>{const s=t.estatus||"";return s.includes("VTA")||s.includes("Facturando")||s.includes("Operando")||s.toLowerCase().includes("tránsito")||s.toLowerCase().includes("transito");}).length;
  const disponibles= tractos.filter(t=>{const s=t.estatus||"";return s.includes("DCO")||s.includes("Disponible");}).length;
  const enMtto    = tractos.filter(t=>["SG","RM","CP","Mantenimiento","Correctivo","Siniestro","taller","Manteimiento"].some(x=>(t.estatus||"").includes(x))).length;
  const sinOp     = tractos.filter(t=>(t.estatus||"").toLowerCase().includes("sin operador")||((t.motivo||"").includes("SO"))).length;
  // Cajas
  const cajaTotales = { Cargada:0, Disponible:0, Dañada:0, Transito:0, Siniestro:0, NoLocalizada:0, Vacia:0, Venta:0 };
  cajas.forEach(c=>{ const s=c.estatus||""; if(s==="Cargada") cajaTotales.Cargada++; else if(s==="Disponible") cajaTotales.Disponible++; else if(s==="Dañada") cajaTotales.Dañada++; else if(s.includes("ránsito")) cajaTotales.Transito++; else if(s==="Siniestro") cajaTotales.Siniestro++; else if(s==="No localizada") cajaTotales.NoLocalizada++; else if(s==="Vacia"||s==="En patio"||s==="En cliente") cajaTotales.Vacia++; else if(s==="Venta") cajaTotales.Venta++; });
  // Financiero
  const realizados = viajes.filter(v=>v.entregado||v.ventaReal);
  const ventaReal  = realizados.reduce((s,v)=>s+(v.ventaReal||0),0);
  const costoTotal = realizados.reduce((s,v)=>s+(v.comisiones||0)+(v.diesel||0)+(v.casetas||0)+(v.costoMtto||0),0);
  const utilidad   = ventaReal - costoTotal;
  const margen     = ventaReal>0?((utilidad/ventaReal)*100).toFixed(1):0;
  // KML desde rendimientos
  const rend       = data.rendimientos||[];
  const kmlG       = rend.length>0?(rend.reduce((s,r)=>s+(parseFloat(r.kml)||0),0)/rend.filter(r=>parseFloat(r.kml)>0).length||1).toFixed(2):"—";
  // Alertas
  const hoy=new Date(); hoy.setHours(0,0,0,0);
  const vencidas=viajes.filter(v=>!v.entregado&&v.fechaEntregaProg&&new Date(v.fechaEntregaProg)<hoy&&v.fechaEntregaProg!=="");
  const hoyEntrega=viajes.filter(v=>!v.entregado&&v.fechaEntregaProg&&new Date(v.fechaEntregaProg).toDateString()===hoy.toDateString());

  const KPI=({label,val,color,icon,sub})=>(
    <div style={{ background:"#0a1628", border:`1px solid ${color}30`, borderRadius:11, padding:"14px 16px", position:"relative", overflow:"hidden" }}>
      <div style={{ position:"absolute", top:0, left:0, right:0, height:2, background:color }}/>
      <div style={{ fontSize:16 }}>{icon}</div>
      <div style={{ fontSize:24, fontWeight:900, color, lineHeight:1.1, marginTop:4 }}>{val}</div>
      <div style={{ fontSize:10, color:"#64748b", textTransform:"uppercase", letterSpacing:.8, marginTop:2 }}>{label}</div>
      {sub&&<div style={{ fontSize:10, color:"#334155", marginTop:2 }}>{sub}</div>}
    </div>
  );

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:18 }}>
      <div>
        <div style={{ color:"#475569", fontSize:11, letterSpacing:2, textTransform:"uppercase" }}>Torre de Control · {new Date().toLocaleDateString("es-MX",{day:"2-digit",month:"short",year:"numeric"})}</div>
        <div style={{ color:"#f1f5f9", fontSize:20, fontWeight:900, marginTop:2 }}>Nacional Autotransporte</div>
      </div>
      {(vencidas.length>0||hoyEntrega.length>0)&&(
        <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
          {vencidas.length>0&&<div style={{ background:"#1f0a0a", border:"1px solid #ef444450", borderLeft:"4px solid #ef4444", borderRadius:9, padding:"10px 14px" }}><span style={{ color:"#ef4444", fontWeight:700, fontSize:12 }}>🔴 {vencidas.length} entrega(s) VENCIDA(S) — {vencidas.map(v=>v.unidad).join(", ")}</span></div>}
          {hoyEntrega.length>0&&<div style={{ background:"#1f1200", border:"1px solid #f59e0b50", borderLeft:"4px solid #f59e0b", borderRadius:9, padding:"10px 14px" }}><span style={{ color:"#f59e0b", fontWeight:700, fontSize:12 }}>🟡 {hoyEntrega.length} entrega(s) HOY — {hoyEntrega.map(v=>v.unidad).join(", ")}</span></div>}
        </div>
      )}
      <div style={{ color:"#475569", fontSize:11, textTransform:"uppercase", letterSpacing:1 }}>🚛 {tractos.length} Unidades (desde Estatus_diario)</div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(130px,1fr))", gap:8 }}>
        <KPI label="En Ruta/VTA" val={enRuta} color="#10b981" icon="🟢" sub="Facturando"/>
        <KPI label="Disponibles" val={disponibles} color="#3b82f6" icon="🔵" sub="DCO"/>
        <KPI label="Mantenimiento" val={enMtto} color="#f59e0b" icon="🔧" sub="CP/RM/SG"/>
        <KPI label="Sin Operador" val={sinOp} color="#64748b" icon="⚠️" sub="SO"/>
      </div>
      <div style={{ color:"#475569", fontSize:11, textTransform:"uppercase", letterSpacing:1 }}>📦 {cajas.length} Cajas</div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(100px,1fr))", gap:8 }}>
        <KPI label="Cargadas" val={cajaTotales.Cargada} color="#10b981" icon="📦"/>
        <KPI label="Disponibles" val={cajaTotales.Disponible} color="#3b82f6" icon="🆓"/>
        <KPI label="En Tránsito" val={cajaTotales.Transito} color="#6366f1" icon="🔄"/>
        <KPI label="Dañadas" val={cajaTotales.Dañada} color="#ef4444" icon="🔴"/>
        <KPI label="Siniestro" val={cajaTotales.Siniestro} color="#ef4444" icon="💥"/>
        <KPI label="No localiz." val={cajaTotales.NoLocalizada} color="#f97316" icon="❓"/>
        <KPI label="Vacías" val={cajaTotales.Vacia} color="#64748b" icon="📭"/>
        <KPI label="Venta" val={cajaTotales.Venta} color="#64748b" icon="🏷️"/>
      </div>
      <div style={{ color:"#475569", fontSize:11, textTransform:"uppercase", letterSpacing:1 }}>💰 Rentabilidad NACIONALES</div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(130px,1fr))", gap:8 }}>
        <KPI label="Venta Real" val={`$${(ventaReal/1000).toFixed(0)}K`} color="#10b981" icon="💵"/>
        <KPI label="Costo Total" val={`$${(costoTotal/1000).toFixed(0)}K`} color="#f59e0b" icon="📉"/>
        <KPI label="Utilidad" val={`$${(utilidad/1000).toFixed(0)}K`} color={utilidad>=0?"#10b981":"#ef4444"} icon="📊"/>
        <KPI label="Margen" val={`${margen}%`} color={margen>=20?"#10b981":"#f59e0b"} icon="%" sub="Meta >20%"/>
        <KPI label="KM/L Flota" val={kmlG} color="#6366f1" icon="⛽"/>
        <KPI label="Viajes" val={viajes.length} color="#a855f7" icon="✅"/>
      </div>
      <div style={{ color:"#475569", fontSize:11, textTransform:"uppercase", letterSpacing:1 }}>👥 Por Coordinador</div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))", gap:10 }}>
        {[{n:"Juan José Tello",k:"TELLO"},{n:"Cristian Zuñiga",k:"CRISTIAN"},{n:"Julio Hernandez",k:"JULIO"}].map(c=>{
          const vC=viajes.filter(v=>v.coordinador.toUpperCase().includes(c.k)&&(v.entregado||v.ventaReal));
          const venta=vC.reduce((s,v)=>s+(v.ventaReal||0),0);
          const costo=vC.reduce((s,v)=>s+(v.comisiones||0)+(v.diesel||0)+(v.casetas||0)+(v.costoMtto||0),0);
          const util=venta-costo;
          const col=coordColor(c.k);
          const tCount=tractos.filter(t=>t.coordinador.toUpperCase().includes(c.k)).length;
          const rendCoord=rend.filter(r=>(r.operador||"").toUpperCase().includes(c.k)||tractos.filter(t=>t.coordinador.toUpperCase().includes(c.k)&&t.unidad===r.unidad).length>0);
          const kmlC=rendCoord.length>0?(rendCoord.reduce((s,r)=>s+(parseFloat(r.kml)||0),0)/(rendCoord.filter(r=>parseFloat(r.kml)>0).length||1)).toFixed(2):"—";
          return (
            <div key={c.k} style={{ background:"#0a1628", border:`1px solid ${col}30`, borderRadius:11, padding:14 }}>
              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
                <div style={{ width:9, height:9, borderRadius:"50%", background:col }}/>
                <div style={{ color:"#f1f5f9", fontWeight:700, fontSize:13 }}>{c.n}</div>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:6, textAlign:"center" }}>
                {[["Tractos",tCount],["Utilidad",`$${(util/1000).toFixed(0)}K`],["KM/L",kmlC]].map(([l,v])=>(
                  <div key={l}><div style={{ color:col, fontWeight:900, fontSize:16 }}>{v}</div><div style={{ color:"#475569", fontSize:10 }}>{l}</div></div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ─── TRACTOS (desde Estatus_diario) ──────────────────────────────────────────
const Tractos = ({ data, setData }) => {
  const [q,setQ]=useState(""); const [coord,setCoord]=useState(""); const [efil,setEfil]=useState("");
  const [showImport,setShowImport]=useState(false);
  const lista=data.tractos.filter(t=>{
    const tx=q.toLowerCase();
    return (!q||(t.unidad+t.operador+(t.circuito||"")+(t.ubicacion||"")).toLowerCase().includes(tx))
      &&(!coord||t.coordinador.toUpperCase().includes(coord))
      &&(!efil||(t.estatus||"").includes(efil));
  });
  const importar=(filas,modo)=>{
    const nuevos=modo==="reemplazar"?filas.map(r=>({unidad:r.unidad||r.Unidad||"",operador:r.operador||r.Operador||"",coordinador:r.coordinador||r.Coordinador||"",estatus:r.estatus||r.Estatus||"",circuito:r.circuito||r.Circuito||"-",ubicacion:r.ubicacion||r.Ubicacion||""})):[...data.tractos,...filas.map(r=>({unidad:r.unidad||"",operador:r.operador||"",coordinador:r.coordinador||"",estatus:r.estatus||"",circuito:r.circuito||"-",ubicacion:r.ubicacion||""}))];
    const updated={...data,tractos:nuevos,lastUpdate:new Date().toISOString()};
    setData(updated);saveLocal(updated);
    if(USAR_SHEETS) sheetsPost("Estatus_diario",nuevos);
  };
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
      <div style={{ background:"#0a1628", border:"1px solid #1e3a5f", borderRadius:8, padding:"8px 12px", fontSize:11, color:"#3b82f6" }}>
        ℹ️ Las unidades se cargan automáticamente desde la pestaña <b>Estatus_diario</b> de tu Sheets. Toca 🔄 Sincronizar para actualizar.
      </div>
      {showImport&&<Modal title="📥 Importar Unidades" onClose={()=>setShowImport(false)} wide><ImportadorMasivo tipo="tractos" onImportar={importar} onClose={()=>setShowImport(false)}/></Modal>}
      <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
        <input placeholder="🔍 Buscar unidad, operador..." value={q} onChange={e=>setQ(e.target.value)} style={{ flex:1, minWidth:180, background:"#0a1628", border:"1px solid #1e293b", borderRadius:8, padding:"8px 12px", color:"#f1f5f9", fontSize:12, outline:"none" }}/>
        <select value={coord} onChange={e=>setCoord(e.target.value)} style={{ background:"#0a1628", border:"1px solid #1e293b", borderRadius:8, padding:"8px 10px", color:"#f1f5f9", fontSize:12, outline:"none" }}>
          <option value="">Todos</option><option value="TELLO">Tello</option><option value="CRISTIAN">Cristian</option><option value="JULIO">Julio</option>
        </select>
        <select value={efil} onChange={e=>setEfil(e.target.value)} style={{ background:"#0a1628", border:"1px solid #1e293b", borderRadius:8, padding:"8px 10px", color:"#f1f5f9", fontSize:12, outline:"none" }}>
          <option value="">Todos</option><option value="VTA">En Ruta</option><option value="DCO">Disponible</option><option value="Sin Operador">Sin Op</option><option value="Correctivo">MTTO</option><option value="Siniestro">Siniestro</option>
        </select>
        <button onClick={()=>setShowImport(true)} style={{ background:"#1e3a5f", border:"1px solid #3b82f640", borderRadius:8, padding:"8px 12px", color:"#3b82f6", fontSize:11, cursor:"pointer", fontWeight:700 }}>📥 Importar</button>
        <button onClick={()=>downloadCSV(toCSV(data.tractos,["unidad","operador","coordinador","estatus","circuito","ubicacion","motivo"]),"unidades.csv")} style={{ background:"#1e3a2f", border:"1px solid #10b98144", borderRadius:8, padding:"8px 12px", color:"#10b981", fontSize:11, cursor:"pointer", fontWeight:700 }}>⬇️ CSV</button>
      </div>
      <div style={{ color:"#475569", fontSize:11 }}>{lista.length} de {data.tractos.length} unidades</div>
      <div style={{ overflowX:"auto" }}>
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
          <thead><tr style={{ borderBottom:"2px solid #1e293b" }}>{["Unidad","Operador","Coordinador","Estatus","Circuito / Ruta","Ubicación","Motivo"].map(h=><th key={h} style={{ textAlign:"left", padding:"8px 10px", color:"#475569", fontSize:10, textTransform:"uppercase" }}>{h}</th>)}</tr></thead>
          <tbody>{lista.map((t,i)=>(
            <tr key={t.unidad+i} style={{ borderBottom:"1px solid #0d1626", background:i%2===0?"#080e1c":"transparent" }}>
              <td style={{ padding:"9px 10px", color:"#f1f5f9", fontWeight:800, fontFamily:"monospace" }}>{t.unidad}</td>
              <td style={{ padding:"9px 10px", color:"#94a3b8", maxWidth:160, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{t.operador}</td>
              <td style={{ padding:"9px 10px" }}><span style={{ color:coordColor(t.coordinador), fontWeight:700, fontSize:11 }}>{t.coordinador?.split(" ")[0]}</span></td>
              <td style={{ padding:"9px 10px" }}><Badge text={t.estatus}/></td>
              <td style={{ padding:"9px 10px", color:"#64748b" }}>{t.circuito}</td>
              <td style={{ padding:"9px 10px", color:"#94a3b8" }}>{t.ubicacion}</td>
              <td style={{ padding:"9px 10px", color:"#475569", fontSize:10 }}>{t.motivo}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
};

// ─── CAJAS ────────────────────────────────────────────────────────────────────
const Cajas = ({ data, setData }) => {
  const [q,setQ]=useState(""); const [coord,setCoord]=useState(""); const [efil,setEfil]=useState(""); const [patioFil,setPatioFil]=useState("");
  const [editando,setEditando]=useState(null); const [form,setForm]=useState({});
  const [showImport,setShowImport]=useState(false);
  const resumen={};
  data.cajas.forEach(c=>{resumen[c.estatus]=(resumen[c.estatus]||0)+1;});
  const patios=[...new Set(data.cajas.map(c=>c.ciudad).filter(p=>p&&p!=="-"&&p!==""))].slice(0,10);
  const lista=data.cajas.filter(c=>{
    const tx=q.toLowerCase();
    return (!q||(c.caja+c.cliente+c.ciudad+c.comentarios).toLowerCase().includes(tx))
      &&(!coord||c.coordinador.toUpperCase().includes(coord))
      &&(!efil||c.estatus===efil)
      &&(!patioFil||c.ciudad===patioFil);
  });
  const guardar=()=>{
    const updated={...data,cajas:data.cajas.map(c=>c.caja===editando?{...c,...form}:c),lastUpdate:new Date().toISOString()};
    setData(updated);saveLocal(updated);setEditando(null);
    if(USAR_SHEETS) sheetsPost("Control_Cajas",updated.cajas);
  };
  const importar=(filas,modo)=>{
    const nuevas=modo==="reemplazar"?filas.map(mapCaja):[...data.cajas,...filas.map(mapCaja)];
    const updated={...data,cajas:nuevas,lastUpdate:new Date().toISOString()};
    setData(updated);saveLocal(updated);
    if(USAR_SHEETS) sheetsPost("Control_Cajas",nuevas);
  };
  const hoy=new Date(); hoy.setHours(0,0,0,0);
  const cajaVencidas=data.cajas.filter(c=>c.fechaEntregaProg&&!c.fechaEntregaReal&&new Date(c.fechaEntregaProg)<hoy);
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
      {editando&&<Modal title={`Editar Caja ${editando}`} onClose={()=>setEditando(null)}>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
          <Input label="Estatus" value={form.estatus||""} onChange={v=>setForm(f=>({...f,estatus:v}))} options={["Cargada","Disponible","En patio","En tránsito","Dañada","Siniestro","No localizada","Vacia","Venta"]}/>
          <Input label="Ciudad / Ubicación" value={form.ciudad||""} onChange={v=>setForm(f=>({...f,ciudad:v}))}/>
          <Input label="Ubicación Específica" value={form.ubicEsp||""} onChange={v=>setForm(f=>({...f,ubicEsp:v}))}/>
          <Input label="Cliente" value={form.cliente||""} onChange={v=>setForm(f=>({...f,cliente:v}))}/>
          <Input label="Comentarios" value={form.comentarios||""} onChange={v=>setForm(f=>({...f,comentarios:v}))}/>
          <Input label="Coordinador" value={form.coordinador||""} onChange={v=>setForm(f=>({...f,coordinador:v}))} options={["JUAN JOSE TELLO LAMAS","CRISTIAN SAUL ZUÑIGA CASTILLO","JULIO HERNANDEZ"]}/>
        </div>
        <button onClick={guardar} style={{ marginTop:14,width:"100%",background:"#3b82f6",border:"none",borderRadius:8,padding:"10px",color:"#fff",fontWeight:700,cursor:"pointer",fontSize:13 }}>💾 Guardar {USAR_SHEETS?"+ Sync Sheets":""}</button>
      </Modal>}
      {showImport&&<Modal title="📥 Importar Cajas" onClose={()=>setShowImport(false)} wide><ImportadorMasivo tipo="cajas" onImportar={importar} onClose={()=>setShowImport(false)}/></Modal>}
      {cajaVencidas.length>0&&<div style={{ background:"#1f0a0a", border:"1px solid #ef444450", borderLeft:"4px solid #ef4444", borderRadius:9, padding:"10px 14px" }}><span style={{ color:"#ef4444", fontWeight:700, fontSize:12 }}>🔴 {cajaVencidas.length} caja(s) vencidas: {cajaVencidas.map(c=>c.caja).join(", ")}</span></div>}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(90px,1fr))", gap:6 }}>
        {Object.entries(resumen).map(([k,v])=>(
          <div key={k} onClick={()=>setEfil(efil===k?"":k)} style={{ background:efil===k?estatusColor(k)+"30":estatusColor(k)+"15", border:`1px solid ${estatusColor(k)}${efil===k?"80":"33"}`, borderRadius:8, padding:"8px 10px", cursor:"pointer", textAlign:"center" }}>
            <div style={{ color:estatusColor(k), fontWeight:900, fontSize:18 }}>{v}</div>
            <div style={{ color:"#475569", fontSize:9, textTransform:"uppercase", marginTop:2 }}>{k}</div>
          </div>
        ))}
      </div>
      {patios.length>0&&(
        <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
          {patios.map(p=>{
            const cnt=data.cajas.filter(c=>c.ciudad===p).length;
            return <div key={p} onClick={()=>setPatioFil(patioFil===p?"":p)} style={{ background:patioFil===p?"#1e3a5f":"#0a1628", border:`1px solid ${patioFil===p?"#3b82f6":"#1e293b"}`, borderRadius:7, padding:"5px 10px", cursor:"pointer", fontSize:11 }}><span style={{color:"#3b82f6",fontWeight:700}}>{cnt}</span><span style={{color:"#475569",marginLeft:5}}>{p}</span></div>;
          })}
        </div>
      )}
      <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
        <input placeholder="🔍 Buscar caja, cliente..." value={q} onChange={e=>setQ(e.target.value)} style={{ flex:1, minWidth:180, background:"#0a1628", border:"1px solid #1e293b", borderRadius:8, padding:"8px 12px", color:"#f1f5f9", fontSize:12, outline:"none" }}/>
        <select value={coord} onChange={e=>setCoord(e.target.value)} style={{ background:"#0a1628", border:"1px solid #1e293b", borderRadius:8, padding:"8px 10px", color:"#f1f5f9", fontSize:12, outline:"none" }}>
          <option value="">Todos</option><option value="TELLO">Tello</option><option value="CRISTIAN">Cristian</option><option value="JULIO">Julio</option>
        </select>
        <button onClick={()=>setShowImport(true)} style={{ background:"#1e3a5f", border:"1px solid #3b82f640", borderRadius:8, padding:"8px 12px", color:"#3b82f6", fontSize:11, cursor:"pointer", fontWeight:700 }}>📥 Importar</button>
        <button onClick={()=>downloadCSV(toCSV(data.cajas,["caja","tipo","coordinador","ciudad","ubicEsp","estatus","cliente","comentarios"]),"cajas.csv")} style={{ background:"#1e3a2f", border:"1px solid #10b98144", borderRadius:8, padding:"8px 12px", color:"#10b981", fontSize:11, cursor:"pointer", fontWeight:700 }}>⬇️ CSV</button>
      </div>
      <div style={{ color:"#475569", fontSize:11 }}>{lista.length} de {data.cajas.length} cajas {patioFil&&`· ${patioFil}`}</div>
      <div style={{ overflowX:"auto" }}>
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
          <thead><tr style={{ borderBottom:"2px solid #1e293b" }}>{["Caja","Tipo","Coord","Ciudad / Ubicación","Específica","Estatus","Cliente","De quién","Comentarios",""].map(h=><th key={h} style={{ textAlign:"left", padding:"8px 10px", color:"#475569", fontSize:10, textTransform:"uppercase", whiteSpace:"nowrap" }}>{h}</th>)}</tr></thead>
          <tbody>{lista.map((c,i)=>(
            <tr key={c.caja+i} style={{ borderBottom:"1px solid #0d1626", background:i%2===0?"#080e1c":"transparent" }}>
              <td style={{ padding:"9px 10px", color:"#f1f5f9", fontWeight:800, fontFamily:"monospace" }}>{c.caja}</td>
              <td style={{ padding:"9px 10px", color:"#64748b" }}>{c.tipo}</td>
              <td style={{ padding:"9px 10px" }}><span style={{ color:coordColor(c.coordinador), fontWeight:700, fontSize:11 }}>{c.coordinador.split(" ")[0]}</span></td>
              <td style={{ padding:"9px 10px", color:"#94a3b8", maxWidth:120, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{c.ciudad}</td>
              <td style={{ padding:"9px 10px", color:"#64748b" }}>{c.ubicEsp}</td>
              <td style={{ padding:"9px 10px" }}><Badge text={c.estatus}/></td>
              <td style={{ padding:"9px 10px", color:"#94a3b8", maxWidth:120, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{c.cliente}</td>
              <td style={{ padding:"9px 10px", color:"#64748b", fontSize:10 }}>{c.deQuienCliente}</td>
              <td style={{ padding:"9px 10px", color:"#334155", fontSize:10, maxWidth:140, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{c.comentarios}</td>
              <td style={{ padding:"9px 10px" }}><button onClick={()=>{setEditando(c.caja);setForm({...c});}} style={{ background:"#1e293b", border:"none", borderRadius:6, padding:"4px 10px", color:"#94a3b8", cursor:"pointer", fontSize:11 }}>✏️</button></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
};

// ─── VIAJES ───────────────────────────────────────────────────────────────────
const Viajes = ({ data, setData }) => {
  const [q,setQ]=useState(""); const [coordFil,setCoordFil]=useState(""); const [showImport,setShowImport]=useState(false);
  const viajes=data.viajes.filter(v=>{
    const t=q.toLowerCase();
    return (!q||(v.unidad+v.cliente+v.coordinador+v.caja+v.circuito).toLowerCase().includes(t))
      &&(!coordFil||v.coordinador.toUpperCase().includes(coordFil));
  });
  const importar=(filas,modo)=>{
    const nuevos=modo==="reemplazar"?filas.map((r,i)=>mapViaje(r,i)):[...data.viajes,...filas.map((r,i)=>mapViaje(r,i))];
    const updated={...data,viajes:nuevos,lastUpdate:new Date().toISOString()};
    setData(updated);saveLocal(updated);
    if(USAR_SHEETS) sheetsPost("VIAJES",nuevos);
  };
  const util=(v)=>v.ventaReal?(v.ventaReal-(v.comisiones||0)-(v.diesel||0)-(v.casetas||0)-(v.costoMtto||0)):null;
  const kml=(v)=>(v.kmCargados>0&&v.litrosDiesel>0)?(v.kmCargados/v.litrosDiesel).toFixed(2):null;
  const realizados=viajes.filter(v=>v.ventaReal);
  const totVenta=realizados.reduce((s,v)=>s+(v.ventaReal||0),0);
  const totCosto=realizados.reduce((s,v)=>s+(v.comisiones||0)+(v.diesel||0)+(v.casetas||0)+(v.costoMtto||0),0);
  const totUtil=totVenta-totCosto;
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
      {showImport&&<Modal title="📥 Importar Viajes" onClose={()=>setShowImport(false)} wide><ImportadorMasivo tipo="viajes" onImportar={importar} onClose={()=>setShowImport(false)}/></Modal>}
      {realizados.length>0&&(
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8 }}>
          {[["💵 Venta",`$${(totVenta/1000).toFixed(1)}K`,"#10b981"],["📉 Costo",`$${(totCosto/1000).toFixed(1)}K`,"#f59e0b"],["📊 Utilidad",`$${(totUtil/1000).toFixed(1)}K`,totUtil>=0?"#10b981":"#ef4444"]].map(([l,v,c])=>(
            <div key={l} style={{ background:"#0a1628", border:`1px solid ${c}30`, borderRadius:10, padding:"12px 14px" }}>
              <div style={{ color:c, fontWeight:900, fontSize:20 }}>{v}</div>
              <div style={{ color:"#475569", fontSize:10 }}>{l}</div>
            </div>
          ))}
        </div>
      )}
      <div style={{ background:"#0a1628", border:"1px solid #1e3a5f", borderRadius:8, padding:"8px 12px", fontSize:11, color:"#3b82f6" }}>
        ℹ️ Los viajes se cargan desde la pestaña <b>VIAJES</b> de tu Sheets. Actualiza ahí tu programación y toca 🔄 Sincronizar.
      </div>
      <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center" }}>
        <input placeholder="🔍 Buscar viaje, unidad, cliente..." value={q} onChange={e=>setQ(e.target.value)} style={{ flex:1, minWidth:160, background:"#0a1628", border:"1px solid #1e293b", borderRadius:8, padding:"8px 12px", color:"#f1f5f9", fontSize:12, outline:"none" }}/>
        <select value={coordFil} onChange={e=>setCoordFil(e.target.value)} style={{ background:"#0a1628", border:"1px solid #1e293b", borderRadius:8, padding:"8px 10px", color:"#f1f5f9", fontSize:12, outline:"none" }}>
          <option value="">Todos</option><option value="TELLO">Tello</option><option value="CRISTIAN">Cristian</option><option value="JULIO">Julio</option>
        </select>
        <button onClick={()=>setShowImport(true)} style={{ background:"#1e3a5f", border:"1px solid #3b82f640", borderRadius:8, padding:"8px 12px", color:"#3b82f6", fontSize:11, cursor:"pointer", fontWeight:700 }}>📥 Importar</button>
        <button onClick={()=>downloadCSV(toCSV(data.viajes,["id","semana","fecha","coordinador","unidad","caja","cliente","origen","destino","estatus","kmCargados","ventaEst","ventaReal","circuito","kml"]),"viajes.csv")} style={{ background:"#1e3a2f", border:"1px solid #10b98144", borderRadius:8, padding:"8px 12px", color:"#10b981", fontSize:11, cursor:"pointer", fontWeight:700 }}>⬇️ CSV</button>
      </div>
      <div style={{ overflowX:"auto" }}>
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
          <thead><tr style={{ borderBottom:"2px solid #1e293b" }}>{["Sem","Coord","Unidad","Caja","Cliente","Origen","Destino","Estatus","Km","Venta Real","Costo","Utilidad","Circuito","KM/L","Entrega"].map(h=><th key={h} style={{ textAlign:"left", padding:"8px 10px", color:"#475569", fontSize:10, textTransform:"uppercase", whiteSpace:"nowrap" }}>{h}</th>)}</tr></thead>
          <tbody>{viajes.map((v,i)=>{
            const u=util(v); const m=v.ventaReal&&v.ventaReal>0?((u/v.ventaReal)*100).toFixed(1):null; const k=kml(v);
            const sem=semaforoEntrega(v.fechaEntregaProg,v.entregado);
            return (
              <tr key={(v.id||i)} style={{ borderBottom:"1px solid #0d1626", background:i%2===0?"#080e1c":"transparent" }}>
                <td style={{ padding:"9px 10px", color:"#64748b" }}>{v.semana}</td>
                <td style={{ padding:"9px 10px" }}><span style={{ color:coordColor(v.coordinador), fontWeight:700, fontSize:11 }}>{v.coordinador?.split(" ")[0]}</span></td>
                <td style={{ padding:"9px 10px", color:"#f1f5f9", fontFamily:"monospace", fontWeight:700 }}>{v.unidad}</td>
                <td style={{ padding:"9px 10px", color:"#94a3b8", fontFamily:"monospace" }}>{v.caja}</td>
                <td style={{ padding:"9px 10px", color:"#94a3b8", maxWidth:110, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{v.cliente}</td>
                <td style={{ padding:"9px 10px", color:"#64748b", fontSize:10 }}>{v.origen}</td>
                <td style={{ padding:"9px 10px", color:"#64748b", fontSize:10 }}>{v.destino}</td>
                <td style={{ padding:"9px 10px" }}><Badge text={v.estatus}/></td>
                <td style={{ padding:"9px 10px", color:"#64748b" }}>{v.kmCargados||"—"}</td>
                <td style={{ padding:"9px 10px", color:v.ventaReal?"#10b981":"#334155", fontWeight:v.ventaReal?700:400 }}>{v.ventaReal?`$${v.ventaReal.toLocaleString()}`:"—"}</td>
                <td style={{ padding:"9px 10px", color:"#f59e0b" }}>{u!=null?`$${((v.comisiones||0)+(v.diesel||0)+(v.casetas||0)+(v.costoMtto||0)).toLocaleString()}`:"—"}</td>
                <td style={{ padding:"9px 10px", color:u!=null?(u>=0?"#10b981":"#ef4444"):"#334155", fontWeight:700 }}>{u!=null?`$${u.toLocaleString()}`:"—"}</td>
                <td style={{ padding:"9px 10px", color:"#64748b", fontSize:10 }}>{v.circuito}</td>
                <td style={{ padding:"9px 10px", color:k?(+k>=3?"#10b981":+k>=2.5?"#f59e0b":"#ef4444"):"#334155", fontWeight:k?700:400 }}>{k||v.kml||"—"}</td>
                <td style={{ padding:"9px 10px", whiteSpace:"nowrap" }}><span style={{ color:sem.color, fontSize:11, fontWeight:700 }}>{sem.icon} {sem.texto}</span></td>
              </tr>
            );
          })}</tbody>
        </table>
      </div>
    </div>
  );
};

// ─── ALERTAS ──────────────────────────────────────────────────────────────────
const Alertas = ({ data }) => {
  const hoy=new Date(); hoy.setHours(0,0,0,0);
  const alertas=[];
  // Desde viajes
  data.viajes.filter(v=>!v.entregado&&v.fechaEntregaProg&&v.fechaEntregaProg!=="").forEach(v=>{
    const prog=new Date(v.fechaEntregaProg); if(isNaN(prog))return; prog.setHours(0,0,0,0);
    const diff=Math.floor((prog-hoy)/86400000);
    if(diff<0) alertas.push({tipo:"Entrega Vencida",unidad:v.unidad,caja:v.caja,op:v.cliente,coord:v.coordinador?.split(" ")[0],desc:`Entrega vencida hace ${Math.abs(diff)} día(s) — ${v.circuito}`,fecha:v.fechaEntregaProg});
    else if(diff===0) alertas.push({tipo:"Entrega Hoy",unidad:v.unidad,caja:v.caja,op:v.cliente,coord:v.coordinador?.split(" ")[0],desc:`Entrega HOY — ${v.destino}`,fecha:v.fechaEntregaProg});
  });
  // Desde cajas
  data.cajas.filter(c=>c.estatus==="Dañada").forEach(c=>{
    alertas.push({tipo:"Caja Dañada",unidad:"-",caja:c.caja,op:"-",coord:c.coordinador?.split(" ")[0],desc:`Dañada en ${c.ciudad}`,fecha:""});
  });
  data.cajas.filter(c=>c.estatus==="No localizada").forEach(c=>{
    alertas.push({tipo:"Caja Perdida",unidad:"-",caja:c.caja,op:"-",coord:c.coordinador?.split(" ")[0],desc:`No localizada — ${c.comentarios}`,fecha:""});
  });
  // Desde tractos
  data.tractos.filter(t=>(t.estatus||"").toLowerCase().includes("sin operador")||(t.motivo||"").includes("SO")).slice(0,5).forEach(t=>{
    alertas.push({tipo:"Sin Operador",unidad:t.unidad,caja:"-",op:"VACANTE",coord:t.coordinador?.split(" ")[0],desc:t.comentarios||"Unidad sin operador asignado",fecha:""});
  });
  data.tractos.filter(t=>(t.estatus||"").includes("SG")||(t.estatus||"").toLowerCase().includes("siniestro")).slice(0,3).forEach(t=>{
    alertas.push({tipo:"Siniestro",unidad:t.unidad,caja:"-",op:t.operador,coord:t.coordinador?.split(" ")[0],desc:t.comentarios||t.motivo,fecha:""});
  });
  data.tractos.filter(t=>["CP","RM","Correctivo","Mantenimiento","Manteimiento"].some(x=>(t.estatus||"").includes(x))).slice(0,5).forEach(t=>{
    alertas.push({tipo:"En Taller",unidad:t.unidad,caja:"-",op:t.operador,coord:t.coordinador?.split(" ")[0],desc:t.motivo||t.comentarios||"En mantenimiento",fecha:""});
  });
  const cols={"Entrega Vencida":"#ef4444","Entrega Hoy":"#f59e0b","Sin Operador":"#64748b","Siniestro":"#ef4444","Caja Dañada":"#f97316","Caja Perdida":"#ef4444","En Taller":"#f59e0b"};
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
      <div style={{ color:"#475569", fontSize:11 }}>{alertas.length} alertas activas (generadas automáticamente desde tus datos)</div>
      {alertas.length===0&&<div style={{ color:"#334155", textAlign:"center", padding:24, fontSize:13 }}>✅ Sin alertas activas. Sincroniza para actualizar.</div>}
      {alertas.map((a,i)=>{
        const col=cols[a.tipo]||"#6366f1";
        return (
          <div key={i} style={{ background:"#0a1628", border:`1px solid ${col}25`, borderLeft:`3px solid ${col}`, borderRadius:8, padding:"12px 14px" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
              <div>
                <div style={{ display:"flex", gap:8, alignItems:"center", marginBottom:4 }}><Badge text={a.tipo}/>{a.fecha&&<span style={{color:"#334155",fontSize:10}}>{a.fecha}</span>}</div>
                <div style={{ color:"#cbd5e1", fontSize:12, fontWeight:600 }}>{a.op}</div>
                <div style={{ color:"#475569", fontSize:11, marginTop:2 }}>
                  {a.unidad!=="-"&&<span>🚛 {a.unidad} </span>}{a.caja!=="-"&&<span>📦 {a.caja} </span>}— {a.desc}
                </div>
              </div>
              <span style={{ color:coordColor(a.coord||""), fontSize:10, fontWeight:700 }}>{a.coord}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ─── APP ROOT ─────────────────────────────────────────────────────────────────
const TABS=[
  {id:"dashboard",label:"Dashboard",icon:"📊"},
  {id:"tracker",label:"Tracker",icon:"🛣️"},
  {id:"distribucion",label:"Distribución",icon:"🗂️"},
  {id:"tractos",label:"Unidades",icon:"🚛"},
  {id:"cajas",label:"Cajas",icon:"📦"},
  {id:"viajes",label:"Viajes",icon:"💰"},
  {id:"alertas",label:"Alertas",icon:"🔔"},
];

function App() {
  const [data,setData]=useState(()=>initData());
  const [tab,setTab]=useState("dashboard");
  const [syncState,setSyncState]=useState("idle");
  const [lastSync,setLastSync]=useState("");

  useEffect(()=>{saveLocal(data);},[data]);
  useEffect(()=>{ if(!USAR_SHEETS) return; syncFromSheets(); },[]);

  const syncFromSheets=async()=>{
    setSyncState("syncing");
    try {
      // Pull all data tabs
      const [viajesRaw,estatusRaw,cajasRaw,rendRaw]=await Promise.all([
        sheetsGet("VIAJES"),
        sheetsGet("Estatus_diario"),
        sheetsGet("Control_Cajas"),
        sheetsGet("RENDIMIENTOS"),
      ]);

      const viajes=(viajesRaw||[]).map((r,i)=>mapViaje(r,i)).filter(v=>v.unidad||v.cliente);
      const estatusList=(estatusRaw||[]).map(mapEstatus).filter(e=>e.unidad);
      const tractos=estatusList.map(estatusToTracto);
      const cajas=(cajasRaw||[]).map(mapCaja).filter(c=>c.caja);
      const rendimientos=(rendRaw||[]).map(mapRendimiento).filter(r=>r.unidad);

      const updated={...data,viajes,tractos,cajas,rendimientos,version:5,lastUpdate:new Date().toISOString()};
      setData(updated);saveLocal(updated);
      setSyncState("ok");
      setLastSync(new Date().toLocaleTimeString("es-MX",{hour:"2-digit",minute:"2-digit"}));
      setTimeout(()=>setSyncState("idle"),4000);
    } catch(e){
      console.error("Sync error:",e);
      setSyncState("error");
      setTimeout(()=>setSyncState("idle"),6000);
    }
  };

  const hoy=new Date(); hoy.setHours(0,0,0,0);
  const alertCount=data.viajes.filter(v=>!v.entregado&&v.fechaEntregaProg&&v.fechaEntregaProg!==""&&new Date(v.fechaEntregaProg)<=hoy).length
    +data.cajas.filter(c=>c.estatus==="Dañada"||c.estatus==="No localizada").length
    +data.tractos.filter(t=>(t.motivo||"").includes("SO")).length;

  return (
    <div style={{ minHeight:"100vh", background:"#060d1a", color:"#e2e8f0", fontFamily:"'DM Sans','Segoe UI',sans-serif" }}>
      <div style={{ background:"#08111f", borderBottom:"1px solid #0f1e33", padding:"12px 18px", display:"flex", alignItems:"center", justifyContent:"space-between", position:"sticky", top:0, zIndex:100 }}>
        <div>
          <div style={{ fontSize:15, fontWeight:900, color:"#f1f5f9", letterSpacing:-.5 }}>🚚 Nacional Autotransporte</div>
          <div style={{ fontSize:9, color:"#334155", letterSpacing:1.5, textTransform:"uppercase" }}>ERP TMS v5 {USAR_SHEETS?"· ☁️ "+lastSync:"· 💾 Local — sin Sheets"}</div>
        </div>
        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
          <div style={{ width:7, height:7, borderRadius:"50%", background:"#10b981", boxShadow:"0 0 8px #10b981" }}/>
          <span style={{ color:"#10b981", fontSize:10, fontWeight:700 }}>OPERATIVO</span>
        </div>
      </div>
      <div style={{ background:"#08111f", borderBottom:"1px solid #0f1e33", display:"flex", overflowX:"auto", padding:"0 14px" }}>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)}
            style={{ background:"none", border:"none", borderBottom:tab===t.id?"2px solid #3b82f6":"2px solid transparent", color:tab===t.id?"#f1f5f9":"#475569", padding:"11px 12px", cursor:"pointer", fontSize:11, fontWeight:tab===t.id?700:400, whiteSpace:"nowrap", display:"flex", gap:4, alignItems:"center", position:"relative" }}>
            {t.icon} {t.label}
            {t.id==="alertas"&&alertCount>0&&<span style={{ background:"#ef4444", color:"#fff", borderRadius:"50%", width:16, height:16, fontSize:9, fontWeight:900, display:"flex", alignItems:"center", justifyContent:"center", marginLeft:2 }}>{alertCount}</span>}
          </button>
        ))}
      </div>
      <div style={{ padding:16, maxWidth:1400, margin:"0 auto" }}>
        <SyncBanner syncState={syncState} onSync={syncFromSheets} lastUpdate={lastSync}/>
        {tab==="dashboard"    && <Dashboard data={data}/>}
        {tab==="tracker"      && <TrackerLineal data={data}/>}
        {tab==="distribucion" && <Distribucion data={data}/>}
        {tab==="tractos"      && <Tractos data={data} setData={setData}/>}
        {tab==="cajas"        && <Cajas data={data} setData={setData}/>}
        {tab==="viajes"       && <Viajes data={data} setData={setData}/>}
        {tab==="alertas"      && <Alertas data={data}/>}
      </div>
      <div style={{ padding:"12px 18px", borderTop:"1px solid #0f1e33", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <span style={{ color:"#1e3a5f", fontSize:10 }}>{data.tractos.length} Unidades · {data.cajas.length} Cajas · {data.viajes.length} Viajes · v5</span>
        <button onClick={()=>{if(window.confirm("¿Resetear datos locales?")){ localStorage.removeItem(STORAGE_KEY); window.location.reload();}}} style={{ background:"none", border:"1px solid #1e293b", borderRadius:6, padding:"4px 10px", color:"#334155", fontSize:10, cursor:"pointer" }}>🔄 Reset</button>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(React.createElement(App));
