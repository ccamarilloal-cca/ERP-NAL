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
// Cuenta TODOS los viajes de la semana con cita registrada
// No filtra por fecha de carga — toma todos los viajes que tienen semana en curso
function calcOTIF(viajesRows, wd) {
  var onTime = 0, late = 0, sinFecha = 0, total = 0;
  viajesRows.forEach(function(r) {
    // Acepta fecha de carga O fecha del registro
    var fechaCarga = String(r["Fecha de carga"] || r["Fecha"] || r["Fecha descarga"] || "").slice(0, 10);
    // Si tiene semana capturada, verificar que sea la semana en curso
    var semanaR = String(r["Semana"] || "").trim();
    var enSemana = wd.dates.indexOf(fechaCarga) !== -1;
    // Si no tiene fecha de carga pero tiene semana, comparar semana
    if (!enSemana && semanaR && semanaR === String(wd.weekNum)) enSemana = true;
    // Si no pasa ningún filtro, skip
    if (!enSemana && !fechaCarga) return;
    if (fechaCarga && !enSemana) return;

    var cita = String(r["Cita descarga"] || "").trim();
    var real = String(r["Fecha descarga"] || "").trim();
    var est  = String(r["Estatus viaje"] || "").toLowerCase();
    var fin  = ["finalizado","entregado","terminado","entregado","cerrado","completo"].some(function(s){ return est.includes(s); });

    total++;
    if (!cita || cita === "0" || cita === "—") { sinFecha++; return; }
    if (!fin) return; // pendiente, no cuenta aún en OTIF

    if (!real) { onTime++; return; } // sin fecha real pero finalizado = a tiempo
    var citaD = new Date(cita.length <= 10 ? cita + "T12:00:00" : cita);
    var realD = new Date(real.length <= 10 ? real + "T12:00:00" : real);
    if (isNaN(citaD) || isNaN(realD)) { sinFecha++; return; }
    if (realD <= citaD) onTime++; else late++;
  });
  var pct = (onTime + late) > 0 ? Math.round(onTime / (onTime + late) * 100) : 0;
  return { onTimeSem: onTime, late: late, sinFecha: sinFecha, totalSem: total, pctSem: pct };
}

// ── ENTREGAS ──────────────────────────────────────────────────────────
function calcEntregas(viajesRows, cm, wd) {
  var vencidas = [], pendientes = [], aTiempo = [];
  var now = new Date();
  viajesRows.forEach(function(r) {
    // Filtrar solo viajes de la semana en curso
    if (wd) {
      var fCarga = String(r["Fecha de carga"] || r["Fecha"] || "").slice(0, 10);
      var semR   = String(r["Semana"] || "").trim().replace(/\.0$/, "");
      var enSem  = wd.dates.indexOf(fCarga) !== -1 || (semR && semR === String(wd.weekNum));
      if (!enSem) return;
    }
    var u    = normUnidad(r["Unidad"] || "");
    var cli  = r["Cliente"] || "";
    var ci   = resolveCircuito(r["Unidad"], cli, r["Circuito"], cm);
    var coord = r["Coordinador"] || "";
    var cita = String(r["Cita descarga"] || "").trim();
    var est  = String(r["Estatus viaje"] || "").toLowerCase();
    var fin  = ["finalizado","entregado","terminado","cerrado","completo"].some(function(s){ return est.includes(s); });
    var real = String(r["Fecha descarga"] || "").trim();

    if (!cita || cita === "0" || cita === "") return;
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
  return viajesRows
    .filter(function(r) {
      // Método 1: por fecha de carga exacta en el rango de la semana
      var f = String(r["Fecha de carga"] || r["Fecha"] || "").slice(0, 10);
      if (wd.dates.indexOf(f) !== -1) return true;
      // Método 2: por número de semana capturado en columna "Semana"
      var semR = String(r["Semana"] || "").trim().replace(/\.0$/, "");
      if (semR && semR === String(wd.weekNum)) return true;
      // Método 3: por fecha de viaje (Fecha col)
      var fViaje = String(r["Fecha"] || "").slice(0, 10);
      if (fViaje && wd.dates.indexOf(fViaje) !== -1) return true;
      return false;
    })
    .map(function(r) {
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
    };
    var hdr = hdrMap[tab] || 1;
    var ss  = SpreadsheetApp.getActiveSpreadsheet();
    var ws  = ss.getSheetByName(tab);

    // Replace: reescribir datos manteniendo encabezados
    if (payload.action === "replace" && rows.length > 0) {
      if (!ws) return ContentService.createTextOutput(JSON.stringify({ok:false,error:"Sheet not found: "+tab})).setMimeType(ContentService.MimeType.JSON);
      var lc = ws.getLastColumn(), lr = ws.getLastRow();
      var headers = ws.getRange(hdr, 1, 1, lc).getValues()[0];
      if (lr > hdr) ws.getRange(hdr + 1, 1, lr - hdr, lc).clearContent();
      var matrix = rows.map(function(r){
        return headers.map(function(h){ return r[String(h).trim()] || ""; });
      });
      if (matrix.length > 0) ws.getRange(hdr + 1, 1, matrix.length, headers.length).setValues(matrix);
    }

    // Append: agregar sin borrar (para ALERTAS y MANTENIMIENTO)
    if (payload.action === "append" && rows.length > 0) {
      if (!ws) {
        ws = ss.insertSheet(tab);
        var newHdrs = Object.keys(rows[0]);
        ws.getRange(1, 1, 1, newHdrs.length).setValues([newHdrs]);
      }
      var lc2 = ws.getLastColumn(), lr2 = ws.getLastRow();
      var headers2 = lc2 > 0 ? ws.getRange(hdr, 1, 1, lc2).getValues()[0] : Object.keys(rows[0]);
      var matrix2 = rows.map(function(r){
        return headers2.map(function(h){ return r[String(h).trim()] || ""; });
      });
      if (matrix2.length > 0) ws.getRange(lr2 + 1, 1, matrix2.length, headers2.length).setValues(matrix2);
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
