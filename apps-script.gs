// ═══════════════════════════════════════════════════════════════════════
//  GOOGLE APPS SCRIPT v6 — ERP NAL
//  Archivo: sistema_logistico.xlsx (Google Sheets)
//
//  CORRECCIONES v6:
//  - Venta: desde Estatus_diario columna Monto (no desde VIAJES)
//  - Diesel: desde CARGAS_DIESEL cruzando fecha+unidad
//  - Mantenimiento: desglose CP/RM/SG separados
//  - Vacantes: SO/IND/PERM/DSO/DCO separados
//  - Venta por día y por semana con meta configurable
//  - KM/L: cruzando RENDIMIENTOS por fecha+unidad
//  - Utilidad: solo cuando hay datos reales (evita negativos falsos)
//
//  CÓMO ACTUALIZAR EN TU GITHUB:
//  1. Ve a github.com → tu repo → click en apps-script.gs
//  2. Click en el lápiz ✏️ (editar)
//  3. Borra todo → pega este código completo
//  4. Click "Commit changes"
//  (El archivo en GitHub es solo referencia — el que importa
//   es el que pegaste en Google Apps Script)
//
//  EN TU GOOGLE SHEETS:
//  1. Extensiones → Apps Script → borra todo → pega este código
//  2. Guardar → Implementar → Nueva implementación
//  3. Tipo: Aplicación web | Ejecutar: Yo | Acceso: Cualquier persona
//  4. Implementar → Autorizar → Copiar URL /exec
//  5. Esa URL va en index.html: window.SHEETS_URL = "TU_URL"
// ═══════════════════════════════════════════════════════════════════════

// ── NOMBRES EXACTOS DE PESTAÑAS ────────────────────────────────────────
var SHEET = {
  viajes:       "VIAJES",
  estatus:      "Estatus_diario",
  cajas:        "Control_Cajas",
  unidades:     "CATALOGO_UNIDADES",
  operadores:   "CATALOGO_OPERADORES",
  rendimientos: "RENDIMIENTOS",
  circuitos:    "Circuito",
  clientes:     "CLIENTES",
  control_op:   "CONTROL_OPERADORES",
  diesel:       "CARGAS_DIESEL",
  mantenimiento:"MANTENIMIENTO",
  gastos:       "Gastos",       // pestaña futura que agregarás
  alertas_sh:   "ALERTAS_OPERATIVAS",
};

// ── META SEMANAL (editable aquí hasta que la integres en Sheets) ───────
var META_SEMANAL = {
  "JUAN JOSE TELLO":    500000,  // Cambia estos valores
  "CRISTIAN ZUÑIGA":    450000,
  "JULIO HERNANDEZ":    350000,
  TOTAL:               1300000,
};

// ── HELPER: Lee una pestaña → array de objetos ─────────────────────────
function readTab(tabName, headerRow) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ws = ss.getSheetByName(tabName);
  if (!ws) return [];
  var lr = ws.getLastRow();
  var lc = ws.getLastColumn();
  if (lr <= headerRow || lc === 0) return [];
  var hdr = ws.getRange(headerRow, 1, 1, lc).getValues()[0];
  var data = ws.getRange(headerRow + 1, 1, lr - headerRow, lc).getValues();
  return data
    .filter(function(r){ return r.some(function(c){ return c !== "" && c !== null && c !== undefined; }); })
    .map(function(r){
      var obj = {};
      hdr.forEach(function(h, i){
        var key = String(h || "col_" + i).trim();
        var val = r[i];
        if (val === null || val === undefined) val = "";
        if (val instanceof Date) {
          val = Utilities.formatDate(val, Session.getScriptTimeZone(), "yyyy-MM-dd");
        } else {
          val = String(val).trim();
        }
        obj[key] = val;
      });
      return obj;
    });
}

// ── HELPER: Escribe filas en una pestaña ───────────────────────────────
function writeTab(tabName, headerRow, rows) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ws = ss.getSheetByName(tabName);
  if (!ws || rows.length === 0) return false;
  var lc = ws.getLastColumn();
  if (lc === 0) return false;
  var hdr = ws.getRange(headerRow, 1, 1, lc).getValues()[0];
  var lr = ws.getLastRow();
  if (lr > headerRow) {
    ws.getRange(headerRow + 1, 1, lr - headerRow, lc).clearContent();
  }
  var matrix = rows.map(function(row){
    return hdr.map(function(h){ var k = String(h).trim(); return (row[k] !== undefined && row[k] !== null) ? row[k] : ""; });
  });
  if (matrix.length > 0) ws.getRange(headerRow + 1, 1, matrix.length, hdr.length).setValues(matrix);
  return true;
}

// ── HELPER: Formato fecha YYYY-MM-DD ──────────────────────────────────
function fmtDate(d) {
  if (!d) return "";
  if (d instanceof Date) return Utilities.formatDate(d, Session.getScriptTimeZone(), "yyyy-MM-dd");
  return String(d).slice(0, 10);
}

// ── OBTENER SEMANA ISO ────────────────────────────────────────────────
function getWeekNumber(dateStr) {
  var d = new Date(dateStr);
  if (isNaN(d)) return 0;
  var startOfYear = new Date(d.getFullYear(), 0, 1);
  var days = Math.floor((d - startOfYear) / 86400000);
  return Math.ceil((days + startOfYear.getDay() + 1) / 7);
}

// ── CALCULAR SEMANA ACTUAL Y DÍAS DE LA SEMANA ─────────────────────────
function getCurrentWeekDates() {
  var today = new Date();
  var day = today.getDay(); // 0=Dom
  var monday = new Date(today);
  monday.setDate(today.getDate() - (day === 0 ? 6 : day - 1));
  var dates = [];
  for (var i = 0; i < 7; i++) {
    var d = new Date(monday);
    d.setDate(monday.getDate() + i);
    dates.push(Utilities.formatDate(d, Session.getScriptTimeZone(), "yyyy-MM-dd"));
  }
  return dates;
}

// ── CALCULAR VENTA DESDE ESTATUS_DIARIO ───────────────────────────────
function calcVentas(estatusRows) {
  var today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
  var weekDates = getCurrentWeekDates();
  var weekNum = getWeekNumber(today);

  // Motivos que generan venta
  var motivosVenta = ["VTA", "TRN", "MOV"];

  var ventaHoy = { TELLO: 0, CRISTIAN: 0, JULIO: 0, TOTAL: 0 };
  var ventaSemana = { TELLO: 0, CRISTIAN: 0, JULIO: 0, TOTAL: 0 };
  var ventaPorDia = {}; // {"2026-04-09": {TELLO:x, CRISTIAN:x, JULIO:x, TOTAL:x}}

  estatusRows.forEach(function(r){
    var fecha = String(r["Fecha"] || "").slice(0, 10);
    var motivo = String(r["Motivo"] || "").toUpperCase();
    var coord = String(r["Coordinador"] || "").toUpperCase();
    var monto = parseFloat(String(r["Monto"] || "0").replace(/[$,]/g, "")) || 0;

    // Solo motivos de venta/movimiento
    var esVenta = motivosVenta.some(function(m){ return motivo.includes(m); });
    if (!esVenta || monto <= 0) return;

    var cKey = coord.includes("TELLO") ? "TELLO" : coord.includes("CRISTIAN") || coord.includes("ZUÑIGA") || coord.includes("ZUNIGA") ? "CRISTIAN" : coord.includes("JULIO") || coord.includes("HERNANDEZ") ? "JULIO" : null;
    if (!cKey) return;

    // Hoy
    if (fecha === today) {
      ventaHoy[cKey] += monto;
      ventaHoy.TOTAL += monto;
    }

    // Semana
    if (weekDates.indexOf(fecha) !== -1) {
      ventaSemana[cKey] += monto;
      ventaSemana.TOTAL += monto;
      if (!ventaPorDia[fecha]) ventaPorDia[fecha] = { TELLO:0, CRISTIAN:0, JULIO:0, TOTAL:0 };
      ventaPorDia[fecha][cKey] += monto;
      ventaPorDia[fecha].TOTAL += monto;
    }
  });

  // Armar días de la semana en orden
  var diasSemana = weekDates.map(function(fecha){
    var d = ventaPorDia[fecha] || {TELLO:0,CRISTIAN:0,JULIO:0,TOTAL:0};
    return {
      fecha: fecha,
      dia: ["Dom","Lun","Mar","Mie","Jue","Vie","Sab"][new Date(fecha).getDay()],
      TELLO: d.TELLO, CRISTIAN: d.CRISTIAN, JULIO: d.JULIO, TOTAL: d.TOTAL
    };
  });

  return {
    hoy: ventaHoy,
    semana: ventaSemana,
    semanaNum: weekNum,
    diasSemana: diasSemana,
    meta: META_SEMANAL,
    cumplimientoTello:    META_SEMANAL["JUAN JOSE TELLO"] > 0 ? (ventaSemana.TELLO / META_SEMANAL["JUAN JOSE TELLO"] * 100).toFixed(1) : "0",
    cumplimientoCristian: META_SEMANAL["CRISTIAN ZUÑIGA"] > 0 ? (ventaSemana.CRISTIAN / META_SEMANAL["CRISTIAN ZUÑIGA"] * 100).toFixed(1) : "0",
    cumplimientoJulio:    META_SEMANAL["JULIO HERNANDEZ"] > 0 ? (ventaSemana.JULIO / META_SEMANAL["JULIO HERNANDEZ"] * 100).toFixed(1) : "0",
    cumplimientoTotal:    META_SEMANAL.TOTAL > 0 ? (ventaSemana.TOTAL / META_SEMANAL.TOTAL * 100).toFixed(1) : "0",
  };
}

// ── CALCULAR DIESEL DESDE CARGAS_DIESEL ───────────────────────────────
function calcDiesel(dieselRows, weekDates) {
  // CARGAS_DIESEL: buscamos columnas Fecha, Unidad/NumeroEconomico, Litros, PrecioPorLitro, Total
  var totalSemana = 0;
  var porUnidad = {};
  var porCoord = { TELLO:0, CRISTIAN:0, JULIO:0 };

  if (!dieselRows || dieselRows.length === 0) {
    return { totalSemana:0, porUnidad:{}, porCoord:porCoord, filas:0 };
  }

  // Detectar columnas (pueden variar)
  var sample = dieselRows[0] || {};
  var colFecha   = Object.keys(sample).find(function(k){ return k.toLowerCase().includes("fecha"); }) || "Fecha";
  var colUnidad  = Object.keys(sample).find(function(k){ return k.toLowerCase().includes("unidad")||k.toLowerCase().includes("economico"); }) || "Unidad";
  var colLitros  = Object.keys(sample).find(function(k){ return k.toLowerCase().includes("litro")||k.toLowerCase().includes("total"); }) || "Litros";
  var colPrecio  = Object.keys(sample).find(function(k){ return k.toLowerCase().includes("precio")||k.toLowerCase().includes("monto"); }) || "Precio";

  dieselRows.forEach(function(r){
    var fecha = String(r[colFecha] || "").slice(0, 10);
    if (weekDates.indexOf(fecha) === -1) return;

    var unidad = String(r[colUnidad] || "").trim();
    var litros = parseFloat(String(r[colLitros] || "0").replace(/[$,]/g, "")) || 0;
    var precio = parseFloat(String(r[colPrecio] || "0").replace(/[$,]/g, "")) || 0;
    var costoDiesel = litros > 0 && precio > 0 ? litros * precio : litros; // si precio no está, usa litros como costo

    if (costoDiesel <= 0) return;
    totalSemana += costoDiesel;
    porUnidad[unidad] = (porUnidad[unidad] || 0) + costoDiesel;
  });

  return { totalSemana: totalSemana, porUnidad: porUnidad, porCoord: porCoord, filas: dieselRows.length };
}

// ── CALCULAR KM/L DESDE RENDIMIENTOS ─────────────────────────────────
function calcKML(rendRows, weekDates) {
  // RENDIMIENTOS tiene: Fecha Registro, Numero Economico, RendimientoKmLt, Clasificacion
  var porUnidad = {};
  if (!rendRows || rendRows.length === 0) return porUnidad;

  rendRows.forEach(function(r){
    var fecha = String(r["Fecha Registro"] || r["FechaRegistro"] || "").slice(0, 10);
    if (weekDates.indexOf(fecha) === -1) return;
    var unidad = String(r["Numero Economico"] || r["NumeroEconomico"] || "").trim();
    var kml = parseFloat(String(r["RendimientoKmLt"] || r["Rendimiento Calculado"] || "0").replace(/[$,]/g, "")) || 0;
    if (unidad && kml > 0) {
      if (!porUnidad[unidad]) porUnidad[unidad] = { vals:[], avg:0 };
      porUnidad[unidad].vals.push(kml);
    }
  });

  Object.keys(porUnidad).forEach(function(u){
    var vals = porUnidad[u].vals;
    porUnidad[u].avg = vals.length > 0 ? (vals.reduce(function(a,b){return a+b;},0) / vals.length).toFixed(2) : 0;
  });
  return porUnidad;
}

// ── CALCULAR MANTENIMIENTO DESDE ESTATUS_DIARIO ───────────────────────
function calcMantenimiento(estatusRows) {
  var hoy = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
  var resultado = {
    CP: [],   // Correctivo/Preventivo
    RM: [],   // Reparación Mayor
    SG: [],   // Siniestro/Garantía
    DSO: [],  // Disponible Sin Operador
    DCO: [],  // Disponible Con Operador
    SO: [],   // Sin Operador
    IND: [],  // Indisciplina
    PERM: [], // Permiso
    VTA: [],  // En Venta
    TRN: [],  // En Tránsito
    MOV: [],  // En Movimiento
    OTROS: [],
  };

  estatusRows.forEach(function(r){
    var fecha = String(r["Fecha"] || "").slice(0, 10);
    if (fecha !== hoy) return; // solo hoy
    var motivo = String(r["Motivo"] || "").toUpperCase();
    var unidad = r["Unidad"] || "";
    var operador = r["Operador"] || "—";
    var coord = r["Coordinador"] || "";
    var comentarios = r["Comentarios"] || "";
    var ruta = r["NombreRuta"] || "";
    var monto = parseFloat(String(r["Monto"] || "0").replace(/[$,]/g,"")) || 0;
    var obj = { unidad:unidad, operador:operador, coordinador:coord, motivo:r["Motivo"]||"", comentarios:comentarios, ruta:ruta, monto:monto };

    if (motivo.includes("CP") || motivo.includes("CORRECTIVO") || motivo.includes("PREVENTIVO")) resultado.CP.push(obj);
    else if (motivo.includes("RM") || motivo.includes("REPARACION")) resultado.RM.push(obj);
    else if (motivo.includes("SG") || motivo.includes("SINIESTRO") || motivo.includes("GARANTIA")) resultado.SG.push(obj);
    else if (motivo.includes("DSO") || (motivo.includes("DISPONIBLE") && motivo.includes("SIN"))) resultado.DSO.push(obj);
    else if (motivo.includes("DCO") || (motivo.includes("DISPONIBLE") && motivo.includes("CON"))) resultado.DCO.push(obj);
    else if (motivo.includes("SO") || (motivo.includes("SIN") && motivo.includes("OPERADOR"))) resultado.SO.push(obj);
    else if (motivo.includes("IND") || motivo.includes("INDISCIPLINA")) resultado.IND.push(obj);
    else if (motivo.includes("PERM") || motivo.includes("PERMISO")) resultado.PERM.push(obj);
    else if (motivo.includes("VTA") || motivo.includes("FACTURANDO")) resultado.VTA.push(obj);
    else if (motivo.includes("TRN") || motivo.includes("TRANSITO")) resultado.TRN.push(obj);
    else if (motivo.includes("MOV") || motivo.includes("MOVIMIENTO")) resultado.MOV.push(obj);
    else resultado.OTROS.push(obj);
  });

  return resultado;
}

// ── CALCULAR UTILIDAD (solo con datos reales) ─────────────────────────
function calcUtilidad(ventaHoy, estatusHoy, dieselSemana, kmlMap) {
  // Solo calcular si hay venta real
  if (ventaHoy.TOTAL <= 0) return { posible: false, mensaje: "Sin venta registrada hoy" };

  // Costos disponibles en Estatus_diario: km_vacios, casetas desde VIAJES
  // Por ahora calculamos con lo disponible
  var costoDieselEst = dieselSemana.totalSemana || 0; // total semana como proxy

  var resultado = {
    posible: true,
    ventaTotal: ventaHoy.TOTAL,
    costoDiesel: costoDieselEst,
    utilidad: ventaHoy.TOTAL - costoDieselEst,
    nota: "Diesel semana / Venta hoy. Actualizar con costos completos cuando estén disponibles.",
    porCoord: {
      TELLO:    { venta: ventaHoy.TELLO,    costo: 0, utilidad: ventaHoy.TELLO },
      CRISTIAN: { venta: ventaHoy.CRISTIAN, costo: 0, utilidad: ventaHoy.CRISTIAN },
      JULIO:    { venta: ventaHoy.JULIO,    costo: 0, utilidad: ventaHoy.JULIO },
    }
  };
  return resultado;
}

// ── CALCULAR UTILIZACIÓN DE FLOTA Y CAJAS ────────────────────────────
function calcUtilizacion(estatusHoy, cajasRows) {
  var totalTractos = estatusHoy.length;
  var enMovimiento = estatusHoy.filter(function(r){
    var m = String(r["Motivo"]||"").toUpperCase();
    return m.includes("VTA") || m.includes("TRN") || m.includes("MOV");
  }).length;

  var totalCajas = cajasRows.length;
  var cajasCargadas = cajasRows.filter(function(c){ return String(c["Estatus"]||"").toLowerCase() === "cargada"; }).length;

  return {
    tractos: { total: totalTractos, operando: enMovimiento, pct: totalTractos > 0 ? ((enMovimiento/totalTractos)*100).toFixed(1) : "0" },
    cajas: { total: totalCajas, cargadas: cajasCargadas, pct: totalCajas > 0 ? ((cajasCargadas/totalCajas)*100).toFixed(1) : "0" },
  };
}

// ── GET principal ─────────────────────────────────────────────────────
function doGet(e) {
  try {
    var tab = e.parameter.tab || "VIAJES";
    var headerMap = {
      "VIAJES": 2,
      "Estatus_diario": 1,
      "Control_Cajas": 2,
      "CATALOGO_UNIDADES": 2,
      "CATALOGO_OPERADORES": 2,
      "RENDIMIENTOS": 2,
      "Circuito": 1,
      "CLIENTES": 1,
      "CONTROL_OPERADORES": 4,
      "CARGAS_DIESEL": 2,
      "MANTENIMIENTO": 2,
      "ALERTAS_OPERATIVAS": 4,
      "Gastos": 1,
    };

    // Tab especial: dashboard_resumen — calcula todo en un solo llamado
    if (tab === "dashboard_resumen") {
      var weekDates = getCurrentWeekDates();
      var estatusRows = readTab(SHEET.estatus, 1);
      var cajasRows   = readTab(SHEET.cajas, 2);
      var rendRows    = readTab(SHEET.rendimientos, 2);
      var dieselRows  = readTab(SHEET.diesel, 2);
      var gastosRows  = [];
      try { gastosRows = readTab(SHEET.gastos, 1); } catch(ex) {}

      var ventas      = calcVentas(estatusRows);
      var diesel      = calcDiesel(dieselRows, weekDates);
      var kmlMap      = calcKML(rendRows, weekDates);
      var mant        = calcMantenimiento(estatusRows);
      var utilidad    = calcUtilidad(ventas.hoy, estatusRows, diesel, kmlMap);
      var utilizacion = calcUtilizacion(estatusRows.filter(function(r){
        return String(r["Fecha"]||"").slice(0,10) === Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
      }), cajasRows);

      // Gastos totales semana (si ya existe la pestaña)
      var gastosTotal = 0;
      gastosRows.forEach(function(g){
        var fecha = String(g["Fecha"]||g["fecha"]||"").slice(0,10);
        if (weekDates.indexOf(fecha) !== -1) {
          gastosTotal += parseFloat(String(g["Monto"]||g["monto"]||g["Importe"]||"0").replace(/[$,]/g,"")) || 0;
        }
      });

      return ContentService.createTextOutput(JSON.stringify({
        ok: true,
        tab: "dashboard_resumen",
        ventas: ventas,
        diesel: { totalSemana: diesel.totalSemana, filas: diesel.filas },
        kmlPorUnidad: kmlMap,
        mantenimiento: mant,
        utilidad: utilidad,
        utilizacion: utilizacion,
        gastosTotal: gastosTotal,
        weekDates: weekDates,
        meta: META_SEMANAL,
        generado: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm"),
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // Tab especial: mantenimiento_detalle
    if (tab === "mantenimiento_detalle") {
      var estatusRows2 = readTab(SHEET.estatus, 1);
      var mantRows = [];
      try { mantRows = readTab(SHEET.mantenimiento, 2); } catch(ex) {}
      var mant2 = calcMantenimiento(estatusRows2);
      return ContentService.createTextOutput(JSON.stringify({
        ok: true,
        tab: "mantenimiento_detalle",
        hoy: mant2,
        mantHistorico: mantRows.slice(0, 100),
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // Lectura estándar
    var hdr = headerMap[tab] || 2;
    var rows = readTab(tab, hdr);
    return ContentService.createTextOutput(JSON.stringify({ ok: true, tab: tab, count: rows.length, data: rows }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch(err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: err.toString(), stack: err.stack || "" }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ── POST: la app envía actualizaciones ────────────────────────────────
function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents);
    var tab = payload.tab;
    var rows = payload.rows || [];
    var action = payload.action || "replace";
    var headerMap = {
      "VIAJES":2, "Estatus_diario":1, "Control_Cajas":2,
      "CATALOGO_UNIDADES":2, "RENDIMIENTOS":2, "CARGAS_DIESEL":2,
      "MANTENIMIENTO":2, "Gastos":1, "CONTROL_OPERADORES":4,
    };
    var hdr = headerMap[tab] || 2;
    if (action === "replace" && rows.length > 0) writeTab(tab, hdr, rows);
    // También actualizar meta si se envía
    if (payload.meta) {
      META_SEMANAL = payload.meta;
    }
    return ContentService.createTextOutput(JSON.stringify({ ok: true, written: rows.length, tab: tab }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch(err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
