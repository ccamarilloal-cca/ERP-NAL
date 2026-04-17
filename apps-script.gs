// ═══════════════════════════════════════════════════════════════════════
//  GOOGLE APPS SCRIPT v10 — ERP NAL NACIONAL AUTOTRANSPORTE
//
//  CORRECCIONES v10:
//  1.  Hoja "Circuito" (sin S) — nombre exacto de tu archivo
//  2.  Unidades numéricas (105) y con ABC (105-ABC) se normalizan
//  3.  Venta desde Estatus_diario: Monto donde Motivo=VTA/TRN/MOV
//  4.  Fechas compromiso MTTO desde cols FechaCompromisoUnidad/Operador
//  5.  ALERTAS: lee hoja ALERTAS (ID|Estado|Comentario|Fecha)
//  6.  VIAJES: semana en curso para Ventanas Operativas
//  7.  Ranking: normaliza unidades para cruzar CARGAS_DIESEL+RENDIMIENTOS
//  8.  Auto-sync: el frontend controla intervalo, backend siempre responde
//  9.  Catálogo dinámico: 87 unidades desde CATALOGO_UNIDADES
//  10. Alertas detectadas por la app desde datos (no hoja separada)
//
//  INSTALACIÓN:
//  1. Google Sheets → Extensiones → Apps Script
//  2. Borra TODO → Pega este código → Ctrl+S
//  3. Implementar → Nueva implementación
//  4. Tipo: App web | Ejecutar: Yo | Acceso: Cualquier persona
//  5. Implementar → Autorizar → COPIAR URL /exec
//  6. Pegar en index.html: window.SHEETS_URL = "TU_URL_AQUI"
// ═══════════════════════════════════════════════════════════════════════

// ── NOMBRES EXACTOS DE TUS HOJAS ──────────────────────────────────────
var TABS = {
  estatus:      "Estatus_diario",
  cajas:        "Control_Cajas",
  viajes:       "VIAJES",
  rendimientos: "RENDIMIENTOS",
  diesel:       "CARGAS_DIESEL",
  circuito:     "Circuito",          // sin S — nombre exacto
  clientes:     "CLIENTES",
  catalogo:     "CATALOGO_UNIDADES",
  mantenimiento:"MANTENIMIENTO",
  alertas:      "ALERTAS",
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

function isoWeek(dateStr) {
  var d = new Date(dateStr + "T12:00:00");
  var jan4 = new Date(d.getFullYear(), 0, 4);
  var startOfWeek1 = new Date(jan4);
  startOfWeek1.setDate(jan4.getDate() - (jan4.getDay() || 7) + 1);
  var diff = d - startOfWeek1;
  return Math.floor(diff / (7 * 86400000)) + 1;
}

function mondayOfIsoWeek(dateStr) {
  var d = new Date(dateStr + "T12:00:00");
  var day = d.getDay() || 7;
  var mon = new Date(d);
  mon.setDate(d.getDate() - day + 1);
  return Utilities.formatDate(mon, Session.getScriptTimeZone(), "yyyy-MM-dd");
}

function sundayOfIsoWeek(dateStr) {
  var mon = mondayOfIsoWeek(dateStr);
  var d = new Date(mon + "T12:00:00");
  d.setDate(d.getDate() + 6);
  return Utilities.formatDate(d, Session.getScriptTimeZone(), "yyyy-MM-dd");
}

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

function prevWeekDatesRange() {
  var t = today();
  var mon = mondayOfIsoWeek(t);
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

// ── NORMALIZAR UNIDAD ─────────────────────────────────────────────────
// "105" → "105-ABC", "105-ABC" → "105-ABC", "095-ABC" y "95-ABC" → "095-ABC"
function normUnidad(u) {
  u = String(u || "").trim().toUpperCase().replace(/\.0$/, "");
  if (!u || u === "NAN" || u === "") return "";
  // If pure number: add -ABC
  if (/^\d+$/.test(u)) {
    return u.padStart(3, "0") + "-ABC";
  }
  // If already has -ABC: normalize leading zeros
  var m = u.match(/^(\d+)(-ABC)$/);
  if (m) return m[1].padStart(3, "0") + m[2];
  return u;
}

// ── ÚLTIMA FECHA EN ESTATUS ───────────────────────────────────────────
function getLatestDate(rows) {
  var latest = "";
  rows.forEach(function(r){
    var d = String(r["Fecha"] || "").slice(0, 10);
    if (d > latest) latest = d;
  });
  return latest;
}

// ── CATÁLOGO ACTIVO DESDE CATALOGO_UNIDADES ───────────────────────────
function getActiveCatalog(catalogRows) {
  var map = {}; // normUnidad → {unidad, operador, coordinador, circuito}
  catalogRows.forEach(function(r) {
    var u = normUnidad(r["Unidad"] || "");
    if (!u) return;
    map[u] = {
      unidad:      r["Unidad"] || u,
      operador:    r["Operador"] || "",
      coordinador: r["Coordinador"] || "",
      circuito:    r["Circuito"] || "",
    };
  });
  return map;
}

// ── MAPA DE CIRCUITOS ─────────────────────────────────────────────────
// Fuente principal: hoja Circuito (col A=Circuito, col B=Unidad)
function buildCircuitMap(circuitoRows) {
  var byUnidad = {}, byCliente = {};
  circuitoRows.forEach(function(r) {
    var u  = normUnidad(r["Unidad"] || "");
    var ci = String(r["Circuito"] || "").trim();
    var cl = String(r["Cliente"] || "").trim().toUpperCase();
    if (!ci || ci.toLowerCase() === "pordefinir" || ci === "") return;
    if (u  && !byUnidad[u])   byUnidad[u]  = ci;
    if (cl && !byCliente[cl]) byCliente[cl] = ci;
  });
  return { byUnidad: byUnidad, byCliente: byCliente };
}

function resolveCircuito(u, cliente, existingCirc, cm) {
  // 1. Already has valid circuito
  var ci = String(existingCirc || "").trim();
  if (ci && ci !== "Sin circuito" && ci !== "0" && ci !== "" &&
      ci.toLowerCase() !== "pordefinir" && ci !== "—") return ci;
  // 2. Lookup by unit (normalized)
  var uN = normUnidad(u);
  if (uN && cm.byUnidad[uN]) return cm.byUnidad[uN];
  // 3. Lookup by client
  var cl = String(cliente || "").trim().toUpperCase();
  if (cl && cm.byCliente[cl]) return cm.byCliente[cl];
  return "";
}

// ── PARSE MONTO ───────────────────────────────────────────────────────
function parseMonto(v) {
  return parseFloat(String(v || "0").replace(/[$,\s]/g, "")) || 0;
}

// ── LEER VENTA SEMANA ANTERIOR DESDE CELDA FIJA ──────────────────────
// Estatus_diario col O fila 2 = Venta semana anterior (captura manual cada lunes)
// Cols P, Q, R... = histórico semanas anteriores
function leerVentaHistorica() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var ws = ss.getSheetByName("Estatus_diario");
    if (!ws) return { ventaSemAnt: 0, historico: [] };
    
    var lastCol = ws.getLastColumn();
    // Col O = 15, fila 2 = venta semana anterior
    var ventaSemAnt = 0;
    if (lastCol >= 15) {
      var valO = ws.getRange(2, 15).getValue();
      ventaSemAnt = parseFloat(String(valO || "0").replace(/[$,\s]/g, "")) || 0;
    }
    
    // Cols P en adelante = histórico (sem16, sem17, etc.)
    var historico = [];
    if (lastCol >= 16) {
      // Leer encabezados fila 1 para saber qué semana es cada col
      for (var col = 16; col <= Math.min(lastCol, 30); col++) {
        var hdr = ws.getRange(1, col).getValue();
        var val = ws.getRange(2, col).getValue();
        var num = parseFloat(String(val || "0").replace(/[$,\s]/g, "")) || 0;
        if (hdr || num > 0) {
          historico.push({
            semana: String(hdr || "Sem " + (col - 14)),
            total: num,
            col: col
          });
        }
      }
    }
    return { ventaSemAnt: ventaSemAnt, historico: historico };
  } catch(ex) {
    return { ventaSemAnt: 0, historico: [] };
  }
}

// ── LEER ACUMULADOR DE VENTA ──────────────────────────────────────────
function leerAcumuladorVenta(wd, prevWd) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var ws = ss.getSheetByName("ACUMULADOR_VENTA");
    if (!ws || ws.getLastRow() < 2) return null;
    var data = ws.getRange(2,1,ws.getLastRow()-1,6).getValues();
    
    var semana  = {TELLO:0, CRISTIAN:0, JULIO:0, TOTAL:0};
    var semAnt  = {TELLO:0, CRISTIAN:0, JULIO:0, TOTAL:0};
    var porDia  = {};
    wd.dates.forEach(function(d){ porDia[d]={fecha:d,TELLO:0,CRISTIAN:0,JULIO:0,TOTAL:0}; });
    
    data.forEach(function(r) {
      var fecha   = String(r[0]||"").slice(0,10);
      var tello   = parseFloat(r[1]||0)||0;
      var cristian= parseFloat(r[2]||0)||0;
      var julio   = parseFloat(r[3]||0)||0;
      var total   = parseFloat(r[4]||0)||0;
      var semNum  = parseInt(r[5]||0)||0;
      
      if (wd.dates.indexOf(fecha) !== -1) {
        semana.TELLO+=tello; semana.CRISTIAN+=cristian; semana.JULIO+=julio; semana.TOTAL+=total;
        if (porDia[fecha]) { porDia[fecha].TELLO+=tello; porDia[fecha].CRISTIAN+=cristian; porDia[fecha].JULIO+=julio; porDia[fecha].TOTAL+=total; }
      }
      if (prevWd.dates.indexOf(fecha) !== -1) {
        semAnt.TELLO+=tello; semAnt.CRISTIAN+=cristian; semAnt.JULIO+=julio; semAnt.TOTAL+=total;
      }
    });
    
    return { semana:semana, semAnt:semAnt, porDia:porDia };
  } catch(ex) { return null; }
}

// ── VENTA DESDE ESTATUS_DIARIO ────────────────────────────────────────
// Motivos de venta: VTA, TRN, MOV (con monto > 0)
function calcVentaDesdeEstatus(estatusRows, wd, prevWd) {
  var latestDate = getLatestDate(estatusRows);
  var hoy    = { TELLO: 0, CRISTIAN: 0, JULIO: 0, TOTAL: 0 };
  var semana = { TELLO: 0, CRISTIAN: 0, JULIO: 0, TOTAL: 0 };
  var semAnt = { TELLO: 0, CRISTIAN: 0, JULIO: 0, TOTAL: 0 };
  var porDia = {};
  wd.dates.forEach(function(d) {
    porDia[d] = {
      fecha: d,
      dia: ["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"][new Date(d + "T12:00:00").getDay()],
      TELLO: 0, CRISTIAN: 0, JULIO: 0, TOTAL: 0
    };
  });

  var MOTIVOS_VENTA = ["VTA", "TRN", "MOV"];

  estatusRows.forEach(function(r) {
    var fecha  = String(r["Fecha"] || "").slice(0, 10);
    var motivo = String(r["Motivo"] || r["Estatus"] || "").toUpperCase();
    var esVenta = MOTIVOS_VENTA.some(function(m) { return motivo.startsWith(m); });
    if (!esVenta) return;
    var monto = parseMonto(r["Monto"]);
    if (monto <= 0) return;
    var coord = String(r["Coordinador"] || "").toUpperCase();
    var ck = coord.includes("TELLO") ? "TELLO"
           : (coord.includes("CRISTIAN") || coord.includes("ZUÑIGA") || coord.includes("ZUNIGA")) ? "CRISTIAN"
           : (coord.includes("JULIO") || coord.includes("HERNANDEZ")) ? "JULIO" : null;
    if (!ck) return;

    if (fecha === latestDate) { hoy[ck] += monto; hoy.TOTAL += monto; }
    if (wd.dates.indexOf(fecha) !== -1) {
      semana[ck] += monto; semana.TOTAL += monto;
      if (porDia[fecha]) { porDia[fecha][ck] += monto; porDia[fecha].TOTAL += monto; }
    }
    if (prevWd.dates.indexOf(fecha) !== -1) { semAnt[ck] += monto; semAnt.TOTAL += monto; }
  });

  return {
    hoy: hoy, semana: semana, semAnt: semAnt,
    diasSemana: wd.dates.map(function(d) { return porDia[d]; }),
    latestDate: latestDate, weekNum: wd.weekNum, prevWeekNum: prevWd.weekNum,
    meta: META,
    cumpl: {
      TELLO:    META.TELLO    > 0 ? Math.round(semana.TELLO    / META.TELLO    * 100) : 0,
      CRISTIAN: META.CRISTIAN > 0 ? Math.round(semana.CRISTIAN / META.CRISTIAN * 100) : 0,
      JULIO:    META.JULIO    > 0 ? Math.round(semana.JULIO    / META.JULIO    * 100) : 0,
      TOTAL:    META.TOTAL    > 0 ? Math.round(semana.TOTAL    / META.TOTAL    * 100) : 0,
    }
  };
}

// ── CALCULAR FLOTA ────────────────────────────────────────────────────
// Fuente: Estatus_diario última fecha
// Las unidades en Estatus_diario pueden ser "105" o "105-ABC" — se normalizan
function calcFlota(estatusRows, cm, catalogMap) {
  var latestDate = getLatestDate(estatusRows);
  var hoyRows = estatusRows.filter(function(r) {
    return String(r["Fecha"] || "").slice(0, 10) === latestDate;
  });

  var grupos = {
    VTA:[], TRN:[], MOV:[], LIB:[], DCO:[], DSO:[],
    CP:[], RM:[], SG:[], SO:[], IND:[], PER:[], OTROS:[]
  };

  hoyRows.forEach(function(r) {
    var m   = String(r["Motivo"] || r["Estatus"] || "").toUpperCase().trim();
    var uRaw = String(r["Unidad"] || "").trim();
    var uN  = normUnidad(uRaw);
    var catInfo = catalogMap[uN] || {};
    var ci  = resolveCircuito(uRaw, r["Cliente"], r["NombreRuta"] || r["Circuito"], cm);

    // Fechas compromiso desde Estatus_diario (columnas nuevas)
    var fcU = r["FechaCompromisoUnidad"] || r["Fecha compromiso unidad"] || "";
    var fcO = r["FechaCompromisoOperador"] || r["Fecha compromiso operador"] || "";

    var obj = {
      unidad:      uN || uRaw,
      operador:    r["Operador"] || catInfo.operador || "—",
      coordinador: r["Coordinador"] || catInfo.coordinador || "",
      motivo:      r["Motivo"] || r["Estatus"] || "",
      ruta:        r["NombreRuta"] || "",
      circuito:    ci,
      ubicacion:   r["NombreRuta"] || "",
      cliente:     r["Cliente"] || "",
      monto:       parseMonto(r["Monto"]),
      comentarios: r["Comentarios"] || "",
      fecha:       latestDate,
      fechaCompromisoUnidad:   fcU,
      fechaCompromisoOperador: fcO,
    };

    var key = m.startsWith("VTA") ? "VTA" : m.startsWith("TRN") ? "TRN" : m.startsWith("MOV") ? "MOV"
            : m.startsWith("LIB") ? "LIB" : m.startsWith("DCO") ? "DCO" : m.startsWith("DSO") ? "DSO"
            : m.startsWith("CP")  ? "CP"  : m.startsWith("RM")  ? "RM"  : m.startsWith("SG")  ? "SG"
            : m.startsWith("SO")  ? "SO"  : m.startsWith("IND") ? "IND" : m.startsWith("PER") ? "PER" : "OTROS";
    grupos[key].push(obj);
  });

  var enOp = grupos.VTA.length + grupos.TRN.length + grupos.MOV.length + grupos.LIB.length;
  var total = hoyRows.length;

  return {
    fecha: latestDate, total: total, enOperacion: enOp,
    pctUtilizacion: total > 0 ? (enOp / total * 100).toFixed(1) : "0",
    grupos: grupos,
    vacantes: {
      total: grupos.SO.length + grupos.IND.length + grupos.PER.length,
      SO: grupos.SO.length, IND: grupos.IND.length, PER: grupos.PER.length,
      detalle: grupos.SO.concat(grupos.IND).concat(grupos.PER)
    },
    enCP: {
      total: grupos.CP.length + grupos.RM.length + grupos.SG.length,
      CP: grupos.CP.length, RM: grupos.RM.length, SG: grupos.SG.length
    },
    resumen: {
      VTA: grupos.VTA.length, TRN: grupos.TRN.length, MOV: grupos.MOV.length,
      LIB: grupos.LIB.length, DCO: grupos.DCO.length, DSO: grupos.DSO.length,
      CP:  grupos.CP.length,  RM:  grupos.RM.length,  SG:  grupos.SG.length,
      SO:  grupos.SO.length,  IND: grupos.IND.length, PER: grupos.PER.length,
      OTROS: grupos.OTROS.length
    }
  };
}

// ── CAJAS ─────────────────────────────────────────────────────────────
function calcCajas(cajasRows) {
  var resumen = { Cargada:0, Disponible:0, Dañada:0, NoLocalizada:0, Transito:0, Siniestro:0, Vacia:0, Venta:0 };
  var patioMap = {};

  cajasRows.forEach(function(r) {
    var est   = String(r["Estatus"] || "").trim();
    var patio = String(r["Ciudad / Ubicación"] || r["Ciudad"] || "Sin patio").trim();
    var caja  = r["Caja"] || "";

    var key = est.replace(/\s/g, "").replace("Nolocalizada", "NoLocalizada");
    if (resumen[key] !== undefined) resumen[key]++;
    else if (est.toLowerCase().includes("cargada")) resumen.Cargada++;
    else if (est.toLowerCase().includes("tránsito") || est.toLowerCase().includes("transito")) resumen.Transito++;
    else if (est.toLowerCase().includes("disponible")) resumen.Disponible++;
    else if (est.toLowerCase().includes("dañada")) resumen.Dañada++;
    else if (est.toLowerCase().includes("siniestro")) resumen.Siniestro++;
    else if (est.toLowerCase().includes("no localizada")) resumen.NoLocalizada++;
    else if (est.toLowerCase().includes("vacía") || est.toLowerCase().includes("vacia")) resumen.Vacia++;

    if (!patioMap[patio]) patioMap[patio] = { patio: patio, total:0, Cargada:0, Disponible:0, Dañada:0, NoLocalizada:0, Transito:0, Siniestro:0, Vacia:0, cajas:[] };
    patioMap[patio].total++;
    if (resumen[key] !== undefined) patioMap[patio][key] = (patioMap[patio][key] || 0) + 1;
    patioMap[patio].cajas.push({ caja: caja, estatus: est, cliente: r["Cliente"]||"", coordinador: r["Coordinador"]||"", comentarios: r["Comentarios"]||"", ciudad: patio });
  });

  var total = cajasRows.length;
  var enUso = resumen.Cargada + resumen.Transito;
  return {
    total: total, resumen: resumen,
    pctCargadas: total > 0 ? Math.round(enUso / total * 100) : 0,
    porPatio: Object.values(patioMap).sort(function(a,b){ return b.total - a.total; })
  };
}

// ── DIESEL ────────────────────────────────────────────────────────────
function calcDiesel(dieselRows, catalogMap, wd) {
  var total = 0, litros = 0, registros = 0;
  dieselRows.forEach(function(r) {
    var fecha = String(r["Fecha Registro"] || r["Fecha"] || "").slice(0, 10);
    if (wd.dates.indexOf(fecha) === -1) return;
    var uN = normUnidad(r["Numero Economico"] || r["Unidad"] || "");
    if (!catalogMap[uN]) return; // solo mis 87 unidades
    var costo  = parseMonto(r["Costo Total ($)"] || r["Costo"]);
    var lts    = parseFloat(r["Litros"] || "0") || 0;
    total += costo; litros += lts; registros++;
  });
  return { total: total, litros: litros, registros: registros };
}

// ── KML (Rendimiento Km/Lt) ───────────────────────────────────────────
function calcKML(rendRows, catalogMap) {
  var byUnidad = {};
  rendRows.forEach(function(r) {
    var uN  = normUnidad(r["Numero Economico"] || r["Unidad"] || "");
    if (!catalogMap[uN]) return;
    var kml = parseFloat(r["RendimientoKmLt"] || r["Rendimiento Calculado"] || "0") || 0;
    if (kml <= 0 || kml > 8) return; // filter unrealistic
    if (!byUnidad[uN]) byUnidad[uN] = [];
    byUnidad[uN].push(kml);
  });
  var vals = Object.values(byUnidad).map(function(arr) {
    return arr.reduce(function(a,b){return a+b;},0) / arr.length;
  });
  var prom = vals.length > 0 ? (vals.reduce(function(a,b){return a+b;},0) / vals.length).toFixed(2) : "—";
  return { promedio: prom, unidades: Object.keys(byUnidad).length };
}

// ── OTIF ──────────────────────────────────────────────────────────────
// Usa TODOS los viajes disponibles — el filtro de semana causaba datos vacíos
// porque Fecha de carga puede estar vacía en VIAJES
function calcOTIF(viajesRows, wd) {
  var onTime = 0, late = 0, sinFecha = 0, total = 0;
  
  viajesRows.forEach(function(r) {
    var cita = String(r["Cita descarga"] || "").trim();
    var real = String(r["Fecha descarga"] || "").trim();
    var est  = String(r["Estatus viaje"] || "").toLowerCase();
    var fin  = ["finalizado","entregado","terminado","cerrado","completo",
                "entregada","finalizada","terminada"].some(function(s){ return est.includes(s); });

    // Solo contar viajes con cita capturada
    if (!cita || cita === "0" || cita === "—" || cita === "") return;
    total++;

    // No finalizado = pendiente
    if (!fin) { sinFecha++; return; }

    // Detectar si cita es solo hora (viene de 1899-12-30 de Sheets)
    // Si la fecha es 1899 o el string es solo HH:MM = tiempo sin fecha
    var citaEsSoloHora = cita.indexOf("1899") !== -1 || 
                         /^\d{1,2}:\d{2}/.test(cita) ||
                         cita.length <= 8;
    
    if (citaEsSoloHora) {
      // Cita es solo hora — no podemos comparar fechas
      // Contar como a tiempo si está finalizado (ya entregó)
      onTime++; return;
    }

    // Finalizado sin fecha real = a tiempo
    if (!real || real === "0" || real === "—") { onTime++; return; }

    var citaD = new Date(cita.length <= 10 ? cita + "T12:00:00" : cita);
    var realD = new Date(real.length <= 10 ? real + "T12:00:00" : real);
    if (isNaN(citaD) || isNaN(realD)) { onTime++; return; }
    if (realD <= citaD) onTime++; else late++;
  });
  
  var pct = (onTime + late) > 0 ? Math.round(onTime / (onTime + late) * 100) : 0;
  return { onTimeSem: onTime, late: late, sinFecha: sinFecha, totalSem: total, pctSem: pct };
}

// ── ENTREGAS ──────────────────────────────────────────────────────────
function calcEntregas(viajesRows, cm, wd) {
  var vencidas = [], pendientes = [], aTiempo = [];
  var now = new Date();
  // Usar todos los viajes disponibles — filtro de semana causaba datos vacíos
  viajesRows.forEach(function(r) {
    var u    = normUnidad(r["Unidad"] || "");
    var cli  = r["Cliente"] || "";
    var ci   = resolveCircuito(r["Unidad"], cli, r["Circuito"], cm);
    var coord = r["Coordinador"] || "";
    var cita = String(r["Cita descarga"] || "").trim();
    var est  = String(r["Estatus viaje"] || "").toLowerCase();
    var fin  = ["finalizado","entregado","terminado","cerrado","completo"].some(function(s){ return est.includes(s); });
    var real = String(r["Fecha descarga"] || "").trim();

    if (!cita || cita === "0" || cita === "") return;
    // Detectar cita solo-hora (Sheets devuelve 1899-12-30 para horas sin fecha)
    var esSoloHora = cita.indexOf("1899") !== -1 || cita.length <= 8;
    if (esSoloHora) {
      if (fin) aTiempo.push({unidad:u,cliente:cli,coordinador:coord,circuito:ci});
      else pendientes.push({unidad:u,cliente:cli,coordinador:coord,circuito:ci,cita:cita});
      return;
    }
    var citaD = new Date(cita.length <= 10 ? cita + "T12:00:00" : cita);
    if (isNaN(citaD)) return;

    if (fin) {
      if (real) {
        var realD = new Date(real.length <= 10 ? real + "T12:00:00" : real);
        if (!isNaN(realD) && realD <= citaD) {
          aTiempo.push({ unidad:u, cliente:cli, coordinador:coord, circuito:ci });
        } else {
          vencidas.push({ unidad:u, caja:r["Caja"]||"", cliente:cli, coordinador:coord,
            circuito:ci, cita:cita, estatus:est, comentarios:String(r["Observaciones"]||"").slice(0,60) });
        }
      } else {
        aTiempo.push({ unidad:u, cliente:cli, coordinador:coord, circuito:ci });
      }
    } else {
      if (citaD < now) {
        vencidas.push({ unidad:u, caja:r["Caja"]||"", cliente:cli, coordinador:coord,
          circuito:ci, cita:cita, estatus:est, comentarios:String(r["Observaciones"]||"").slice(0,60) });
      } else {
        pendientes.push({ unidad:u, cliente:cli, coordinador:coord, circuito:ci, cita:cita });
      }
    }
  });
  var totalV = viajesRows.filter(function(r){ return String(r["Cita descarga"]||"").trim() && String(r["Cita descarga"]||"").trim()!=="0"; }).length;
  return {
    vencidas: vencidas, pendientes: pendientes, aTiempo: aTiempo,
    totalVencidas: vencidas.length, totalViajes: totalV,
    pctCumplimiento: totalV > 0 ? Math.round(aTiempo.length / totalV * 100) : 100
  };
}

// ── COORDINADORES ─────────────────────────────────────────────────────
function calcCoordinadores(flota, cajasRows, viajesRows, clientesRows, circuitoRows, venta, cm, wd) {
  var COORDS = [
    { key: "TELLO",    nombre: "Juan José Tello",    kw: "TELLO",    col: "#3b82f6" },
    { key: "CRISTIAN", nombre: "Cristian Zuñiga",     kw: "CRISTIAN", col: "#10b981" },
    { key: "JULIO",    nombre: "Julio Hernandez",     kw: "JULIO",    col: "#f59e0b" },
  ];
  var result = {};
  COORDS.forEach(function(cfg) {
    var cjK = cfg.kw;
    var allU = Object.values(flota.grupos).reduce(function(a,b){ return a.concat(b); }, []);
    var miUs = allU.filter(function(u) { return String(u.coordinador||"").toUpperCase().includes(cjK); });

    var activasU   = miUs.filter(function(u){ var m=String(u.motivo||"").toUpperCase(); return m.startsWith("VTA")||m.startsWith("TRN")||m.startsWith("MOV")||m.startsWith("LIB"); });
    var dcoU       = miUs.filter(function(u){ return String(u.motivo||"").toUpperCase().startsWith("DCO"); });
    var dsoU       = miUs.filter(function(u){ return String(u.motivo||"").toUpperCase().startsWith("DSO"); });
    var libU       = miUs.filter(function(u){ return String(u.motivo||"").toUpperCase().startsWith("LIB"); });
    var soU        = miUs.filter(function(u){ return String(u.motivo||"").toUpperCase().startsWith("SO"); });
    var indU       = miUs.filter(function(u){ return String(u.motivo||"").toUpperCase().startsWith("IND"); });
    var perU       = miUs.filter(function(u){ return String(u.motivo||"").toUpperCase().startsWith("PER"); });
    var vacU       = soU.concat(indU).concat(perU);
    var mttoU      = miUs.filter(function(u){ var m=String(u.motivo||"").toUpperCase(); return m.startsWith("CP")||m.startsWith("RM")||m.startsWith("SG"); });

    var mkDet = function(u) { return { unidad:u.unidad, operador:u.operador||"—", ubicacion:u.ubicacion||u.ruta||"—", cliente:u.cliente||"—", circuito:u.circuito||"", motivo:u.motivo, comentarios:u.comentarios||"—", fecha:u.fecha||"" }; };

    // Cajas
    var miCajas = cajasRows.filter(function(c){ return String(c["Coordinador"]||"").toUpperCase().includes(cjK); });
    var cajasResumen = { Cargada:0, Disponible:0, Dañada:0, NoLocalizada:0, Vacia:0 };
    miCajas.forEach(function(c){
      var e = String(c["Estatus"]||"").toLowerCase();
      if(e.includes("cargada")) cajasResumen.Cargada++;
      else if(e.includes("disponible")) cajasResumen.Disponible++;
      else if(e.includes("dañada")) cajasResumen.Dañada++;
      else if(e.includes("no localizada")) cajasResumen.NoLocalizada++;
      else if(e.includes("vacía")||e.includes("vacia")) cajasResumen.Vacia++;
    });

    // Circuitos de este coordinador
    var cirsC = circuitoRows.filter(function(r){ return String(r["Coordinador"]||"").toUpperCase().includes(cjK.slice(0,5)); });
    var circuitos = [];
    cirsC.forEach(function(r){ var c=r["Circuito"]||""; if(c&&c.toLowerCase()!=="pordefinir"&&circuitos.indexOf(c)===-1) circuitos.push(c); });
    var cirsActivas = activasU.map(function(u){ return u.circuito; }).filter(function(c){ return c&&c!==""; });
    cirsActivas.forEach(function(c){ if(circuitos.indexOf(c)===-1) circuitos.push(c); });

    // Clientes
    var clsC = clientesRows.filter(function(r){ return String(r["Coordinador"]||"").toUpperCase().includes(cjK.slice(0,5)); });
    var clientes = clsC.map(function(r){ return { nombre:r["Nombre del Cliente"]||"",ciudad:r["Ciudad"]||"",tipo:r["Tipo de Operación"]||"",frecuencia:r["Frecuencia"]||"" }; }).slice(0,10);

    var c = {
      nombre: cfg.nombre,
      totalUnidades: miUs.length,
      activas: activasU.length, dco: dcoU.length, dso: dsoU.length, lib: libU.length,
      vacantes: vacU.length, mtto: mttoU.length,
      activasDetalle:  activasU.map(mkDet),
      dcoDetalle:      dcoU.concat(dsoU).map(mkDet),
      mttoDetalle:     mttoU.map(mkDet),
      unidadesVacantes:vacU.map(function(u){ return { unidad:u.unidad, motivo:u.motivo, comentarios:u.comentarios||"" }; }),
      totalCajas: miCajas.length,
      cajasCargadas:    cajasResumen.Cargada,
      cajasDisponibles: cajasResumen.Disponible,
      cajasDañadas:     cajasResumen.Dañada,
      cajasNoLocaliz:   cajasResumen.NoLocalizada,
      cajasVacia:       cajasResumen.Vacia,
      cajasDetalle: miCajas.slice(0,20).map(function(c){ return { caja:c["Caja"]||"",estatus:c["Estatus"]||"",cliente:c["Cliente"]||"",ciudad:c["Ciudad / Ubicación"]||"",comentarios:c["Comentarios"]||"" }; }),
      circuitos: circuitos.slice(0,10),
      clientes:  clientes,
      ventaHoy:    venta.hoy[cjK]    || 0,
      ventaSemana: venta.semana[cjK] || 0,
      metaSemana:  META[cjK]         || 0,
    };
    c.cumplMeta    = c.metaSemana > 0 ? Math.round(c.ventaSemana / c.metaSemana * 100) : 0;
    c.eficiencia   = c.totalUnidades > 0 ? (c.activas / c.totalUnidades * 100).toFixed(0) : "0";
    result[cjK] = c;
  });
  return result;
}

// ── ALERTAS DE MTTO CON TIEMPO EXCEDIDO ──────────────────────────────
function calcAlertasMtto(grupos, latestDate) {
  var LIMITES = { CP: 7, RM: 15, SG: 30 };
  var alertas = [];
  ["CP","RM","SG"].forEach(function(tipo) {
    (grupos[tipo] || []).forEach(function(u) {
      var dias = 0;
      var match = (u.comentarios || "").match(/(\d+)\s*d[íi]a/i);
      if (match) dias = parseInt(match[1]);
      var limite = LIMITES[tipo];
      if (dias > 0 && dias >= limite) {
        alertas.push({
          tipo: tipo, unidad: u.unidad, operador: u.operador, coordinador: u.coordinador,
          comentarios: u.comentarios, diasEnMtto: dias, limiteEsperado: limite, excede: true,
          fecha: latestDate,
          accion: tipo === "SG" ? "Escalar con aseguradora — supera " + limite + "d"
                : tipo === "RM" ? "Solicitar estimado urgente — " + dias + "d en taller"
                : "Revisar con taller — " + dias + "d en MTTO"
        });
      }
    });
  });
  return alertas;
}

// ── RANKING ───────────────────────────────────────────────────────────
// Fuente principal de Km/Lt: hoja RENDIMIENTOS (columna RendimientoKmLt)
// Fuente de litros/costo: CARGAS_DIESEL (NO usar su Rendimiento Km/Lt — tiene errores de odómetro)
// Filtrado estrictamente a las 87 unidades del catálogo
// Ordenado por última carga (más reciente primero)
function calcRanking(dieselRows, viajesRows, rendRows, catalogMap) {
  var opMap = {};

  // Inicializar SOLO las 87 unidades del catálogo
  Object.keys(catalogMap).forEach(function(uN) {
    opMap[uN] = {
      unidad:          catalogMap[uN].unidad,
      operador:        catalogMap[uN].operador || "—",
      coordinador:     catalogMap[uN].coordinador || "",
      kmlVals:         [],   // solo de RENDIMIENTOS hoja
      viajes:          0,
      kmTotal:         0,
      totalLitros:     0,
      ventaTotal:      0,
      ultimaFechaCarga:   "",
      ultimoRendimiento:  "",
      ultimoViaje:        "",
      ultimaFechaRend:    "",
    };
  });

  // ── 1. RENDIMIENTOS hoja — fuente confiable de Km/Lt ──────────────────
  // Columna RendimientoKmLt ya está calculada correctamente por el sistema
  // Filtro: solo valores realistas entre 1.5 y 6.5 km/lt para tractos
  rendRows.forEach(function(r) {
    var uN   = normUnidad(r["Numero Economico"] || r["Unidad"] || "");
    if (!opMap[uN]) return;
    var kml  = parseFloat(r["RendimientoKmLt"] || r["Rendimiento Calculado"] || "0") || 0;
    var km   = parseFloat(r["Kms Recorridos"] || r["TotalKmCargados"] || "0") || 0;
    var lts  = parseFloat(r["Litros Carga"] || r["TotalLitrosDiesel"] || "0") || 0;
    var fecha = String(r["Fecha Registro"] || r["Fecha Fin Rendimiento"] || "").slice(0, 10);
    var op   = String(r["Operador"] || "").trim();

    // Solo km/lt realistas para tractos (1.5 – 6.5)
    if (kml >= 1.5 && kml <= 6.5) {
      opMap[uN].kmlVals.push(kml);
      // Guardar el más reciente como "último rendimiento"
      if (fecha > opMap[uN].ultimaFechaRend) {
        opMap[uN].ultimaFechaRend    = fecha;
        opMap[uN].ultimoRendimiento  = kml.toFixed(2);
        opMap[uN].ultimaFechaCarga   = fecha;
      }
    }
    if (km  > 0) opMap[uN].kmTotal     += km;
    if (lts > 0) opMap[uN].totalLitros += lts;
    if (op && op !== "") opMap[uN].operador = op;
  });

  // ── 2. CARGAS_DIESEL — solo litros y costo (NO el rendimiento calculado) ──
  // El rendimiento de esta hoja tiene errores cuando es primera carga (sin odómetro previo)
  dieselRows.forEach(function(r) {
    var uN  = normUnidad(r["Numero Economico"] || r["Unidad"] || "");
    if (!opMap[uN]) return;
    var lts  = parseFloat(r["Litros"] || "0") || 0;
    var op   = String(r["Operador"] || "").trim();
    var fecha = String(r["Fecha Registro"] || "").slice(0, 10);
    if (lts > 0) opMap[uN].totalLitros += lts;
    if (op && op !== "") opMap[uN].operador = op;
    // Actualizar fecha más reciente para este campo
    if (fecha > opMap[uN].ultimaFechaCarga && opMap[uN].ultimaFechaRend === "") {
      opMap[uN].ultimaFechaCarga = fecha;
    }
  });

  // ── 3. VIAJES — viajes completados, km cargados, venta ────────────────
  viajesRows.forEach(function(r) {
    var uN  = normUnidad(r["Unidad"] || "");
    if (!opMap[uN]) return;
    var est = String(r["Estatus viaje"] || "").toLowerCase();
    var fin = ["finalizado","entregado","terminado","cerrado","completo"].some(function(s){ return est.includes(s); });
    if (!fin) return;
    opMap[uN].viajes++;
    var km  = parseFloat(r["Km cargados"] || r["Km programados"] || "0") || 0;
    var vta = parseMonto(r["Venta real"] || r["Venta estimada"] || "0");
    if (km  > 0) opMap[uN].kmTotal    += km;
    if (vta > 0) opMap[uN].ventaTotal += vta;
    var fecha = String(r["Fecha de carga"] || r["Fecha"] || "").slice(0, 10);
    if (fecha > opMap[uN].ultimoViaje) opMap[uN].ultimoViaje = fecha;
  });

  // ── Construir resultado final ──────────────────────────────────────────
  return Object.values(opMap).map(function(d) {
    // Promedio de km/lt solo con valores confiables de RENDIMIENTOS
    var kmlProm = d.kmlVals.length > 0
      ? (d.kmlVals.reduce(function(a,b){return a+b;},0) / d.kmlVals.length).toFixed(2)
      : "—";

    // Rendimiento por viaje: km total / litros totales (solo si tenemos ambos)
    var rendVj = "—";
    if (d.viajes > 0 && d.totalLitros > 0 && d.kmTotal > 0) {
      rendVj = (d.kmTotal / d.totalLitros).toFixed(2);
    }

    return {
      unidad:             d.unidad,
      operador:           d.operador,
      coordinador:        d.coordinador,
      rendimientoKmLt:    kmlProm,
      rendimientoViaje:   rendVj,
      viajesCompletados:  d.viajes,
      kmTotal:            Math.round(d.kmTotal),
      totalLitros:        Math.round(d.totalLitros),
      ventaTotal:         Math.round(d.ventaTotal),
      ultimaFechaCarga:   d.ultimaFechaCarga,
      ultimoRendimiento:  d.ultimoRendimiento,
      ultimoViaje:        d.ultimoViaje
    };
  }).filter(function(op) {
    // Solo mostrar unidades con al menos un dato
    return op.viajesCompletados > 0 || op.rendimientoKmLt !== "—" || op.totalLitros > 0;
  }).sort(function(a, b) {
    // Ordenar por última fecha de carga (más reciente primero)
    return (b.ultimaFechaCarga || "") > (a.ultimaFechaCarga || "") ? 1 : -1;
  });
}

// ── INDICADORES ───────────────────────────────────────────────────────
function calcIndicadores(flota, venta, cajasInfo, otif, diesel, entregas) {
  var totalCajas = cajasInfo.total;
  var cajasEnUso = cajasInfo.resumen.Cargada + cajasInfo.resumen.Transito;
  return {
    ventaSemana: venta.semana.TOTAL, ventaSemAnt: venta.semAnt.TOTAL,
    pctVsAnt: venta.semAnt.TOTAL > 0
      ? ((venta.semana.TOTAL - venta.semAnt.TOTAL) / venta.semAnt.TOTAL * 100).toFixed(1) : "—",
    pctOTIF: otif.pctSem, totalViajesSem: otif.totalSem,
    entregasVencidas: entregas.totalVencidas, totalEntregas: entregas.totalViajes,
    flotaActiva: flota.enOperacion, flotaDCO: flota.resumen.DCO,
    flotaTotal: flota.total, flotaNoUsada: flota.total - flota.enOperacion - flota.resumen.DCO,
    cajasEnUso: cajasEnUso, cajasLibres: totalCajas - cajasEnUso, cajasTotal: totalCajas,
    vacantesTotal: flota.vacantes.total,
    dieselSemana: diesel.total, dieselLitros: diesel.litros,
    weekNum: venta.weekNum, prevWeekNum: venta.prevWeekNum,
  };
}

// ── VIAJES SEMANA (para Ventanas Operativas) ──────────────────────────
// Fuente: hoja VIAJES — contiene datos de las 3 programaciones
// Acepta por Fecha de carga O por número de semana ISO
function getViajesSemana(viajesRows, cm, wd) {
  // Normalizar número de semana: "15.0" → 15
  var normSem = function(s) { return parseInt(String(s || "0").replace(/[^0-9]/g, "")) || 0; };
  var semActual = wd.weekNum;  // número entero
  var semsValidas = [semActual, semActual - 1, semActual + 1];
  
  var filtered = viajesRows.filter(function(r) {
    // Método 1: columna Semana (acepta "15", "15.0", "16.0", etc.)
    var semR = normSem(r["Semana"]);
    if (semR > 0 && semsValidas.indexOf(semR) !== -1) return true;
    
    // Método 2: fecha de carga o fecha del viaje
    var f = String(r["Fecha de carga"] || r["Fecha"] || "").slice(0, 10);
    if (f && f.length === 10 && f > "2026-01-01" && wd.dates.indexOf(f) !== -1) return true;
    
    // Método 3: fecha de descarga
    var fD = String(r["Fecha descarga"] || "").slice(0, 10);
    if (fD && fD.length === 10 && fD > "2026-01-01" && wd.dates.indexOf(fD) !== -1) return true;
    
    return false;
  });
  
  // Si no hay viajes filtrados, devolver todos para no mostrar vacío
  var result = filtered.length > 0 ? filtered : viajesRows;
  
  return result.map(function(r) {
    var ci = resolveCircuito(r["Unidad"], r["Cliente"], r["Circuito"], cm);
    return Object.assign({}, r, { Circuito: ci });
  });
}

// ── GET PRINCIPAL ─────────────────────────────────────────────────────
function doGet(e) {
  try {
    var tab = (e.parameter && e.parameter.tab) || "VIAJES";

    var hdrMap = {
      "VIAJES":2, "Estatus_diario":1, "Control_Cajas":2,
      "CATALOGO_UNIDADES":2, "CATALOGO_OPERADORES":2,
      "RENDIMIENTOS":2, "Circuito":1, "CLIENTES":1,
      "CONTROL_OPERADORES":4, "CARGAS_DIESEL":2,
      "MANTENIMIENTO":2, "ALERTAS":1, "ALERTAS_OPERATIVAS":4,
      "PENDIENTES":1, "URGENCIAS":1,
    };

    if (tab === "resumen_completo") {
      var wd     = weekDatesRange();
      var prevWd = prevWeekDatesRange();

      var estatusRows  = readTab(TABS.estatus, 1);
      var cajasRows    = readTab(TABS.cajas, 2);
      var viajesRows   = readTab(TABS.viajes, 2);
      var rendRows     = readTab(TABS.rendimientos, 2);
      var dieselRows   = readTab(TABS.diesel, 2);
      var clientesRows = readTab(TABS.clientes, 1);
      var catalogRows  = readTab(TABS.catalogo, 2);
      var circuitoRows = readTab(TABS.circuito, 1);
      var alertasRows  = []; try { alertasRows = readTab(TABS.alertas, 1); } catch(ex){}
      var mttoRows     = []; try { mttoRows    = readTab(TABS.mantenimiento, 2); } catch(ex){}

      var catalogMap = getActiveCatalog(catalogRows); // 87 unidades
      var cm         = buildCircuitMap(circuitoRows);
      var flota      = calcFlota(estatusRows, cm, catalogMap);
      var venta      = calcVentaDesdeEstatus(estatusRows, wd, prevWd);
      
      // Enriquecer con acumulador histórico (guarda venta de cada día que pegas Estatus_diario)
      var acum = leerAcumuladorVenta(wd, prevWd);
      if (acum) {
        // Sumar días del acumulador que no están en el Estatus_diario actual
        var latestInEstatus = venta.latestDate;
        // Agregar venta de días anteriores de la semana desde el acumulador
        Object.keys(acum.porDia).forEach(function(fecha) {
          if (fecha !== latestInEstatus && acum.porDia[fecha].TOTAL > 0) {
            venta.semana.TELLO    += acum.porDia[fecha].TELLO;
            venta.semana.CRISTIAN += acum.porDia[fecha].CRISTIAN;
            venta.semana.JULIO    += acum.porDia[fecha].JULIO;
            venta.semana.TOTAL    += acum.porDia[fecha].TOTAL;
          }
        });
        // Semana anterior: usar acumulador si tiene datos (más completo)
        if (acum.semAnt.TOTAL > 0) {
          venta.semAnt.TELLO    = acum.semAnt.TELLO;
          venta.semAnt.CRISTIAN = acum.semAnt.CRISTIAN;
          venta.semAnt.JULIO    = acum.semAnt.JULIO;
          venta.semAnt.TOTAL    = acum.semAnt.TOTAL;
        }
        // Recalcular comparativo
        if (venta.semAnt.TOTAL > 0) {
          venta.pctVsAnt = ((venta.semana.TOTAL - venta.semAnt.TOTAL) / venta.semAnt.TOTAL * 100).toFixed(1);
        }
      }
      
      // Fallback: leer venta semana anterior desde celda fija O2 de Estatus_diario
      var ventaHist  = leerVentaHistorica();
      if (ventaHist.ventaSemAnt > 0 && venta.semAnt.TOTAL === 0) {
        venta.semAnt.TOTAL = ventaHist.ventaSemAnt;
        venta.pctVsAnt = ((venta.semana.TOTAL - venta.semAnt.TOTAL) / venta.semAnt.TOTAL * 100).toFixed(1);
      }
      var diesel     = calcDiesel(dieselRows, catalogMap, wd);
      var kml        = calcKML(rendRows, catalogMap);
      var otif       = calcOTIF(viajesRows, wd);
      var cajasInfo  = calcCajas(cajasRows);
      var entregas   = calcEntregas(viajesRows, cm, wd);
      var coords     = calcCoordinadores(flota, cajasRows, viajesRows, clientesRows, circuitoRows, venta, cm, wd);
      var ranking    = calcRanking(dieselRows, viajesRows, rendRows, catalogMap);
      var alertasMtto = calcAlertasMtto(flota.grupos, flota.fecha);
      var indicadores = calcIndicadores(flota, venta, cajasInfo, otif, diesel, entregas);
      var viajesSem   = getViajesSemana(viajesRows, cm, wd);

      var gastosTotal = 0;
      try {
        var gr = readTab("Gastos", 1);
        gr.forEach(function(g){
          var f = String(g["Fecha"] || "").slice(0,10);
          if (wd.dates.indexOf(f) !== -1) gastosTotal += parseMonto(g["Monto"]);
        });
      } catch(ex){}

      return ContentService.createTextOutput(JSON.stringify({
        ok: true, tab: "resumen_completo",
        flota: flota, venta: venta, diesel: diesel, kml: kml,
        otif: otif, cajas: cajasInfo, entregas: entregas,
        coordinadores: coords, gastosTotal: gastosTotal,
        ranking: ranking, alertasMtto: alertasMtto,
        indicadores: indicadores, viajesSemana: viajesSem,
        ventaHistorico: ventaHist.historico,
        alertasList: alertasRows, mttoList: mttoRows,
        weekDates: wd.dates, weekNum: wd.weekNum, prevWeekNum: prevWd.weekNum,
        meta: META,
        totalUnidades: Object.keys(catalogMap).length,
        generado: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm"),
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // Direct tab read
    var hdr  = hdrMap[tab] || 1;
    var rows = readTab(tab, hdr);
    return ContentService.createTextOutput(
      JSON.stringify({ ok: true, tab: tab, count: rows.length, data: rows })
    ).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(
      JSON.stringify({ ok: false, error: err.toString(), stack: err.stack || "" })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}

// ── ACUMULADOR DE VENTA DIARIA ────────────────────────────────────────
// Guarda el total de venta del día en hoja ACUMULADOR_VENTA antes de reemplazar
// Cols: Fecha | TELLO | CRISTIAN | JULIO | TOTAL | Semana
function guardarVentaDiaria(estatusRows) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var ws = ss.getSheetByName("ACUMULADOR_VENTA");
    if (!ws) {
      ws = ss.insertSheet("ACUMULADOR_VENTA");
      ws.getRange(1,1,1,6).setValues([["Fecha","TELLO","CRISTIAN","JULIO","TOTAL","Semana"]]);
    }
    
    var totales = {TELLO:0, CRISTIAN:0, JULIO:0, TOTAL:0};
    var latestDate = "";
    var MOTIVOS = ["VTA","TRN","MOV"];
    
    estatusRows.forEach(function(r) {
      var fecha = String(r["Fecha"]||"").slice(0,10);
      if (fecha > latestDate) latestDate = fecha;
    });
    
    estatusRows.forEach(function(r) {
      var fecha = String(r["Fecha"]||"").slice(0,10);
      if (fecha !== latestDate) return;
      var motivo = String(r["Motivo"]||"").toUpperCase();
      var esVenta = MOTIVOS.some(function(m){ return motivo.startsWith(m); });
      if (!esVenta) return;
      var monto = parseFloat(String(r["Monto"]||"0").replace(/[$,]/g,"")) || 0;
      if (monto <= 0) return;
      var coord = String(r["Coordinador"]||"").toUpperCase();
      var ck = coord.includes("TELLO")?"TELLO":
               (coord.includes("CRISTIAN")||coord.includes("ZUÑIGA"))?"CRISTIAN":
               (coord.includes("JULIO")||coord.includes("HERNANDEZ"))?"JULIO":null;
      if (!ck) return;
      totales[ck] += monto;
      totales.TOTAL += monto;
    });
    
    if (latestDate && totales.TOTAL > 0) {
      // Verificar si ya existe esa fecha
      var lr = ws.getLastRow();
      var fechas = lr > 1 ? ws.getRange(2,1,lr-1,1).getValues().map(function(r){return String(r[0]).slice(0,10);}) : [];
      var semana = 0;
      try { 
        var d = new Date(latestDate+"T12:00:00");
        var jan4 = new Date(d.getFullYear(),0,4);
        var sw = new Date(jan4); sw.setDate(jan4.getDate()-(jan4.getDay()||7)+1);
        semana = Math.floor((d-sw)/(7*86400000))+1;
      } catch(ex){}
      
      var idx = fechas.indexOf(latestDate);
      if (idx === -1) {
        // Nueva fecha — agregar fila
        ws.appendRow([latestDate, totales.TELLO, totales.CRISTIAN, totales.JULIO, totales.TOTAL, semana]);
      } else {
        // Actualizar fila existente
        ws.getRange(idx+2,2,1,5).setValues([[totales.TELLO, totales.CRISTIAN, totales.JULIO, totales.TOTAL, semana]]);
      }
    }
  } catch(ex) { Logger.log("guardarVentaDiaria error: " + ex); }
}

// ── POST — guardar cambios desde la app ───────────────────────────────
function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents);
    var tab  = payload.tab;
    var rows = payload.rows || [];
    var hdrMap = {
      "VIAJES":2, "Estatus_diario":1, "Control_Cajas":2,
      "CARGAS_DIESEL":2, "MANTENIMIENTO":2, "Gastos":1,
      "CONTROL_OPERADORES":4, "ALERTAS":1, "Circuito":1,
      "CATALOGO_UNIDADES":2, "CATALOGO_OPERADORES":2,
      "PENDIENTES":1, "URGENCIAS":1,
    };
    var hdr = hdrMap[tab] || 1;
    var ss  = SpreadsheetApp.getActiveSpreadsheet();
    var ws  = ss.getSheetByName(tab);

    // Replace: reescribir datos manteniendo encabezados
    if (payload.action === "replace" && rows.length > 0) {
      if (!ws) return ContentService.createTextOutput(JSON.stringify({ok:false,error:"Sheet not found: "+tab})).setMimeType(ContentService.MimeType.JSON);
      // Si es Estatus_diario, guardar venta antes de reemplazar
      if (tab === "Estatus_diario") { guardarVentaDiaria(rows); }
      var lc = ws.getLastColumn(), lr = ws.getLastRow();
      var headers = ws.getRange(hdr, 1, 1, lc).getValues()[0];
      if (lr > hdr) ws.getRange(hdr + 1, 1, lr - hdr, lc).clearContent();
      var matrix = rows.map(function(r){
        return headers.map(function(h){ return r[String(h).trim()] || ""; });
      });
      if (matrix.length > 0) ws.getRange(hdr + 1, 1, matrix.length, headers.length).setValues(matrix);
    }

    // Upsert: actualiza fila si ID existe, inserta si no existe (evita duplicados)
    if (payload.action === "append" && rows.length > 0) {
      if (!ws) {
        ws = ss.insertSheet(tab);
        var newHdrs = Object.keys(rows[0]);
        ws.getRange(1, 1, 1, newHdrs.length).setValues([newHdrs]);
      }
      var lc2 = ws.getLastColumn(), lr2 = ws.getLastRow();
      var headers2 = lc2 > 0 ? ws.getRange(hdr, 1, 1, lc2).getValues()[0] : Object.keys(rows[0]);
      
      // Build ID map from existing rows (col 0 = ID)
      var existingIds = {};
      if (lr2 > hdr) {
        var existingData = ws.getRange(hdr + 1, 1, lr2 - hdr, 1).getValues();
        existingData.forEach(function(r, i) {
          if (r[0]) existingIds[String(r[0]).trim()] = hdr + 1 + i; // row number (1-based)
        });
      }
      
      rows.forEach(function(r) {
        var rowData = headers2.map(function(h){ return r[String(h).trim()] || ""; });
        var rowId = String(r["ID"] || r["id"] || rowData[0] || "").trim();
        
        if (rowId && existingIds[rowId]) {
          // UPDATE existing row
          ws.getRange(existingIds[rowId], 1, 1, headers2.length).setValues([rowData]);
        } else {
          // INSERT new row
          var newRow = ws.getLastRow() + 1;
          ws.getRange(newRow, 1, 1, headers2.length).setValues([rowData]);
          if (rowId) existingIds[rowId] = newRow; // track new row
        }
      });
    }

    if (payload.meta) { META = payload.meta; }

    return ContentService.createTextOutput(
      JSON.stringify({ ok: true, written: rows.length })
    ).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(
      JSON.stringify({ ok: false, error: err.toString() })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}
