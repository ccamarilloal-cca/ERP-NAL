// ═══════════════════════════════════════════════════════════════════════
//  GOOGLE APPS SCRIPT v9 — ERP NAL
//
//  CORRECCIONES v9 vs v8:
//  1.  Venta: desde Estatus_diario (Monto + Motivo VTA/TRN) para los 3 coordinadores
//  2.  Semana = número de semana ISO (no lunes-domingo del calendario)
//      → Al cambiar sem15→16, solo muestra registros semana en curso
//  3.  Ranking: solo las 78 unidades activas (filtro por activeUnits)
//  4.  Cajas por patio: agrupación correcta + totales por estatus dentro de cada patio
//  5.  Mantenimiento: SOLO CP, RM, SG — LIB y todo lo demás excluido
//  6.  Circuitos: resolución por unidad desde hoja Circuitos + fallback viajes
//  7.  Alertas: fecha real del evento (fecha de cita o latestDate según tipo)
//  8.  Semana anterior: calcular para comparativos en indicadores
//  9.  OTIF semana en curso corregido
//  10. Cajas: detalle por patio con breakdown de estatus correcto
//
//  INSTALACIÓN:
//  1. Google Sheets → Extensiones → Apps Script
//  2. Borra TODO → Pega este código → Guardar
//  3. Implementar → Nueva implementación
//  4. Tipo: App web | Ejecutar: Yo | Acceso: Cualquier persona
//  5. Implementar → Autorizar → COPIAR URL /exec
//  6. Pegar URL en index.html: window.SHEETS_URL = "TU_URL"
// ═══════════════════════════════════════════════════════════════════════

var TABS = {
  estatus:      "Estatus_diario",
  cajas:        "Control_Cajas",
  viajes:       "VIAJES",
  rendimientos: "RENDIMIENTOS",
  diesel:       "CARGAS_DIESEL",
  circuitos:    "Circuitos",
  ventas:       "Ventas",
  clientes:     "CLIENTES",
  catalogo:     "CATALOGO_UNIDADES",
  ranking:      "Ranking de Operadores",
};

var META = {
  TELLO:    500000,
  CRISTIAN: 450000,
  JULIO:    350000,
  TOTAL:   1300000,
};

// ── HELPERS DE FECHA ──────────────────────────────────────────────────
function today() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
}

// Número de semana ISO (lunes=inicio)
function isoWeek(dateStr) {
  var d = new Date(dateStr + "T12:00:00");
  var jan4 = new Date(d.getFullYear(), 0, 4);
  var startOfWeek1 = new Date(jan4);
  startOfWeek1.setDate(jan4.getDate() - (jan4.getDay() || 7) + 1);
  var diff = d - startOfWeek1;
  return Math.floor(diff / (7 * 86400000)) + 1;
}

// Lunes de la semana ISO de una fecha
function mondayOfIsoWeek(dateStr) {
  var d = new Date(dateStr + "T12:00:00");
  var day = d.getDay() || 7; // 1=lun,7=dom
  var mon = new Date(d);
  mon.setDate(d.getDate() - day + 1);
  return Utilities.formatDate(mon, Session.getScriptTimeZone(), "yyyy-MM-dd");
}

// Domingo de la semana ISO de una fecha
function sundayOfIsoWeek(dateStr) {
  var mon = mondayOfIsoWeek(dateStr);
  var d = new Date(mon + "T12:00:00");
  d.setDate(d.getDate() + 6);
  return Utilities.formatDate(d, Session.getScriptTimeZone(), "yyyy-MM-dd");
}

// Rango de días de la semana en curso (lun→hoy)
function weekDatesRange() {
  var t = today();
  var mon = mondayOfIsoWeek(t);
  var dates = [];
  var d = new Date(mon + "T12:00:00");
  var todayD = new Date(t + "T12:00:00");
  while (d <= todayD) {
    dates.push(Utilities.formatDate(d, Session.getScriptTimeZone(), "yyyy-MM-dd"));
    d.setDate(d.getDate() + 1);
  }
  return { dates: dates, mon: mon, sun: sundayOfIsoWeek(t), weekNum: isoWeek(t), todayStr: t };
}

// Rango semana anterior completa
function prevWeekDatesRange() {
  var t = today();
  var mon = mondayOfIsoWeek(t);
  // Domingo de semana anterior = lunes actual - 1
  var prevSun = new Date(mon + "T12:00:00");
  prevSun.setDate(prevSun.getDate() - 1);
  var prevSunStr = Utilities.formatDate(prevSun, Session.getScriptTimeZone(), "yyyy-MM-dd");
  var prevMon = mondayOfIsoWeek(prevSunStr);
  var dates = [];
  var d = new Date(prevMon + "T12:00:00");
  var end = prevSun;
  while (d <= end) {
    dates.push(Utilities.formatDate(d, Session.getScriptTimeZone(), "yyyy-MM-dd"));
    d.setDate(d.getDate() + 1);
  }
  return { dates: dates, mon: prevMon, sun: prevSunStr, weekNum: isoWeek(prevSunStr) };
}

// ── LEE PESTAÑA → array de objetos ────────────────────────────────────
function readTab(name, headerRow) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ws = ss.getSheetByName(name);
  if (!ws) return [];
  var lr = ws.getLastRow(), lc = ws.getLastColumn();
  if (lr <= headerRow || lc === 0) return [];
  var hdr = ws.getRange(headerRow, 1, 1, lc).getValues()[0];
  var data = ws.getRange(headerRow + 1, 1, lr - headerRow, lc).getValues();
  var tz = Session.getScriptTimeZone();
  return data
    .filter(function(r){ return r.some(function(c){ return c !== "" && c !== null; }); })
    .map(function(r){
      var obj = {};
      hdr.forEach(function(h, i){
        var k = String(h || "col_" + i).trim();
        var v = r[i];
        if (v === null || v === undefined) v = "";
        if (v instanceof Date) v = Utilities.formatDate(v, tz, "yyyy-MM-dd");
        else v = String(v).trim();
        obj[k] = v;
      });
      return obj;
    });
}

// ── ÚLTIMA FECHA EN ESTATUS ────────────────────────────────────────────
function getLatestDate(rows, campoFecha) {
  var f = campoFecha || "Fecha";
  var latest = "";
  rows.forEach(function(r){ var d = String(r[f]||"").slice(0,10); if(d > latest) latest = d; });
  return latest;
}

// ── UNIDADES ACTIVAS (última fecha en Estatus_diario) ─────────────────
function getActiveUnits(estatusRows) {
  var latestDate = getLatestDate(estatusRows, "Fecha");
  var units = {};
  estatusRows.forEach(function(r){
    if (String(r["Fecha"]||"").slice(0,10) === latestDate) units[String(r["Unidad"]||"").trim()] = true;
  });
  return { units: units, latestDate: latestDate };
}

// ── MAPA DE CIRCUITOS (unidad → circuito, con fallback cliente) ────────
function buildCircuitMap(circuitosRows, ventasRows, viajesRows) {
  var byUnidad = {}, byCliente = {};
  var mapRow = function(r) {
    var u  = String(r["Tracto"]||r["Unidad"]||r["No. Economico"]||r["Economico"]||"").trim().toUpperCase();
    var cl = String(r["Cliente"]||"").trim().toUpperCase();
    var ci = String(r["Circuito"]||r["Nombre Circuito"]||r["NombreCircuito"]||"").trim();
    if (u  && ci && !byUnidad[u])  byUnidad[u]  = ci;
    if (cl && ci && !byCliente[cl]) byCliente[cl] = ci;
  };
  circuitosRows.forEach(mapRow);
  if (ventasRows)  ventasRows.forEach(mapRow);
  // Viajes: origen/destino ayuda a inferir circuito por ruta
  if (viajesRows) {
    viajesRows.forEach(function(r){
      var u  = String(r["Unidad"]||"").trim().toUpperCase();
      var cl = String(r["Cliente"]||"").trim().toUpperCase();
      var ci = String(r["Circuito"]||r["NombreRuta"]||"").trim();
      if (u  && ci && !byUnidad[u])  byUnidad[u]  = ci;
      if (cl && ci && !byCliente[cl]) byCliente[cl] = ci;
    });
  }
  return { byUnidad: byUnidad, byCliente: byCliente };
}

function resolveCircuito(row, cm) {
  if (row["Circuito"] && row["Circuito"] !== "") return row["Circuito"];
  var u = String(row["Unidad"]||"").trim().toUpperCase();
  if (cm.byUnidad[u]) return cm.byUnidad[u];
  var cl = String(row["Cliente"]||"").trim().toUpperCase();
  if (cl && cm.byCliente[cl]) return cm.byCliente[cl];
  return "Sin circuito";
}

// ── PARSE MONTO ──────────────────────────────────────────────────────
function parseMonto(v) {
  return parseFloat(String(v||"0").replace(/[$,\s]/g,"")) || 0;
}

// ── DETECTAR COLUMNA DE VENTA EN ESTATUS_DIARIO ───────────────────────
// Venta = Monto cuando Motivo es VTA o TRN
function calcVentaDesdeEstatus(estatusRows, wd, prevWd) {
  // wd.dates = días semana en curso (lunes a hoy)
  var todayStr = wd.todayStr;
  var latestDate = getLatestDate(estatusRows, "Fecha");

  var hoy      = { TELLO:0, CRISTIAN:0, JULIO:0, TOTAL:0 };
  var semana   = { TELLO:0, CRISTIAN:0, JULIO:0, TOTAL:0 };
  var semAnt   = { TELLO:0, CRISTIAN:0, JULIO:0, TOTAL:0 };
  var porDia   = {};
  wd.dates.forEach(function(d){
    porDia[d] = { fecha:d, dia:["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"][new Date(d+"T12:00:00").getDay()], TELLO:0, CRISTIAN:0, JULIO:0, TOTAL:0 };
  });

  var MOTIVOS_VENTA = ["VTA","TRN","MOV"];

  estatusRows.forEach(function(r){
    var fecha   = String(r["Fecha"]||"").slice(0,10);
    var motivo  = String(r["Motivo"]||r["Estatus"]||"").toUpperCase();
    var esVenta = MOTIVOS_VENTA.some(function(m){ return motivo.startsWith(m); });
    if (!esVenta) return;
    var monto   = parseMonto(r["Monto"]);
    if (monto <= 0) return;
    var coord   = String(r["Coordinador"]||"").toUpperCase();
    var ck2     = coord.includes("TELLO") ? "TELLO"
                : (coord.includes("CRISTIAN")||coord.includes("ZUÑIGA")||coord.includes("ZUNIGA")) ? "CRISTIAN"
                : (coord.includes("JULIO")||coord.includes("HERNANDEZ")) ? "JULIO" : null;
    if (!ck2) return;

    // Hoy = última fecha operativa
    if (fecha === latestDate) { hoy[ck2]+=monto; hoy.TOTAL+=monto; }

    // Semana en curso
    if (wd.dates.indexOf(fecha) !== -1) {
      semana[ck2]+=monto; semana.TOTAL+=monto;
      if (porDia[fecha]) { porDia[fecha][ck2]+=monto; porDia[fecha].TOTAL+=monto; }
    }
    // Semana anterior
    if (prevWd.dates.indexOf(fecha) !== -1) { semAnt[ck2]+=monto; semAnt.TOTAL+=monto; }
  });

  return {
    hoy: hoy, semana: semana, semAnt: semAnt,
    diasSemana: wd.dates.map(function(d){ return porDia[d]; }),
    latestDate: latestDate,
    weekNum: wd.weekNum,
    prevWeekNum: prevWd.weekNum,
    meta: META,
    cumpl: {
      TELLO:    META.TELLO>0    ? Math.round(semana.TELLO/META.TELLO*100)       : 0,
      CRISTIAN: META.CRISTIAN>0 ? Math.round(semana.CRISTIAN/META.CRISTIAN*100) : 0,
      JULIO:    META.JULIO>0    ? Math.round(semana.JULIO/META.JULIO*100)       : 0,
      TOTAL:    META.TOTAL>0    ? Math.round(semana.TOTAL/META.TOTAL*100)       : 0,
    }
  };
}

// ── CALCULAR FLOTA (78 unidades última fecha) ─────────────────────────
function calcFlota(estatusRows, cm) {
  var latestDate = getLatestDate(estatusRows, "Fecha");
  var hoyRows = estatusRows.filter(function(r){ return String(r["Fecha"]||"").slice(0,10)===latestDate; });

  var grupos = { VTA:[],TRN:[],MOV:[],LIB:[],DCO:[],DSO:[],CP:[],RM:[],SG:[],SO:[],IND:[],PER:[],OTROS:[] };

  hoyRows.forEach(function(r){
    var m  = String(r["Motivo"]||r["Estatus"]||"").toUpperCase().trim();
    var ci = resolveCircuito(r, cm);
    var obj = {
      unidad:      String(r["Unidad"]||"").trim(),
      operador:    r["Operador"]||"—",
      coordinador: r["Coordinador"]||"",
      motivo:      r["Motivo"]||r["Estatus"]||"",
      ruta:        r["NombreRuta"]||r["Ruta"]||r["Circuito"]||"",
      circuito:    ci,
      ubicacion:   r["Ubicacion"]||r["Ciudad"]||r["Origen"]||"",
      cliente:     r["Cliente"]||"",
      monto:       parseMonto(r["Monto"]),
      comentarios: r["Comentarios"]||"",
      fecha:       latestDate
    };
    var key = m.startsWith("VTA")?"VTA":m.startsWith("TRN")?"TRN":m.startsWith("MOV")?"MOV"
            :m.startsWith("LIB")?"LIB":m.startsWith("DCO")?"DCO":m.startsWith("DSO")?"DSO"
            :m.startsWith("CP")?"CP":m.startsWith("RM")?"RM":m.startsWith("SG")?"SG"
            :m.startsWith("SO")?"SO":m.startsWith("IND")?"IND":m.startsWith("PER")?"PER":"OTROS";
    grupos[key].push(obj);
  });

  var enOp = grupos.VTA.length+grupos.TRN.length+grupos.MOV.length+grupos.LIB.length;
  var total = hoyRows.length;

  return {
    fecha: latestDate, total: total, enOperacion: enOp,
    pctUtilizacion: total>0?(enOp/total*100).toFixed(1):"0",
    grupos: grupos,
    vacantes: {
      total: grupos.SO.length+grupos.IND.length+grupos.PER.length,
      SO: grupos.SO.length, IND: grupos.IND.length, PER: grupos.PER.length,
      detalle: grupos.SO.concat(grupos.IND||[]).concat(grupos.PER||[])
    },
    enCP: { total:grupos.CP.length+grupos.RM.length+grupos.SG.length, CP:grupos.CP.length, RM:grupos.RM.length, SG:grupos.SG.length },
    resumen: {
      VTA:grupos.VTA.length,TRN:grupos.TRN.length,MOV:grupos.MOV.length,LIB:grupos.LIB.length,
      DCO:grupos.DCO.length,DSO:grupos.DSO.length,CP:grupos.CP.length,RM:grupos.RM.length,
      SG:grupos.SG.length,SO:grupos.SO.length,IND:grupos.IND.length,PER:grupos.PER.length,OTROS:grupos.OTROS.length
    }
  };
}

// ── CALCULAR DIESEL (solo 78 unidades activas, semana en curso) ────────
function calcDiesel(dieselRows, activeUnits, wd) {
  var total=0,litros=0,count=0, porUnidad={};
  dieselRows.forEach(function(r){
    var fecha  = String(r["Fecha Registro"]||r["Fecha"]||"").slice(0,10);
    var unidad = String(r["Numero Economico"]||r["Unidad"]||"").trim();
    if (!activeUnits[unidad]) return;
    if (wd.dates.indexOf(fecha)===-1) return;
    var costo = parseMonto(r["Costo Total ($)"]||r["Costo"]);
    var lts   = parseFloat(r["Litros"]||"0")||0;
    var kml   = parseFloat(r["Rendimiento Km/Lt"]||r["Rendimiento"]||"0")||0;
    if (costo<=0) return;
    total+=costo; litros+=lts; count++;
    if (!porUnidad[unidad]) porUnidad[unidad]={costo:0,litros:0,kml:0,operador:r["Operador"]||""};
    porUnidad[unidad].costo+=costo; porUnidad[unidad].litros+=lts;
    if (kml>0) porUnidad[unidad].kml=kml;
  });
  return { total:total, litros:litros, registros:count, porUnidad:porUnidad };
}

// ── CALCULAR KML ───────────────────────────────────────────────────────
function calcKML(rendRows, activeUnits) {
  var por={};
  rendRows.forEach(function(r){
    var u=String(r["Numero Economico"]||r["Unidad"]||"").trim();
    if(!activeUnits[u]) return;
    var k=parseFloat(r["Rendimiento Calculado"]||r["RendimientoKmLt"]||r["Rendimiento Km/Lt"]||"0")||0;
    if(k<=0) return;
    if(!por[u]) por[u]={vals:[],op:r["Operador"]||""};
    por[u].vals.push(k);
  });
  var res={};
  Object.keys(por).forEach(function(u){
  var v = por[u].vals;
  res[u] = (v.reduce(function(a,b){return a+b;},0) / v.length).toFixed(2);
});
  return res;
}

// ── OTIF (semana en curso + total histórico) ───────────────────────────
function calcOTIF(viajesRows, wd) {
  var ENTREGADOS = ["finalizado","entregado","terminado"];
  var tot=0,onT=0,late=0,sinF=0, det=[];
  var totSem=0,onTSem=0;

  viajesRows.forEach(function(r){
    var est = String(r["Estatus viaje"]||"").toLowerCase();
    var ent = ENTREGADOS.some(function(e){ return est.includes(e); });
    if (!ent) return;
    tot++;
    var fCarga = String(r["Fecha de carga"]||r["Fecha"]||"").slice(0,10);
    var esSem  = wd.dates.indexOf(fCarga)!==-1;
    if (esSem) totSem++;
    var cita = String(r["Cita descarga"]||"").trim();
    var obs  = String(r["Observaciones"]||"");
    if (!cita||cita==="nan"||cita==="-"||cita==="") { sinF++; return; }
    var cumple = !obs.toLowerCase().match(/retraso|tarde|demora/);
    if (cumple){ onT++; if(esSem) onTSem++; } else late++;
    if (det.length<60) det.push({
      unidad:r["Unidad"]||"",caja:r["Caja"]||"",cliente:r["Cliente"]||"",
      coordinador:r["Coordinador"]||"",circuito:r["Circuito"]||"",
      citaDescarga:cita,fechaDescarga:String(r["Fecha descarga"]||""),
      otif:cumple?"✅ A tiempo":"🔴 Tardío",motivo:obs.slice(0,80),
      fechaCarga:fCarga
    });
  });
  return {
    total:tot, onTime:onT, late:late, sinFecha:sinF,
    pct:tot>0?(onT/tot*100).toFixed(1):"0",
    totalSem:totSem, onTimeSem:onTSem,
    pctSem:totSem>0?(onTSem/totSem*100).toFixed(1):"0",
    detalle:det
  };
}

// ── ENTREGAS VENCIDAS ─────────────────────────────────────────────────
function calcEntregas(viajesRows, cm) {
  var todayStr = today();
  var ENTREGADOS = ["finalizado","entregado","terminado"];
  var vencidas=[],aTiempo=[],pendientes=[];
  viajesRows.forEach(function(r){
    var est   = String(r["Estatus viaje"]||"").toLowerCase();
    var ent   = ENTREGADOS.some(function(e){ return est.includes(e); });
    var cita  = String(r["Cita descarga"]||r["Fecha descarga"]||"").trim();
    var u     = r["Unidad"]||"";
    var ci    = resolveCircuito(r, cm);
    var coord = r["Coordinador"]||"";
    var cli   = r["Cliente"]||"";
    if (!ent && cita && cita!=="-" && cita!=="" && cita!=="nan") {
      var fObj = new Date(cita);
      var venc = !isNaN(fObj) && fObj < new Date(todayStr);
      if (venc) vencidas.push({unidad:u,caja:r["Caja"]||"",cliente:cli,coordinador:coord,circuito:ci,cita:cita,estatus:r["Estatus viaje"]||"",comentarios:String(r["Observaciones"]||"").slice(0,60)});
      else pendientes.push({unidad:u,caja:r["Caja"]||"",cliente:cli,coordinador:coord,circuito:ci,cita:cita});
    }
    if (ent) aTiempo.push({unidad:u,cliente:cli,coordinador:coord,circuito:ci});
  });
  var total=vencidas.length+aTiempo.length;
  return {
    vencidas:vencidas, aTiempo:aTiempo, pendientes:pendientes,
    totalVencidas:vencidas.length, totalATiempo:aTiempo.length, totalViajes:total,
    pctCumplimiento:total>0?(aTiempo.length/total*100).toFixed(1):"0"
  };
}

// ── CAJAS — resumen + detalle por patio (corrección totales) ──────────
function calcCajas(cajasRows) {
  var res = {Cargada:0,Disponible:0,Dañada:0,Transito:0,Siniestro:0,NoLocalizada:0,Vacia:0,Venta:0,Otros:0};
  var patio = {}; // patio → {total, por estatus, lista cajas}
  var ESTADOS = ["Cargada","Disponible","Dañada","En tránsito","Siniestro","No localizada","Vacia","En patio","En cliente","Venta"];

  cajasRows.forEach(function(c){
    var s  = String(c["Estatus"]||"");
    var p  = String(c["Ciudad / Ubicación"]||"Sin patio").trim();
    // Resumen global
    if(s==="Cargada")           res.Cargada++;
    else if(s==="Disponible")   res.Disponible++;
    else if(s==="Dañada")       res.Dañada++;
    else if(s.includes("ránsito")) res.Transito++;
    else if(s==="Siniestro")    res.Siniestro++;
    else if(s==="No localizada") res.NoLocalizada++;
    else if(s==="Vacia"||s==="En patio"||s==="En cliente") res.Vacia++;
    else if(s==="Venta")        res.Venta++;
    else                        res.Otros++;

    // Por patio — agrupación CORRECTA
    if (!patio[p]) patio[p] = {
      patio:p, total:0,
      Cargada:0,Disponible:0,Dañada:0,Transito:0,Siniestro:0,NoLocalizada:0,Vacia:0,Venta:0,Otros:0,
      cajas:[]
    };
    patio[p].total++;
    if(s==="Cargada")           patio[p].Cargada++;
    else if(s==="Disponible")   patio[p].Disponible++;
    else if(s==="Dañada")       patio[p].Dañada++;
    else if(s.includes("ránsito")) patio[p].Transito++;
    else if(s==="Siniestro")    patio[p].Siniestro++;
    else if(s==="No localizada") patio[p].NoLocalizada++;
    else if(s==="Vacia"||s==="En patio"||s==="En cliente") patio[p].Vacia++;
    else if(s==="Venta")        patio[p].Venta++;
    else                        patio[p].Otros++;
    patio[p].cajas.push({caja:c["Caja"]||"",estatus:s,cliente:c["Cliente"]||"",coordinador:c["Coordinador"]||"",comentarios:c["Comentarios"]||""});
  });

  var total = cajasRows.length;
  return {
    total:total, resumen:res,
    pctCargadas:total>0?(res.Cargada/total*100).toFixed(1):"0",
    porPatio: Object.values(patio).sort(function(a,b){return b.total-a.total;})
  };
}

// ── RANKING (solo 78 unidades activas) ────────────────────────────────
function calcRanking(rankingRows, dieselRows, viajesRows, rendRows, activeUnits) {
  var opMap = {};

  // Diesel: solo unidades activas — construir por unidad
  // Para cada unidad activa buscar su operador más reciente
  var unidadOpMap = {};
  dieselRows.forEach(function(r){
    var u  = String(r["Numero Economico"]||r["Unidad"]||"").trim();
    if (!activeUnits[u]) return;
    var op    = String(r["Operador"]||"").trim();
    var fecha = String(r["Fecha Registro"]||r["Fecha"]||"").slice(0,10);
    var litros= parseFloat(r["Litros"]||"0")||0;
    var kml   = parseFloat(r["Rendimiento Km/Lt"]||r["Rendimiento"]||"0")||0;
    var costo = parseMonto(r["Costo Total ($)"]||r["Costo"]);
    if (!op) return;

    // Actualizar operador por unidad con la fecha más reciente
    if (!unidadOpMap[u] || fecha>unidadOpMap[u].fecha) unidadOpMap[u]={op:op,fecha:fecha};

    if (!opMap[op]) opMap[op]={operador:op,unidad:u,totalLitros:0,totalCosto:0,kmlVals:[],lastFecha:"",lastKml:0,viajes:0,kmTotal:0,ventaTotal:0,lastViajeDate:"",rendViajeVals:[]};
    opMap[op].totalLitros+=litros;
    opMap[op].totalCosto+=costo;
    if (kml>0){
      opMap[op].kmlVals.push(kml);
      if (fecha>=opMap[op].lastFecha){opMap[op].lastFecha=fecha;opMap[op].lastKml=kml;opMap[op].unidad=u;}
    }
  });

  // Rendimientos: solo unidades activas
  rendRows.forEach(function(r){
    var u   = String(r["Numero Economico"]||r["Unidad"]||"").trim();
    if (!activeUnits[u]) return;
    var op  = String(r["Operador"]||"").trim();
    var kml = parseFloat(r["Rendimiento Calculado"]||r["RendimientoKmLt"]||r["Rendimiento Km/Lt"]||"0")||0;
    if (!op||kml<=0) return;
    if (!opMap[op]) opMap[op]={operador:op,unidad:u,totalLitros:0,totalCosto:0,kmlVals:[],lastFecha:"",lastKml:0,viajes:0,kmTotal:0,ventaTotal:0,lastViajeDate:"",rendViajeVals:[]};
    opMap[op].kmlVals.push(kml);
  });

  // Viajes: solo unidades activas
  viajesRows.forEach(function(r){
    var u   = String(r["Unidad"]||"").trim();
    if (!activeUnits[u]) return;
    var op  = String(r["Operador"]||"").trim();
    var est = String(r["Estatus viaje"]||"").toLowerCase();
    var fin = ["finalizado","entregado","terminado"].some(function(s){return est.includes(s);});
    if (!fin) return;
    var km    = parseFloat(r["Km cargados"]||r["Km"]||"0")||0;
    var venta = parseMonto(r["Venta real"]||r["Monto"]||r["Venta"]);
    var fecha = String(r["Fecha de carga"]||r["Fecha"]||"").slice(0,10);
    var fDesc = String(r["Fecha descarga"]||r["Fecha entrega"]||fecha).slice(0,10);
    if (!op) op = (unidadOpMap[u]&&unidadOpMap[u].op)||"";
    if (!op) return;
    if (!opMap[op]) opMap[op]={operador:op,unidad:u,totalLitros:0,totalCosto:0,kmlVals:[],lastFecha:"",lastKml:0,viajes:0,kmTotal:0,ventaTotal:0,lastViajeDate:"",rendViajeVals:[]};
    opMap[op].viajes++;
    opMap[op].kmTotal+=km;
    opMap[op].ventaTotal+=venta;
    if (fDesc>opMap[op].lastViajeDate) opMap[op].lastViajeDate=fDesc;
    // Rendimiento por viaje estimado
    if (km>0&&opMap[op].totalLitros>0){
      var lPV=opMap[op].viajes>0?opMap[op].totalLitros/opMap[op].viajes:0;
      if(lPV>0) opMap[op].rendViajeVals.push(parseFloat((km/lPV).toFixed(2)));
    }
  });

  var rankMap={};
  rankingRows.forEach(function(r){var op=String(r["Operador"]||r["Nombre"]||"").trim();if(op)rankMap[op]=r;});

  var resultado=Object.keys(opMap).map(function(op){
    var d=opMap[op];
    var kmlProm=d.kmlVals.length>0?(d.kmlVals.reduce(function(a,b){return a+b;},0)/d.kmlVals.length).toFixed(2):"—";
    var rendVj=d.rendViajeVals.length>0?(d.rendViajeVals.reduce(function(a,b){return a+b;},0)/d.rendViajeVals.length).toFixed(2):"—";
    var rk=rankMap[op]||{};
    return {
      operador:op,unidad:d.unidad||rk["Unidad"]||"—",
      totalLitros:d.totalLitros.toFixed(0),totalCosto:d.totalCosto.toFixed(0),
      rendimientoKmLt:kmlProm,rendimientoViaje:rendVj,
      viajesCompletados:d.viajes,kmTotal:d.kmTotal.toFixed(0),ventaTotal:d.ventaTotal.toFixed(0),
      ultimaFechaCarga:d.lastFecha||rk["Ultima Fecha"]||"—",
      ultimoRendimiento:d.lastKml>0?d.lastKml.toFixed(2):(rk["Ultimo Rendimiento"]||"—"),
      ultimoViaje:d.lastViajeDate||"—",
      clasificacion:rk["Clasificacion"]||rk["Categoria"]||"—",
    };
  });
  resultado.sort(function(a,b){return (parseFloat(b.rendimientoKmLt)||0)-(parseFloat(a.rendimientoKmLt)||0);});
  return resultado;
}

// ── COORDINADORES ─────────────────────────────────────────────────────
function calcCoordinadores(flota, cajasRows, viajesRows, clientesRows, circuitosRows, venta, cm, wd) {
  var coords = {
    TELLO:    {nombre:"Juan José Tello",   key:"TELLO",    color:"#3b82f6"},
    CRISTIAN: {nombre:"Cristian Zuñiga",   key:"CRISTIAN", color:"#10b981"},
    JULIO:    {nombre:"Julio Hernandez",   key:"JULIO",    color:"#f59e0b"},
  };

  Object.keys(coords).forEach(function(ck){
    var c=coords[ck];
    var allU=Object.values(flota.grupos).reduce(function(a,b){return a.concat(b);},[]);
    var propias=allU.filter(function(u){return String(u.coordinador||"").toUpperCase().includes(ck);});
    c.totalUnidades=propias.length;

    var mkDet=function(u){return {unidad:u.unidad,operador:u.operador||"—",ubicacion:u.ubicacion||u.ruta||"—",cliente:u.cliente||"—",circuito:u.circuito||"Sin circuito",motivo:u.motivo,comentarios:u.comentarios||"—"};};

    var activasU=propias.filter(function(u){var m=String(u.motivo||"").toUpperCase();return m.startsWith("VTA")||m.startsWith("TRN")||m.startsWith("MOV")||m.startsWith("LIB");});
    c.activas=activasU.length;
    c.activasDetalle=activasU.map(mkDet);

    var dcoU=(flota.grupos.DCO||[]).filter(function(u){return String(u.coordinador||"").toUpperCase().includes(ck);});
    var dsoU=(flota.grupos.DSO||[]).filter(function(u){return String(u.coordinador||"").toUpperCase().includes(ck);});
    c.dco=dcoU.length; c.dso=dsoU.length;
    c.dcoDetalle=dcoU.concat(dsoU).map(mkDet);

    c.lib=(flota.grupos.LIB||[]).filter(function(u){return String(u.coordinador||"").toUpperCase().includes(ck);}).length;
    c.so=(flota.grupos.SO||[]).filter(function(u){return String(u.coordinador||"").toUpperCase().includes(ck);}).length;
    c.ind=(flota.grupos.IND||[]).filter(function(u){return String(u.coordinador||"").toUpperCase().includes(ck);}).length;
    c.per=(flota.grupos.PER||[]).filter(function(u){return String(u.coordinador||"").toUpperCase().includes(ck);}).length;
    c.vacantes=c.so+c.ind+c.per;

    var cpU=(flota.grupos.CP||[]).concat(flota.grupos.RM||[]).concat(flota.grupos.SG||[]).filter(function(u){return String(u.coordinador||"").toUpperCase().includes(ck);});
    c.mtto=cpU.length; c.mttoDetalle=cpU.map(mkDet);

    c.unidadesVacantes=(flota.grupos.SO||[]).concat(flota.grupos.IND||[]).concat(flota.grupos.PER||[])
      .filter(function(u){return String(u.coordinador||"").toUpperCase().includes(ck);})
      .map(function(u){return {unidad:u.unidad,motivo:u.motivo,comentarios:u.comentarios||"—"};});

    // Cajas
    var cjK=ck==="CRISTIAN"?"CRISTIAN":ck==="TELLO"?"TELLO":"JULIO";
    var cajasC=cajasRows.filter(function(cj){return String(cj["Coordinador"]||"").toUpperCase().includes(cjK);});
    c.totalCajas=cajasC.length;
    c.cajasCargadas=cajasC.filter(function(cj){return cj["Estatus"]==="Cargada";}).length;
    c.cajasDisponibles=cajasC.filter(function(cj){return cj["Estatus"]==="Disponible";}).length;
    c.cajasDañadas=cajasC.filter(function(cj){return cj["Estatus"]==="Dañada";}).length;
    c.cajasNoLocaliz=cajasC.filter(function(cj){return cj["Estatus"]==="No localizada";}).length;
    c.cajasVacia=cajasC.filter(function(cj){var s=String(cj["Estatus"]||"");return s==="Vacia"||s==="En patio"||s==="En cliente";}).length;
    c.cajasConCliente=cajasC.filter(function(cj){return cj["Estatus"]==="Cargada";}).map(function(cj){return {caja:cj["Caja"]||"",cliente:cj["Cliente"]||"",ciudad:cj["Ciudad / Ubicación"]||"",comentarios:cj["Comentarios"]||""};});
    // Detalle completo cajas para click
    c.cajasDetalle=cajasC.map(function(cj){return {caja:cj["Caja"]||"",estatus:cj["Estatus"]||"",cliente:cj["Cliente"]||"",ciudad:cj["Ciudad / Ubicación"]||"",comentarios:cj["Comentarios"]||""};});

    // Venta desde Estatus_diario (ya calculada)
    c.ventaHoy=venta.hoy[ck]||0;
    c.ventaSemana=venta.semana[ck]||0;
    c.metaSemana=META[ck]||0;
    c.cumplMeta=c.metaSemana>0?Math.round(c.ventaSemana/c.metaSemana*100):0;

    // Circuitos dinámicos
    var cirsC = circuitosRows.filter(function(r){
  return String(r["Coordinador"]||"").toUpperCase().includes(cjK);
});
    c.circuitos = Array.from(new Set(
  cirsC.map(function(r){return r["Circuito"]||"";}).filter(Boolean)
));
    var cirsActivas=activasU.map(function(u){return u.circuito;}).filter(function(ci){return ci&&ci!=="Sin circuito";});
    c.circuitos = Array.from(new Set(
  c.circuitos.concat(cirsActivas)
)).slice(0,10);

    // Clientes
    var clsC=clientesRows.filter(function(r){return String(r["Coordinador"]||"").toUpperCase().includes(cjK);});
    c.clientes=clsC.map(function(r){return {nombre:r["Nombre del Cliente"]||"",ciudad:r["Ciudad"]||"",tipo:r["Tipo de Operación"]||"",frecuencia:r["Frecuencia"]||""};}).slice(0,10);

    c.eficiencia=c.totalUnidades>0?(c.activas/c.totalUnidades*100).toFixed(0):"0";
  });
  return coords;
}

// ── ALERTAS DE MTTO CON TIEMPO EXCEDIDO ──────────────────────────────
// Estima días en MTTO según comentario y fecha de registro
function calcAlertasMtto(grupos, latestDate) {
  var LIMITES = { CP:7, RM:15, SG:30 }; // días máx por tipo
  var alertas = [];
  ["CP","RM","SG"].forEach(function(tipo){
    (grupos[tipo]||[]).forEach(function(u){
      var dias = 0;
      // Buscar días en comentarios: "3 días", "dia 5", etc.
      var match = (u.comentarios||"").match(/(\d+)\s*d[íi]a/i);
      if (match) dias = parseInt(match[1]);
      var limite = LIMITES[tipo];
      var excede = dias > 0 && dias >= limite;
      alertas.push({
        tipo:tipo, unidad:u.unidad, operador:u.operador, coordinador:u.coordinador,
        comentarios:u.comentarios, diasEnMtto:dias, limiteEsperado:limite,
        excede:excede, fecha:latestDate,
        accion: excede
          ? (tipo==="SG"?"Escalar con aseguradora — supera "+limite+"d":tipo==="RM"?"Solicitar estimado urgente — "+dias+"d en taller":"Revisar con taller — "+dias+"d, revisar si salida hoy")
          : "Monitorear diariamente"
      });
    });
  });
  return alertas.filter(function(a){return a.excede;});
}

// ── INDICADORES DE EQUIPO ─────────────────────────────────────────────
function calcIndicadores(flota, venta, cajasInfo, otif, diesel, entregas) {
  var totalFlota = flota.total;
  var activas    = flota.enOperacion;
  var dco        = flota.resumen.DCO;
  var noUsadas   = totalFlota - activas - dco;
  var totalCajas = cajasInfo.total;
  var cajasEnUso = cajasInfo.resumen.Cargada + cajasInfo.resumen.Transito;
  var cajasLibres= totalCajas - cajasEnUso;

  // Diferencia diesel: unidades activas sin registro de diesel esta semana
  // (se calcularía en frontend con porUnidad vs activeUnits — se expone el dato)
  return {
    ventaSemana:    venta.semana.TOTAL,
    ventaSemAnt:    venta.semAnt.TOTAL,
    pctVsAnt:       venta.semAnt.TOTAL>0?((venta.semana.TOTAL-venta.semAnt.TOTAL)/venta.semAnt.TOTAL*100).toFixed(1):"—",
    pctOTIF:        otif.pctSem,
    totalViajesSem: otif.totalSem,
    entregasVencidas: entregas.totalVencidas,
    totalEntregas:  entregas.totalViajes,
    flotaActiva:    activas, flotaDCO:dco, flotaTotal:totalFlota, flotaNoUsada:noUsadas,
    cajasEnUso:cajasEnUso, cajasLibres:cajasLibres, cajasTotal:totalCajas,
    vacantesTotal:  flota.vacantes.total,
    dieselSemana:   diesel.total, dieselLitros: diesel.litros,
    weekNum:        venta.weekNum, prevWeekNum: venta.prevWeekNum,
  };
}

// ── GET PRINCIPAL ─────────────────────────────────────────────────────
function doGet(e) {
  try {
    var tab = (e.parameter&&e.parameter.tab)||"VIAJES";
    var hdrMap = {
      "VIAJES":2,"Estatus_diario":1,"Control_Cajas":2,
      "CATALOGO_UNIDADES":2,"CATALOGO_OPERADORES":2,
      "RENDIMIENTOS":2,"Circuitos":1,"Ventas":1,
      "CLIENTES":1,"CONTROL_OPERADORES":4,
      "CARGAS_DIESEL":2,"MANTENIMIENTO":2,
      "Gastos":1,"ALERTAS_OPERATIVAS":4,
      "Ranking de Operadores":1,
    };

    if (tab === "resumen_completo") {
      var wd      = weekDatesRange();
      var prevWd  = prevWeekDatesRange();

      var estatusRows   = readTab(TABS.estatus, 1);
      var cajasRows     = readTab(TABS.cajas, 2);
      var viajesRows    = readTab(TABS.viajes, 2);
      var rendRows      = readTab(TABS.rendimientos, 2);
      var dieselRows    = readTab(TABS.diesel, 2);
      var clientesRows  = readTab(TABS.clientes, 1);
      var circuitosRows = readTab(TABS.circuitos, 1);
      var ventasRows=[]; try{ventasRows=readTab(TABS.ventas,1);}catch(ex){}
      var rankingRows=[]; try{rankingRows=readTab(TABS.ranking,1);}catch(ex){}

      var active   = getActiveUnits(estatusRows);
      var cm       = buildCircuitMap(circuitosRows, ventasRows, viajesRows);
      var flota    = calcFlota(estatusRows, cm);
      var venta    = calcVentaDesdeEstatus(estatusRows, wd, prevWd);
      var diesel   = calcDiesel(dieselRows, active.units, wd);
      var kml      = calcKML(rendRows, active.units);
      var otif     = calcOTIF(viajesRows, wd);
      var cajasInfo= calcCajas(cajasRows);
      var entregas = calcEntregas(viajesRows, cm);
      var coords   = calcCoordinadores(flota, cajasRows, viajesRows, clientesRows, circuitosRows, venta, cm, wd);
      var ranking  = calcRanking(rankingRows, dieselRows, viajesRows, rendRows, active.units);
      var alertasMtto = calcAlertasMtto(flota.grupos, flota.fecha);
      var indicadores  = calcIndicadores(flota, venta, cajasInfo, otif, diesel, entregas);

      // Filtrar viajes solo semana en curso para la vista Viajes
      var viajesSem = viajesRows.filter(function(r){
        var f=String(r["Fecha de carga"]||r["Fecha"]||"").slice(0,10);
        return wd.dates.indexOf(f)!==-1;
      });

      var gastosTotal=0;
      try{var gr=readTab("Gastos",1);gr.forEach(function(g){var f=String(g["Fecha"]||g["fecha"]||"").slice(0,10);if(wd.dates.indexOf(f)!==-1)gastosTotal+=parseMonto(g["Monto"]||g["monto"]);});}catch(ex){}

      return ContentService.createTextOutput(JSON.stringify({
        ok:true, tab:"resumen_completo",
        flota:flota, venta:venta, diesel:diesel, kml:kml,
        otif:otif, cajas:cajasInfo, entregas:entregas,
        coordinadores:coords, gastosTotal:gastosTotal,
        ranking:ranking, alertasMtto:alertasMtto, indicadores:indicadores,
        viajesSemana:viajesSem,
        weekDates:wd.dates, weekNum:wd.weekNum, prevWeekNum:prevWd.weekNum,
        meta:META,
        generado:Utilities.formatDate(new Date(),Session.getScriptTimeZone(),"yyyy-MM-dd HH:mm"),
      })).setMimeType(ContentService.MimeType.JSON);
    }

    var hdr=hdrMap[tab]||1;
    var rows=readTab(tab,hdr);
    return ContentService.createTextOutput(JSON.stringify({ok:true,tab:tab,count:rows.length,data:rows})).setMimeType(ContentService.MimeType.JSON);

  } catch(err) {
    return ContentService.createTextOutput(JSON.stringify({ok:false,error:err.toString(),stack:err.stack||""})).setMimeType(ContentService.MimeType.JSON);
  }
}

// ── POST ──────────────────────────────────────────────────────────────
function doPost(e) {
  try {
    var payload=JSON.parse(e.postData.contents);
    var tab=payload.tab, rows=payload.rows||[];
    var hdrMap={"VIAJES":2,"Estatus_diario":1,"Control_Cajas":2,"CARGAS_DIESEL":2,"MANTENIMIENTO":2,"Gastos":1,"CONTROL_OPERADORES":4};
    var hdr=hdrMap[tab]||2;
    if (payload.action==="replace"&&rows.length>0){
      var ss=SpreadsheetApp.getActiveSpreadsheet();
      var ws=ss.getSheetByName(tab);
      if(ws){
        var lc=ws.getLastColumn(),lr=ws.getLastRow();
        var headers=ws.getRange(hdr,1,1,lc).getValues()[0];
        if(lr>hdr) ws.getRange(hdr+1,1,lr-hdr,lc).clearContent();
        var matrix=rows.map(function(r){return headers.map(function(h){return r[String(h).trim()]||"";});});
        if(matrix.length>0) ws.getRange(hdr+1,1,matrix.length,headers.length).setValues(matrix);
      }
    }
    if(payload.meta){META=payload.meta;}
    return ContentService.createTextOutput(JSON.stringify({ok:true,written:rows.length})).setMimeType(ContentService.MimeType.JSON);
  }catch(err){
    return ContentService.createTextOutput(JSON.stringify({ok:false,error:err.toString()})).setMimeType(ContentService.MimeType.JSON);
  }
}
