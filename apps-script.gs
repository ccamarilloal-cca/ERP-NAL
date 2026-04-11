// ═══════════════════════════════════════════════════════════════════════
//  GOOGLE APPS SCRIPT v7 — ERP NAL
//  Archivo: sistema_logistico.xlsx (Google Sheets)
//
//  CORRECCIONES v7:
//  [2]  Utilización: solo 78 unidades activas, muestra total real
//  [3]  Venta/Día: datos enriquecidos para gráfica por coordinador
//  [4]  Diesel S15: filtrado a 78 unidades activas; cruce con VIAJES
//  [5]  Tracker: ciudad destino, tiempos, campo Entregado, alertas
//  [7]  Unidades: 78 tractos / 130 cajas, sin duplicados
//  [8]  Mantenimiento: solo CP/SG/SM reales; muestra comentarios
//  [9]  Estatus operativo: DCO/DSO/SO correctamente clasificados
//  [10] Comentarios: resaltados
//  [11] Cajas: contador total
//  [12] Viajes: fechas desglosadas + OTIF
//  [13] Alertas: acción sugerida
//  [14] Dashboard entregas vencidas: dinámico con circuito/coord/%
// ═══════════════════════════════════════════════════════════════════════

// ── NOMBRES EXACTOS DE PESTAÑAS ────────────────────────────────────────
var SHEET = {
  viajes:        "VIAJES",
  estatus:       "Estatus_diario",
  cajas:         "Control_Cajas",
  unidades:      "CATALOGO_UNIDADES",
  operadores:    "CATALOGO_OPERADORES",
  rendimientos:  "RENDIMIENTOS",
  circuitos:     "Circuito",
  clientes:      "CLIENTES",
  control_op:    "CONTROL_OPERADORES",
  diesel:        "CARGAS_DIESEL",
  mantenimiento: "MANTENIMIENTO",
  gastos:        "Gastos",
  alertas_sh:    "ALERTAS_OPERATIVAS",
};

// ── META SEMANAL ────────────────────────────────────────────────────────
var META_SEMANAL = {
  "JUAN JOSE TELLO":  500000,
  "CRISTIAN ZUÑIGA":  450000,
  "JULIO HERNANDEZ":  350000,
  TOTAL:             1300000,
};

// ── FLOTA REAL: solo estas 78 unidades activas ──────────────────────────
// Ajusta esta lista para que coincida exactamente con tu catálogo
var UNIDADES_ACTIVAS_78 = null; // se carga dinámicamente desde CATALOGO_UNIDADES

// ── HELPER: Obtiene las 78 unidades activas desde el catálogo ───────────
function getUnidadesActivas() {
  if (UNIDADES_ACTIVAS_78 !== null) return UNIDADES_ACTIVAS_78;
  var rows = readTab(SHEET.unidades, 2);
  // Filtra tractos activos: columna Tipo = "Tracto" o similar y Estatus != "Baja"
  var set = {};
  rows.forEach(function(r) {
    var num = String(r["Numero Economico"] || r["NumeroEconomico"] || r["Unidad"] || "").trim();
    var tipo = String(r["Tipo"] || "").toUpperCase();
    var est  = String(r["Estatus"] || r["Status"] || "").toUpperCase();
    if (!num) return;
    // Excluir bajas; si no hay columna tipo, incluir todo
    if (est.includes("BAJA") || est.includes("INACTIV")) return;
    // Solo tractos (no cajas)
    if (tipo && (tipo.includes("CAJA") || tipo.includes("REMOLQUE") || tipo.includes("SEMI"))) return;
    set[num] = true;
  });
  UNIDADES_ACTIVAS_78 = set;
  return set;
}

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

// ── HELPER: Formato fecha ─────────────────────────────────────────────
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

// ── DÍAS DE LA SEMANA ACTUAL ──────────────────────────────────────────
function getCurrentWeekDates() {
  var today = new Date();
  var day = today.getDay();
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

// ── [FIX #2 / #9] OBTENER ESTATUS HOY desde hoja (fecha más reciente por unidad) ───
// Retorna array con UNA fila por unidad (la más reciente)
function getEstatusHoyDeduplicado(estatusRows) {
  var hoy = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
  // Mapa unidad -> fila más reciente
  var porUnidad = {};
  estatusRows.forEach(function(r) {
    var fecha = String(r["Fecha"] || "").slice(0, 10);
    var unidad = String(r["Unidad"] || "").trim();
    if (!unidad) return;
    // Tomar la fila con fecha más reciente; si hay empate, la última
    if (!porUnidad[unidad] || fecha >= String(porUnidad[unidad]["Fecha"] || "").slice(0, 10)) {
      porUnidad[unidad] = r;
    }
  });
  return Object.values(porUnidad);
}

// ── [FIX #2] CALCULAR UTILIZACIÓN DE FLOTA (78 unidades reales) ───────
// Motivos activos: VTA, TRN, MOV
function calcUtilizacion(estatusRows, cajasRows) {
  // Obtener snapshot más reciente de cada unidad
  var snapshot = getEstatusHoyDeduplicado(estatusRows);

  // [FIX] Filtrar solo unidades del catálogo activo (78 tractos)
  var activas = getUnidadesActivas();
  var tieneActivas = Object.keys(activas).length > 0;

  var tractosFiltrados = tieneActivas
    ? snapshot.filter(function(r) { return activas[String(r["Unidad"] || "").trim()]; })
    : snapshot;

  var totalTractos = tractosFiltrados.length;

  var enMovimiento = tractosFiltrados.filter(function(r) {
    var m = String(r["Motivo"] || "").toUpperCase();
    return m.includes("VTA") || m.includes("TRN") || m.includes("MOV");
  }).length;

  // [FIX] Cajas: deduplicar por número de caja
  var cajasVistas = {};
  var cajasUnicas = (cajasRows || []).filter(function(c) {
    var num = String(c["Caja"] || "").trim();
    if (!num || cajasVistas[num]) return false;
    cajasVistas[num] = true;
    return true;
  });
  var totalCajas = cajasUnicas.length;
  var cajasCargadas = cajasUnicas.filter(function(c) {
    return String(c["Estatus"] || "").toLowerCase() === "cargada";
  }).length;

  return {
    tractos: {
      total: totalTractos,           // [FIX] muestra total real considerado
      operando: enMovimiento,
      pct: totalTractos > 0 ? ((enMovimiento / totalTractos) * 100).toFixed(1) : "0",
      label: totalTractos + " unidades activas"   // [FIX] para visibilidad
    },
    cajas: {
      total: totalCajas,
      cargadas: cajasCargadas,
      pct: totalCajas > 0 ? ((cajasCargadas / totalCajas) * 100).toFixed(1) : "0",
    },
  };
}

// ── [FIX #3] CALCULAR VENTA ─────────────────────────────────────────────
// Incluye datos enriquecidos para gráfica de tendencia por coordinador
function calcVentas(estatusRows) {
  var today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
  var weekDates = getCurrentWeekDates();
  var weekNum = getWeekNumber(today);
  var motivosVenta = ["VTA", "TRN", "MOV"];

  var ventaHoy = { TELLO: 0, CRISTIAN: 0, JULIO: 0, TOTAL: 0 };
  var ventaSemana = { TELLO: 0, CRISTIAN: 0, JULIO: 0, TOTAL: 0 };
  var ventaPorDia = {};

  estatusRows.forEach(function(r) {
    var fecha = String(r["Fecha"] || "").slice(0, 10);
    var motivo = String(r["Motivo"] || "").toUpperCase();
    var coord = String(r["Coordinador"] || "").toUpperCase();
    var monto = parseFloat(String(r["Monto"] || "0").replace(/[$,]/g, "")) || 0;

    var esVenta = motivosVenta.some(function(m){ return motivo.includes(m); });
    if (!esVenta || monto <= 0) return;

    var cKey = coord.includes("TELLO") ? "TELLO"
      : (coord.includes("CRISTIAN") || coord.includes("ZUÑIGA") || coord.includes("ZUNIGA")) ? "CRISTIAN"
      : (coord.includes("JULIO") || coord.includes("HERNANDEZ")) ? "JULIO"
      : null;
    if (!cKey) return;

    if (fecha === today) { ventaHoy[cKey] += monto; ventaHoy.TOTAL += monto; }
    if (weekDates.indexOf(fecha) !== -1) {
      ventaSemana[cKey] += monto;
      ventaSemana.TOTAL += monto;
      if (!ventaPorDia[fecha]) ventaPorDia[fecha] = { TELLO:0, CRISTIAN:0, JULIO:0, TOTAL:0 };
      ventaPorDia[fecha][cKey] += monto;
      ventaPorDia[fecha].TOTAL += monto;
    }
  });

  // [FIX #3] Armar series para gráfica de tendencia por coordinador
  var diasSemana = weekDates.map(function(fecha) {
    var d = ventaPorDia[fecha] || { TELLO:0, CRISTIAN:0, JULIO:0, TOTAL:0 };
    var dia = ["Dom","Lun","Mar","Mie","Jue","Vie","Sab"][new Date(fecha).getDay()];
    return { fecha: fecha, dia: dia, TELLO: d.TELLO, CRISTIAN: d.CRISTIAN, JULIO: d.JULIO, TOTAL: d.TOTAL };
  });

  // [FIX #3] Series separadas para chart de línea por coordinador
  var seriesChart = {
    labels: diasSemana.map(function(d) { return d.dia; }),
    TELLO:    diasSemana.map(function(d) { return d.TELLO; }),
    CRISTIAN: diasSemana.map(function(d) { return d.CRISTIAN; }),
    JULIO:    diasSemana.map(function(d) { return d.JULIO; }),
    TOTAL:    diasSemana.map(function(d) { return d.TOTAL; }),
  };

  return {
    hoy: ventaHoy,
    semana: ventaSemana,
    semanaNum: weekNum,
    diasSemana: diasSemana,
    seriesChart: seriesChart,    // [NUEVO] datos para gráfica de línea
    meta: META_SEMANAL,
    cumplimientoTello:    META_SEMANAL["JUAN JOSE TELLO"] > 0 ? (ventaSemana.TELLO / META_SEMANAL["JUAN JOSE TELLO"] * 100).toFixed(1) : "0",
    cumplimientoCristian: META_SEMANAL["CRISTIAN ZUÑIGA"] > 0 ? (ventaSemana.CRISTIAN / META_SEMANAL["CRISTIAN ZUÑIGA"] * 100).toFixed(1) : "0",
    cumplimientoJulio:    META_SEMANAL["JULIO HERNANDEZ"] > 0 ? (ventaSemana.JULIO / META_SEMANAL["JULIO HERNANDEZ"] * 100).toFixed(1) : "0",
    cumplimientoTotal:    META_SEMANAL.TOTAL > 0 ? (ventaSemana.TOTAL / META_SEMANAL.TOTAL * 100).toFixed(1) : "0",
  };
}

// ── [FIX #4] CALCULAR DIESEL — Solo 78 unidades activas ───────────────
// Cruza con VIAJES para obtener: últimos movimientos, costo, operador
function calcDiesel(dieselRows, weekDates, viajesRows) {
  var totalSemana = 0;
  var porUnidad = {};
  var detalle = []; // [NUEVO] para rendimiento por viaje

  if (!dieselRows || dieselRows.length === 0) {
    return { totalSemana:0, porUnidad:{}, detalle:[], filas:0 };
  }

  // [FIX] Solo unidades activas del catálogo
  var activas = getUnidadesActivas();
  var tieneActivas = Object.keys(activas).length > 0;

  // Detectar columnas
  var sample = dieselRows[0] || {};
  var colFecha   = Object.keys(sample).find(function(k){ return k.toLowerCase().includes("fecha"); }) || "Fecha";
  var colUnidad  = Object.keys(sample).find(function(k){ return k.toLowerCase().includes("unidad") || k.toLowerCase().includes("economico"); }) || "Unidad";
  var colLitros  = Object.keys(sample).find(function(k){ return k.toLowerCase().includes("litro"); }) || "Litros";
  var colPrecio  = Object.keys(sample).find(function(k){ return k.toLowerCase().includes("precio"); }) || "Precio";
  var colTotal   = Object.keys(sample).find(function(k){ return k.toLowerCase().includes("total") || k.toLowerCase().includes("costo"); }) || "Total";
  var colOper    = Object.keys(sample).find(function(k){ return k.toLowerCase().includes("operador"); }) || "Operador";

  // [FIX #4] Construir mapa de últimos movimientos por unidad desde VIAJES
  var ultimoViaje = {};
  if (viajesRows && viajesRows.length > 0) {
    viajesRows.forEach(function(v) {
      var unidad = String(v["Unidad"] || "").trim();
      var fechaViaje = String(v["Fecha"] || v["Fecha salida"] || "").slice(0, 10);
      if (!unidad || !fechaViaje) return;
      if (!ultimoViaje[unidad] || fechaViaje > ultimoViaje[unidad].fecha) {
        ultimoViaje[unidad] = {
          fecha: fechaViaje,
          operador: v["Operador"] || "",
          circuito: v["Circuito"] || "",
          origen: v["Origen"] || "",
          destino: v["Destino"] || "",
          km: parseFloat(String(v["Km cargados"] || "0").replace(/[$,]/g,"")) || 0,
        };
      }
    });
  }

  dieselRows.forEach(function(r) {
    var fecha  = String(r[colFecha] || "").slice(0, 10);
    var unidad = String(r[colUnidad] || "").trim();

    // [FIX] Filtrar a solo unidades activas
    if (tieneActivas && !activas[unidad]) return;
    if (weekDates.indexOf(fecha) === -1) return;

    var litros = parseFloat(String(r[colLitros] || "0").replace(/[$,]/g, "")) || 0;
    var precio = parseFloat(String(r[colPrecio] || "0").replace(/[$,]/g, "")) || 0;
    var total  = parseFloat(String(r[colTotal]  || "0").replace(/[$,]/g, "")) || 0;
    var operador = r[colOper] || (ultimoViaje[unidad] ? ultimoViaje[unidad].operador : "");

    var costo = total > 0 ? total : (litros > 0 && precio > 0 ? litros * precio : litros);
    if (costo <= 0) return;

    totalSemana += costo;
    if (!porUnidad[unidad]) porUnidad[unidad] = { costo:0, litros:0, operador:"" };
    porUnidad[unidad].costo    += costo;
    porUnidad[unidad].litros   += litros;
    porUnidad[unidad].operador  = operador;

    // [FIX #4] Calcular rendimiento por viaje
    var ult = ultimoViaje[unidad] || {};
    var rendimiento = (litros > 0 && ult.km > 0) ? (ult.km / litros).toFixed(2) : null;

    detalle.push({
      unidad:      unidad,
      fecha:       fecha,
      operador:    operador,
      litros:      litros,
      costo:       costo,
      circuito:    ult.circuito || "",
      origen:      ult.origen || "",
      destino:     ult.destino || "",
      km:          ult.km || 0,
      rendimiento: rendimiento,  // km/l por viaje
    });
  });

  return {
    totalSemana: totalSemana,
    porUnidad:   porUnidad,
    detalle:     detalle,        // [NUEVO] rendimiento por viaje
    filas:       Object.keys(porUnidad).length, // [FIX] solo unidades activas
    totalUnidades: Object.keys(porUnidad).length,
  };
}

// ── [FIX #8] CALCULAR MANTENIMIENTO ────────────────────────────────────
// Solo unidades con estatus REAL de mantenimiento: CP, SG, SM
// NO incluye unidades en ruta (LIB, VTA, TRN, MOV, DCO, DSO)
function calcMantenimiento(estatusRows) {
  var snapshot = getEstatusHoyDeduplicado(estatusRows);

  var resultado = {
    CP:   [],   // Correctivo/Preventivo
    SG:   [],   // Siniestro/Garantía
    SM:   [],   // [FIX] Servicio de Mantenimiento (antes RM)
    DSO:  [],   // Disponible Sin Operador  [FIX #9]
    DCO:  [],   // Disponible Con Operador  [FIX #9]
    SO:   [],   // Sin Operador / Con Problema  [FIX #9]
    IND:  [],   // Indisciplina
    PERM: [],   // Permiso
    VTA:  [],
    TRN:  [],
    MOV:  [],
    LIB:  [],
    OTROS:[],
  };

  snapshot.forEach(function(r) {
    var motivo = String(r["Motivo"] || "").toUpperCase();
    var estatus = String(r["Estatus"] || "").toUpperCase();
    var comentarios = r["Comentarios"] || "";
    var obj = {
      unidad:      r["Unidad"] || "",
      operador:    r["Operador"] || "—",
      coordinador: r["Coordinador"] || "",
      motivo:      r["Motivo"] || "",
      comentarios: comentarios,    // [FIX #8] Incluir comentarios
      ruta:        r["NombreRuta"] || "",
      monto:       parseFloat(String(r["Monto"] || "0").replace(/[$,]/g,"")) || 0,
    };

    // [FIX #8] Solo clasificar como mantenimiento si el motivo es CP/SG/SM
    // Evita incluir unidades "en ruta" o "por liberar"
    if (motivo.includes("CP") || motivo.includes("CORRECTIVO") || motivo.includes("PREVENTIVO")) {
      resultado.CP.push(obj);
    } else if (motivo.includes("SG") || motivo.includes("SINIESTRO") || motivo.includes("GARANTIA") || motivo.includes("GARANTÍA")) {
      resultado.SG.push(obj);
    } else if (motivo.includes("SM") || motivo.includes("SERV") || motivo.includes("RM") || motivo.includes("REPARACION") || motivo.includes("REPARACIÓN")) {
      resultado.SM.push(obj);
    } else if (motivo.includes("DSO") || (motivo.includes("DISPONIBLE") && motivo.includes("SIN"))) {
      // [FIX #9] DCO/DSO existen, no deben mostrar 0
      resultado.DSO.push(obj);
    } else if (motivo.includes("DCO") || (motivo.includes("DISPONIBLE") && motivo.includes("CON"))) {
      resultado.DCO.push(obj);
    } else if (
      // [FIX #9] SO = unidades con PROBLEMA, no solo "sin operador" textual
      motivo.includes("SO") && !motivo.includes("DSO") && !motivo.includes("DCO") ||
      estatus.includes("CON PROBLEMA") || estatus.includes("PROBLEMA") ||
      motivo.includes("SIN OPERADOR")
    ) {
      resultado.SO.push(obj);
    } else if (motivo.includes("IND") || motivo.includes("INDISCIPLINA")) {
      resultado.IND.push(obj);
    } else if (motivo.includes("PERM") || motivo.includes("PER ") || motivo === "PER") {
      // [FIX #8] PERM ≠ mantenimiento — no los confundas con CP/SG/SM
      resultado.PERM.push(obj);
    } else if (motivo.includes("VTA")) { resultado.VTA.push(obj);
    } else if (motivo.includes("TRN")) { resultado.TRN.push(obj);
    } else if (motivo.includes("MOV")) { resultado.MOV.push(obj);
    } else if (motivo.includes("LIB")) { resultado.LIB.push(obj);
    } else { resultado.OTROS.push(obj); }
  });

  return resultado;
}

// ── CALCULAR KM/L DESDE RENDIMIENTOS ─────────────────────────────────
function calcKML(rendRows, weekDates) {
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
    porUnidad[u].avg = vals.length > 0 ? (vals.reduce(function(a,b){ return a+b; }, 0) / vals.length).toFixed(2) : 0;
  });
  return porUnidad;
}

// ── [FIX #12] CALCULAR VIAJES CON OTIF ────────────────────────────────
// OTIF: On Time In Full
function calcOTIF(viajesRows) {
  if (!viajesRows || viajesRows.length === 0) {
    return { total:0, onTime:0, late:0, pct:"0", detalle:[] };
  }

  var total = 0, onTime = 0, late = 0;
  var detalle = [];

  viajesRows.forEach(function(v) {
    // Solo viajes terminados/entregados para calcular OTIF
    var est = String(v["Estatus viaje"] || v["Estatus"] || "").toLowerCase();
    var esTerminado = est.includes("entregad") || est.includes("terminad") || est.includes("finaliz") || est.includes("complet");
    if (!esTerminado) return;

    total++;

    // Fechas clave
    var fechaEntregaProg = String(v["Cita descarga"] || v["Fecha descarga"] || v["FechaEntregaProg"] || "").slice(0, 10);
    var fechaEntregaReal = String(v["Fecha entrega"] || v["FechaEntregaReal"] || v["Fecha real entrega"] || "").slice(0, 10);
    var motivo = v["Comentarios"] || v["MotivoIncumplimiento"] || "";

    var cumple = false;
    if (fechaEntregaProg && fechaEntregaReal) {
      cumple = fechaEntregaReal <= fechaEntregaProg;
    } else if (fechaEntregaProg && !fechaEntregaReal) {
      // Si no hay fecha real, se asume incumplido
      cumple = false;
    } else {
      cumple = true; // Sin fechas definidas, no se penaliza
    }

    if (cumple) onTime++; else late++;

    detalle.push({
      id:          v["Referencia / ID"] || "",
      unidad:      v["Unidad"] || "",
      coordinador: v["Coordinador"] || "",
      circuito:    v["Circuito"] || "",
      cliente:     v["Cliente"] || "",
      cumple:      cumple ? "Sí" : "No",
      fechaProg:   fechaEntregaProg,
      fechaReal:   fechaEntregaReal,
      motivo:      cumple ? "" : motivo,
    });
  });

  return {
    total:   total,
    onTime:  onTime,
    late:    late,
    pct:     total > 0 ? ((onTime / total) * 100).toFixed(1) : "0",
    detalle: detalle,
  };
}

// ── [FIX #14] CALCULAR ENTREGAS VENCIDAS DETALLADO ────────────────────
function calcEntregasVencidas(viajesRows) {
  var hoy = new Date(); hoy.setHours(0,0,0,0);
  var vencidas = [];
  var aTiempo  = [];

  (viajesRows || []).forEach(function(v) {
    var est = String(v["Estatus viaje"] || v["Estatus"] || "").toLowerCase();
    var esTerminado = est.includes("entregad") || est.includes("terminad") || est.includes("finaliz") || est.includes("complet");
    if (esTerminado) return;

    var fechaProg = String(v["Cita descarga"] || v["Fecha descarga"] || "").slice(0, 10);
    if (!fechaProg) return;

    var prog = new Date(fechaProg); if(isNaN(prog)) return; prog.setHours(0,0,0,0);
    var diff = Math.floor((prog - hoy) / 86400000);

    var item = {
      id:          v["Referencia / ID"] || "",
      unidad:      v["Unidad"] || "",
      coordinador: v["Coordinador"] || "",
      circuito:    v["Circuito"] || "",
      cliente:     v["Cliente"] || "",
      destino:     v["Destino"] || "",
      fechaProg:   fechaProg,
      diasVencido: diff < 0 ? Math.abs(diff) : 0,
    };

    if (diff < 0) vencidas.push(item);
    else aTiempo.push(item);
  });

  // Agrupar por coordinador
  var porCoord = {};
  vencidas.forEach(function(v) {
    var c = v.coordinador || "Otro";
    if (!porCoord[c]) porCoord[c] = { vencidas:0, aTiempo:0, total:0, pct:"0" };
    porCoord[c].vencidas++;
  });
  aTiempo.forEach(function(v) {
    var c = v.coordinador || "Otro";
    if (!porCoord[c]) porCoord[c] = { vencidas:0, aTiempo:0, total:0, pct:"0" };
    porCoord[c].aTiempo++;
  });
  Object.keys(porCoord).forEach(function(c) {
    var d = porCoord[c];
    d.total = d.vencidas + d.aTiempo;
    d.pct   = d.total > 0 ? ((d.aTiempo / d.total) * 100).toFixed(1) : "0";
  });

  var totalViajes = vencidas.length + aTiempo.length;
  return {
    vencidas:   vencidas,
    aTiempo:    aTiempo,
    porCoord:   porCoord,
    totalVencidas: vencidas.length,
    totalaTiempo:  aTiempo.length,
    pctCumplimiento: totalViajes > 0 ? ((aTiempo.length / totalViajes) * 100).toFixed(1) : "0",
  };
}

// ── [FIX #13] CALCULAR ALERTAS CON ACCIÓN SUGERIDA ────────────────────
function calcAlertas(estatusRows, viajesRows, cajasRows) {
  var hoy = new Date(); hoy.setHours(0,0,0,0);
  var snapshot = getEstatusHoyDeduplicado(estatusRows);
  var mant = calcMantenimiento(estatusRows);
  var alertas = [];

  // Alertas de mantenimiento
  mant.SG.forEach(function(e) {
    alertas.push({
      tipo:    "SG - Siniestro",
      unidad:  e.unidad,
      operador: e.operador,
      coord:   e.coordinador,
      desc:    e.comentarios || "Siniestro/Garantía activo",
      accion:  "Contactar al área de siniestros y aseguradora. Reasignar caja si aplica.",
      prioridad: "ALTA",
    });
  });
  mant.CP.forEach(function(e) {
    alertas.push({
      tipo:    "CP - Correctivo/Preventivo",
      unidad:  e.unidad,
      operador: e.operador,
      coord:   e.coordinador,
      desc:    e.comentarios || "En mantenimiento",
      accion:  "Revisar ETA de taller y programar siguiente viaje al liberar.",
      prioridad: "MEDIA",
    });
  });
  mant.IND.forEach(function(e) {
    alertas.push({
      tipo:    "IND - Indisciplina",
      unidad:  e.unidad,
      operador: e.operador,
      coord:   e.coordinador,
      desc:    e.comentarios || "Incidente de indisciplina",
      accion:  "Notificar a RRHH. Evaluar suspensión/reasignación del operador.",
      prioridad: "ALTA",
    });
  });
  mant.SO.forEach(function(e) {
    alertas.push({
      tipo:    "Sin Operador / Con Problema",
      unidad:  e.unidad,
      operador: "VACANTE",
      coord:   e.coordinador,
      desc:    e.comentarios || "Unidad sin operador asignado",
      accion:  "Asignar operador disponible desde CONTROL_OPERADORES.",
      prioridad: "MEDIA",
    });
  });

  // [FIX #5] Alertas de tracker: detenciones sospechosas (Huachicol / Gaseras externas)
  snapshot.forEach(function(r) {
    var ruta = String(r["NombreRuta"] || "").toLowerCase();
    var coment = String(r["Comentarios"] || "").toLowerCase();
    if (coment.includes("huachicol") || ruta.includes("huachicol")) {
      alertas.push({
        tipo:    "⚠️ Alerta Huachicol",
        unidad:  r["Unidad"] || "",
        operador: r["Operador"] || "",
        coord:   r["Coordinador"] || "",
        desc:    "Detención detectada en zona Huachicol: " + (r["NombreRuta"] || ""),
        accion:  "Verificar ubicación GPS inmediatamente. Contactar al operador.",
        prioridad: "CRÍTICA",
      });
    }
    if (coment.includes("gasera externa") || coment.includes("carga externa") || coment.includes("gasolinera") ) {
      alertas.push({
        tipo:    "⛽ Carga Diésel Externa",
        unidad:  r["Unidad"] || "",
        operador: r["Operador"] || "",
        coord:   r["Coordinador"] || "",
        desc:    "Carga de diésel en estación no autorizada detectada",
        accion:  "Solicitar comprobante de carga. Revisar rendimiento vs promedio.",
        prioridad: "ALTA",
      });
    }
  });

  // Alertas de entregas vencidas
  (viajesRows || []).forEach(function(v) {
    var est = String(v["Estatus viaje"] || "").toLowerCase();
    if (est.includes("entregad") || est.includes("terminad") || est.includes("finaliz")) return;
    var fechaProg = String(v["Cita descarga"] || v["Fecha descarga"] || "").slice(0, 10);
    if (!fechaProg) return;
    var prog = new Date(fechaProg); if(isNaN(prog)) return; prog.setHours(0,0,0,0);
    var diff = Math.floor((prog - hoy) / 86400000);
    if (diff < 0) {
      alertas.push({
        tipo:    "Entrega Vencida",
        unidad:  v["Unidad"] || "",
        operador: v["Operador"] || "",
        coord:   v["Coordinador"] || "",
        desc:    `${Math.abs(diff)}d vencida — ${v["Cliente"] || ""} ${v["Circuito"] || ""}`,
        accion:  "Coordinar entrega urgente con cliente. Actualizar estatus en VIAJES.",
        prioridad: "ALTA",
        cliente: v["Cliente"] || "",
        circuito: v["Circuito"] || "",
      });
    } else if (diff === 0) {
      alertas.push({
        tipo:    "Entrega Hoy",
        unidad:  v["Unidad"] || "",
        operador: v["Operador"] || "",
        coord:   v["Coordinador"] || "",
        desc:    `Entrega HOY — ${v["Destino"] || ""} — ${v["Cliente"] || ""}`,
        accion:  "Confirmar hora de descarga con cliente. Preparar documentación.",
        prioridad: "MEDIA",
      });
    }
  });

  // Alertas de cajas dañadas/perdidas
  (cajasRows || []).forEach(function(c) {
    var est = String(c["Estatus"] || "");
    if (est === "Dañada") {
      alertas.push({
        tipo: "Caja Dañada",
        unidad: "-",
        caja: c["Caja"] || "",
        coord: c["Coordinador"] || "",
        desc: (c["Ciudad / Ubicación"] || "") + " — " + (c["Comentarios"] || ""),
        accion: "Gestionar reparación con taller de carrocería. Documentar con fotos.",
        prioridad: "MEDIA",
      });
    }
    if (est === "No localizada") {
      alertas.push({
        tipo: "Caja Perdida",
        unidad: "-",
        caja: c["Caja"] || "",
        coord: c["Coordinador"] || "",
        desc: c["Comentarios"] || "No localizada",
        accion: "Activar protocolo de búsqueda. Notificar a seguros y autoridades si aplica.",
        prioridad: "CRÍTICA",
      });
    }
  });

  return alertas;
}

// ── [FIX #5] CALCULAR TRACKER DETALLADO ────────────────────────────────
function calcTracker(estatusRows, viajesRows) {
  var snapshot = getEstatusHoyDeduplicado(estatusRows);
  var enRuta = snapshot.filter(function(r) {
    var m = String(r["Motivo"] || "").toUpperCase();
    return m.includes("VTA") || m.includes("TRN") || m.includes("MOV");
  });

  // Mapa de último viaje por unidad para enriquecer tracker
  var viajeMap = {};
  (viajesRows || []).forEach(function(v) {
    var unidad = String(v["Unidad"] || "").trim();
    var fecha  = String(v["Fecha"] || v["Fecha salida"] || "").slice(0, 10);
    if (!unidad) return;
    if (!viajeMap[unidad] || fecha > viajeMap[unidad].fecha) {
      viajeMap[unidad] = {
        fecha:          fecha,
        fechaCarga:     String(v["Fecha carga"] || v["FechaCarga"] || "").slice(0, 10),
        fechaDescarga:  String(v["Fecha descarga"] || v["FechaDescarga"] || "").slice(0, 10),
        fechaEntrega:   String(v["Fecha entrega"] || v["FechaEntrega"] || v["Cita descarga"] || "").slice(0, 10),
        ciudadDestino:  v["Destino"] || "",  // [FIX #5]
        circuito:       v["Circuito"] || "",
        cliente:        v["Cliente"] || "",
        entregado:      false,
      };
    }
  });

  var resultado = enRuta.map(function(r) {
    var unidad = String(r["Unidad"] || "").trim();
    var ult = viajeMap[unidad] || {};

    // [FIX #5] Calcular tiempo desde salida
    var tiempoTranscurrido = null;
    if (ult.fecha) {
      var salida = new Date(ult.fecha);
      var ahora  = new Date();
      if (!isNaN(salida)) {
        var hrs = Math.floor((ahora - salida) / 3600000);
        tiempoTranscurrido = hrs + "h";
      }
    }

    return {
      unidad:          unidad,
      operador:        r["Operador"] || "—",
      coordinador:     r["Coordinador"] || "",
      motivo:          r["Motivo"] || "",
      ruta:            r["NombreRuta"] || "",
      monto:           parseFloat(String(r["Monto"] || "0").replace(/[$,]/g,"")) || 0,
      comentarios:     r["Comentarios"] || "",
      ciudadDestino:   ult.ciudadDestino || r["NombreRuta"] || "",  // [FIX #5]
      circuito:        ult.circuito || "",
      cliente:         ult.cliente || "",
      fechaSalida:     ult.fecha || "",          // [FIX #5]
      fechaCarga:      ult.fechaCarga || "",     // [FIX #5]
      fechaDescarga:   ult.fechaDescarga || "",  // [FIX #5]
      fechaEntrega:    ult.fechaEntrega || "",   // [FIX #5]
      tiempoTranscurrido: tiempoTranscurrido,    // [FIX #5]
      entregado:       false,                    // [FIX #5] campo editable en app
    };
  });

  return resultado;
}

// ── [FIX #7] CALCULAR UNIDADES SIN DUPLICADOS ──────────────────────────
function calcUnidades(catalogoRows, cajasRows) {
  // Tractos: solo tipo Tracto, sin duplicados por NumeroEconomico
  var tractoSet = {};
  var tractos = [];
  (catalogoRows || []).forEach(function(r) {
    var num  = String(r["Numero Economico"] || r["NumeroEconomico"] || "").trim();
    var tipo = String(r["Tipo"] || "").toUpperCase();
    var est  = String(r["Estatus"] || "").toUpperCase();
    if (!num || tractoSet[num]) return;
    if (est.includes("BAJA") || est.includes("INACTIV")) return;
    if (tipo && (tipo.includes("CAJA") || tipo.includes("REMOLQUE") || tipo.includes("SEMI"))) return;
    tractoSet[num] = true;
    tractos.push(r);
  });

  // Cajas: solo tipo Caja/Remolque, sin duplicados
  var cajaSet = {};
  var cajasUnicas = [];
  // Primero desde Control_Cajas
  (cajasRows || []).forEach(function(c) {
    var num = String(c["Caja"] || "").trim();
    if (!num || cajaSet[num]) return;
    cajaSet[num] = true;
    cajasUnicas.push(c);
  });

  return {
    tractos: {
      total: tractos.length,
      lista:  tractos,
    },
    cajas: {
      total: cajasUnicas.length,
      lista:  cajasUnicas,
    },
  };
}

// ── CALCULAR UTILIDAD ─────────────────────────────────────────────────
function calcUtilidad(ventaHoy, dieselSemana) {
  if (ventaHoy.TOTAL <= 0) return { posible: false, mensaje: "Sin venta registrada hoy" };
  var costoDieselEst = dieselSemana.totalSemana || 0;
  return {
    posible:     true,
    ventaTotal:  ventaHoy.TOTAL,
    costoDiesel: costoDieselEst,
    utilidad:    ventaHoy.TOTAL - costoDieselEst,
    nota:        "Diesel semana / Venta hoy. Actualizar con costos completos.",
    porCoord: {
      TELLO:    { venta: ventaHoy.TELLO,    costo: 0, utilidad: ventaHoy.TELLO },
      CRISTIAN: { venta: ventaHoy.CRISTIAN, costo: 0, utilidad: ventaHoy.CRISTIAN },
      JULIO:    { venta: ventaHoy.JULIO,    costo: 0, utilidad: ventaHoy.JULIO },
    }
  };
}

// ── GET PRINCIPAL ─────────────────────────────────────────────────────
function doGet(e) {
  try {
    var tab = e.parameter.tab || "VIAJES";
    var headerMap = {
      "VIAJES":               2,
      "Estatus_diario":       1,
      "Control_Cajas":        2,
      "CATALOGO_UNIDADES":    2,
      "CATALOGO_OPERADORES":  2,
      "RENDIMIENTOS":         2,
      "Circuito":             1,
      "CLIENTES":             1,
      "CONTROL_OPERADORES":   4,
      "CARGAS_DIESEL":        2,
      "MANTENIMIENTO":        2,
      "ALERTAS_OPERATIVAS":   4,
      "Gastos":               1,
    };

    // ── dashboard_resumen — todo en un solo llamado ──────────────────
    if (tab === "dashboard_resumen") {
      var weekDates   = getCurrentWeekDates();
      var estatusRows = readTab(SHEET.estatus, 1);
      var cajasRows   = readTab(SHEET.cajas, 2);
      var rendRows    = readTab(SHEET.rendimientos, 2);
      var dieselRows  = readTab(SHEET.diesel, 2);
      var viajesRows  = readTab(SHEET.viajes, 2);
      var catalogoRows = readTab(SHEET.unidades, 2);
      var gastosRows  = [];
      try { gastosRows = readTab(SHEET.gastos, 1); } catch(ex) {}

      var ventas      = calcVentas(estatusRows);
      var diesel      = calcDiesel(dieselRows, weekDates, viajesRows);  // [FIX #4]
      var kmlMap      = calcKML(rendRows, weekDates);
      var mant        = calcMantenimiento(estatusRows);                 // [FIX #8]
      var utilidad    = calcUtilidad(ventas.hoy, diesel);
      var utilizacion = calcUtilizacion(estatusRows, cajasRows);        // [FIX #2]
      var otif        = calcOTIF(viajesRows);                           // [FIX #12]
      var entregasVenc = calcEntregasVencidas(viajesRows);              // [FIX #14]
      var alertas     = calcAlertas(estatusRows, viajesRows, cajasRows); // [FIX #13]
      var tracker     = calcTracker(estatusRows, viajesRows);           // [FIX #5]
      var unidades    = calcUnidades(catalogoRows, cajasRows);          // [FIX #7]

      var gastosTotal = 0;
      gastosRows.forEach(function(g){
        var fecha = String(g["Fecha"]||g["fecha"]||"").slice(0,10);
        if (weekDates.indexOf(fecha) !== -1) {
          gastosTotal += parseFloat(String(g["Monto"]||g["monto"]||g["Importe"]||"0").replace(/[$,]/g,"")) || 0;
        }
      });

      return ContentService.createTextOutput(JSON.stringify({
        ok:           true,
        tab:          "dashboard_resumen",
        ventas:       ventas,
        diesel:       diesel,
        kmlPorUnidad: kmlMap,
        mantenimiento: mant,
        utilidad:     utilidad,
        utilizacion:  utilizacion,
        otif:         otif,
        entregasVencidas: entregasVenc,
        alertas:      alertas,
        tracker:      tracker,
        unidades:     unidades,
        gastosTotal:  gastosTotal,
        weekDates:    weekDates,
        meta:         META_SEMANAL,
        generado:     Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm"),
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // ── mantenimiento_detalle ────────────────────────────────────────
    if (tab === "mantenimiento_detalle") {
      var estatusRows2 = readTab(SHEET.estatus, 1);
      var mantRows = [];
      try { mantRows = readTab(SHEET.mantenimiento, 2); } catch(ex) {}
      var mant2 = calcMantenimiento(estatusRows2);
      return ContentService.createTextOutput(JSON.stringify({
        ok:  true,
        tab: "mantenimiento_detalle",
        hoy: mant2,
        mantHistorico: mantRows.slice(0, 100),
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // ── tracker_detalle ──────────────────────────────────────────────
    if (tab === "tracker_detalle") {
      var estatusRows3 = readTab(SHEET.estatus, 1);
      var viajesRows3  = readTab(SHEET.viajes, 2);
      var tracker3 = calcTracker(estatusRows3, viajesRows3);
      return ContentService.createTextOutput(JSON.stringify({
        ok:      true,
        tab:     "tracker_detalle",
        tracker: tracker3,
        total:   tracker3.length,
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // ── otif_detalle ─────────────────────────────────────────────────
    if (tab === "otif_detalle") {
      var viajesRows4 = readTab(SHEET.viajes, 2);
      var otif4 = calcOTIF(viajesRows4);
      var entVenc4 = calcEntregasVencidas(viajesRows4);
      return ContentService.createTextOutput(JSON.stringify({
        ok:   true,
        tab:  "otif_detalle",
        otif: otif4,
        entregasVencidas: entVenc4,
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // ── Lectura estándar ─────────────────────────────────────────────
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
    if (payload.meta) { META_SEMANAL = payload.meta; }
    return ContentService.createTextOutput(JSON.stringify({ ok: true, written: rows.length, tab: tab }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch(err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

