// ═══════════════════════════════════════════════════════════════════════
//  GOOGLE APPS SCRIPT v8 — ERP NAL
//  Archivo fuente: sistema_logistico.xlsx en Google Sheets
//
//  CORRECCIONES v8:
//  - Alertas: circuito desde hoja "Circuitos" (tracto + cliente)
//  - Unidades en CP: conteo correcto desde Estatus_diario (DSO, DCO, etc.)
//  - Unidades activas: solo "Operando" con motivos VTA, TRN, LIB (dinámico)
//  - Vacantes: dinámico desde Estatus_diario (SO, IND, PER)
//  - Coordinadores: unidades detalladas con circuito al hacer click
//  - Tracker: todas las unidades "Operando" con circuito dinámico
//  - Distribución: coincide con conteo de activas
//  - Mantenimiento: excluye LIB (LIB = liberar descarga, no mantenimiento)
//  - Venta Hoy vs Semana: corregido (hoja VIAJES, columna venta única)
//  - Ranking de Operadores: métricas de rendimiento por operador
//  - Todo dinámico, sin datos fijos
//
//  INSTALACIÓN:
//  1. Google Sheets → Extensiones → Apps Script
//  2. Borra TODO → Pega este código
//  3. Guardar → Implementar → Nueva implementación
//  4. Tipo: App web | Ejecutar: Yo | Acceso: Cualquier persona
//  5. Implementar → Autorizar → COPIAR URL /exec
//  6. Pegar URL en index.html: window.SHEETS_URL = "TU_URL"
// ═══════════════════════════════════════════════════════════════════════

// ── NOMBRES DE PESTAÑAS ────────────────────────────────────────────────
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
  mantenimiento:"MANTENIMIENTO",
  ranking:      "Ranking de Operadores",
};

// ── META SEMANAL (editar aquí) ─────────────────────────────────────────
var META = {
  TELLO:    500000,
  CRISTIAN: 450000,
  JULIO:    350000,
  TOTAL:   1300000,
};

// ── MOTIVOS QUE SIGNIFICAN OPERANDO (activos) ─────────────────────────
var MOTIVOS_OPERANDO = ["VTA", "TRN", "LIB", "MOV"];
// LIB aquí = liberar descarga → unidad en circulación
// En mantenimiento NO se incluyen LIB

// ── LEE PESTAÑA → array de objetos ────────────────────────────────────
function readTab(name, headerRow) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ws = ss.getSheetByName(name);
  if (!ws) return [];
  var lr = ws.getLastRow(), lc = ws.getLastColumn();
  if (lr <= headerRow || lc === 0) return [];
  var hdr = ws.getRange(headerRow, 1, 1, lc).getValues()[0];
  var data = ws.getRange(headerRow + 1, 1, lr - headerRow, lc).getValues();
  return data
    .filter(function(r){ return r.some(function(c){ return c !== "" && c !== null; }); })
    .map(function(r){
      var obj = {};
      hdr.forEach(function(h, i){
        var k = String(h || "col_" + i).trim();
        var v = r[i];
        if (v === null || v === undefined) v = "";
        if (v instanceof Date) v = Utilities.formatDate(v, Session.getScriptTimeZone(), "yyyy-MM-dd");
        else v = String(v).trim();
        obj[k] = v;
      });
      return obj;
    });
}

// ── FECHA HOY ──────────────────────────────────────────────────────────
function today() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
}

// ── SEMANA ACTUAL (lunes a hoy) ────────────────────────────────────────
function weekDates() {
  var d = new Date();
  var day = d.getDay();
  var mon = new Date(d);
  mon.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  var dates = [];
  for (var i = 0; i < 7; i++) {
    var x = new Date(mon);
    x.setDate(mon.getDate() + i);
    dates.push(Utilities.formatDate(x, Session.getScriptTimeZone(), "yyyy-MM-dd"));
  }
  return dates;
}

// ── ÚLTIMA FECHA EN ESTATUS (fecha operativa) ─────────────────────────
function getLatestDate(estatusRows) {
  var latestDate = "";
  estatusRows.forEach(function(r){
    var f = String(r["Fecha"] || "").slice(0, 10);
    if (f > latestDate) latestDate = f;
  });
  return latestDate;
}

// ── OBTENER UNIDADES ACTIVAS (última fecha en estatus) ─────────────────
function getActiveUnits(estatusRows) {
  var latestDate = getLatestDate(estatusRows);
  var activeUnits = {};
  estatusRows.forEach(function(r){
    var f = String(r["Fecha"] || "").slice(0, 10);
    if (f === latestDate) {
      activeUnits[r["Unidad"]] = true;
    }
  });
  return { units: activeUnits, latestDate: latestDate };
}

// ── CONSTRUIR MAPA DE CIRCUITOS (tracto+cliente → circuito) ───────────
function buildCircuitMap(circuitosRows, ventasRows) {
  // Mapa: tracto → circuito
  var tractoCirc = {};
  // Mapa: cliente → circuito (fallback)
  var clienteCirc = {};

  circuitosRows.forEach(function(r){
    var tracto   = String(r["Tracto"]||r["Unidad"]||r["No. Economico"]||"").trim().toUpperCase();
    var cliente  = String(r["Cliente"]||"").trim().toUpperCase();
    var circuito = String(r["Circuito"]||r["Nombre Circuito"]||"").trim();
    if (tracto && circuito)  tractoCirc[tracto]  = circuito;
    if (cliente && circuito) clienteCirc[cliente] = circuito;
  });

  // También poblar desde Ventas si existe
  if (ventasRows && ventasRows.length > 0) {
    ventasRows.forEach(function(r){
      var tracto   = String(r["Tracto"]||r["Unidad"]||r["No. Economico"]||"").trim().toUpperCase();
      var cliente  = String(r["Cliente"]||"").trim().toUpperCase();
      var circuito = String(r["Circuito"]||"").trim();
      if (tracto && circuito && !tractoCirc[tracto])  tractoCirc[tracto]  = circuito;
      if (cliente && circuito && !clienteCirc[cliente]) clienteCirc[cliente] = circuito;
    });
  }

  return { tractoCirc: tractoCirc, clienteCirc: clienteCirc };
}

// ── RESOLVER CIRCUITO PARA UNA FILA ───────────────────────────────────
function resolveCircuito(row, circMap) {
  // Primero intentar desde campo "Circuito" en la misma fila
  if (row["Circuito"] && row["Circuito"] !== "") return row["Circuito"];
  var unidad = String(row["Unidad"]||"").trim().toUpperCase();
  if (circMap.tractoCirc[unidad]) return circMap.tractoCirc[unidad];
  var cliente = String(row["Cliente"]||"").trim().toUpperCase();
  if (cliente && circMap.clienteCirc[cliente]) return circMap.clienteCirc[cliente];
  return "Sin circuito";
}

// ── CALCULAR VENTA (hoja VIAJES, columna Venta) ────────────────────────
// FIX v8: Venta Hoy = solo fecha más reciente en VIAJES
//         Venta Semana = acumulado lunes a hoy
function calcVentaDesdeViajes(viajesRows, wd) {
  // Detectar columna de venta única
  // Prioridad: "Venta real" > "Monto" > "Venta"
  var ventaKey = "";
  if (viajesRows.length > 0) {
    var firstRow = viajesRows[0];
    if (firstRow["Venta real"] !== undefined) ventaKey = "Venta real";
    else if (firstRow["Monto"] !== undefined) ventaKey = "Monto";
    else if (firstRow["Venta"] !== undefined) ventaKey = "Venta";
    else {
      // Buscar cualquier columna con "venta" o "monto"
      Object.keys(firstRow).forEach(function(k){
        if (!ventaKey && (k.toLowerCase().includes("venta") || k.toLowerCase().includes("monto"))) ventaKey = k;
      });
    }
  }

  // Fecha más reciente en VIAJES
  var latestViajesDate = "";
  viajesRows.forEach(function(r){
    var f = String(r["Fecha"]||r["Fecha de carga"]||r["Fecha salida"]||"").slice(0,10);
    if (f > latestViajesDate) latestViajesDate = f;
  });

  var hoy = { TELLO: 0, CRISTIAN: 0, JULIO: 0, TOTAL: 0 };
  var semana = { TELLO: 0, CRISTIAN: 0, JULIO: 0, TOTAL: 0 };
  var porDia = {};
  wd.forEach(function(d){
    porDia[d] = { fecha: d, dia: ["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"][new Date(d + "T12:00:00").getDay()], TELLO: 0, CRISTIAN: 0, JULIO: 0, TOTAL: 0 };
  });

  viajesRows.forEach(function(r){
    // Fecha del viaje: usar campo más relevante
    var fecha = String(r["Fecha"]||r["Fecha de carga"]||r["Fecha salida"]||"").slice(0, 10);
    var coord = String(r["Coordinador"] || "").toUpperCase();
    var monto = parseFloat(String(r[ventaKey] || "0").replace(/[$,\s]/g, "")) || 0;
    if (monto <= 0) return;

    var ck2 = coord.includes("TELLO") ? "TELLO"
             : (coord.includes("CRISTIAN") || coord.includes("ZUÑIGA") || coord.includes("ZUNIGA")) ? "CRISTIAN"
             : (coord.includes("JULIO") || coord.includes("HERNANDEZ")) ? "JULIO"
             : null;
    if (!ck2) return;

    // VENTA HOY = solo la fecha más reciente en los datos de VIAJES
    if (fecha === latestViajesDate) {
      hoy[ck2] += monto;
      hoy.TOTAL += monto;
    }
    // VENTA SEMANA = acumulado desde lunes hasta hoy
    if (wd.indexOf(fecha) !== -1) {
      semana[ck2] += monto;
      semana.TOTAL += monto;
      if (porDia[fecha]) {
        porDia[fecha][ck2] += monto;
        porDia[fecha].TOTAL += monto;
      }
    }
  });

  return {
    hoy: hoy,
    semana: semana,
    diasSemana: wd.map(function(d){ return porDia[d]; }),
    latestDate: latestViajesDate,
    meta: META,
    cumpl: {
      TELLO:    META.TELLO > 0    ? Math.round(semana.TELLO / META.TELLO * 100) : 0,
      CRISTIAN: META.CRISTIAN > 0 ? Math.round(semana.CRISTIAN / META.CRISTIAN * 100) : 0,
      JULIO:    META.JULIO > 0    ? Math.round(semana.JULIO / META.JULIO * 100) : 0,
      TOTAL:    META.TOTAL > 0    ? Math.round(semana.TOTAL / META.TOTAL * 100) : 0,
    }
  };
}

// ── CALCULAR ESTATUS FLOTA ─────────────────────────────────────────────
// v8: CP correcto (DSO, DCO, etc. desde Estatus_diario)
//     Vacantes dinámico (SO + IND + PER)
//     LIB = en circulación (liberar descarga), NO mantenimiento
function calcFlota(estatusRows, circMap) {
  var latestDate = getLatestDate(estatusRows);
  var hoyRows = estatusRows.filter(function(r){ return String(r["Fecha"]||"").slice(0,10) === latestDate; });

  var grupos = {
    VTA:[], TRN:[], MOV:[], LIB:[],
    DCO:[], DSO:[],
    CP:[], RM:[], SG:[],
    SO:[], IND:[], PER:[], OTROS:[]
  };

  hoyRows.forEach(function(r){
    var m = String(r["Motivo"] || r["Estatus"] || "").toUpperCase().trim();
    var circuito = resolveCircuito(r, circMap);
    var obj = {
      unidad:      r["Unidad"] || "",
      operador:    r["Operador"] || "—",
      coordinador: r["Coordinador"] || "",
      motivo:      r["Motivo"] || r["Estatus"] || "",
      ruta:        r["NombreRuta"] || r["Ruta"] || r["Circuito"] || "",
      circuito:    circuito,
      ubicacion:   r["Ubicacion"] || r["Ciudad"] || r["Origen"] || "",
      cliente:     r["Cliente"] || "",
      monto:       parseFloat(String(r["Monto"]||"0").replace(/[$,]/g,""))||0,
      comentarios: r["Comentarios"] || "",
      fecha:       latestDate
    };

    // Clasificación precisa por siglas
    var key = m.startsWith("VTA") ? "VTA"
            : m.startsWith("TRN") ? "TRN"
            : m.startsWith("MOV") ? "MOV"
            : m.startsWith("LIB") ? "LIB"   // liberar descarga = en circulación
            : m.startsWith("DCO") ? "DCO"
            : m.startsWith("DSO") ? "DSO"
            : m.startsWith("CP")  ? "CP"
            : m.startsWith("RM")  ? "RM"
            : m.startsWith("SG")  ? "SG"
            : m.startsWith("SO")  ? "SO"
            : m.startsWith("IND") ? "IND"
            : m.startsWith("PER") ? "PER"
            : "OTROS";

    grupos[key].push(obj);
  });

  // UNIDADES OPERANDO (activas): VTA + TRN + MOV + LIB
  var enOperacion = grupos.VTA.length + grupos.TRN.length + grupos.MOV.length + grupos.LIB.length;
  var total = hoyRows.length;

  // VACANTES dinámico: SO + IND + PER
  var vacantes = {
    total: grupos.SO.length + grupos.IND.length + grupos.PER.length,
    SO:    grupos.SO.length,
    IND:   grupos.IND.length,
    PER:   grupos.PER.length,
    detalle: grupos.SO.concat(grupos.IND).concat(grupos.PER)
  };

  // UNIDADES EN CP (correcta): solo grupos CP, RM, SG
  var enCP = {
    total: grupos.CP.length + grupos.RM.length + grupos.SG.length,
    CP:    grupos.CP.length,
    RM:    grupos.RM.length,
    SG:    grupos.SG.length
  };

  return {
    fecha:          latestDate,
    total:          total,
    enOperacion:    enOperacion,
    pctUtilizacion: total > 0 ? (enOperacion / total * 100).toFixed(1) : "0",
    grupos:         grupos,
    vacantes:       vacantes,
    enCP:           enCP,
    resumen: {
      VTA: grupos.VTA.length, TRN: grupos.TRN.length, MOV: grupos.MOV.length,
      LIB: grupos.LIB.length, DCO: grupos.DCO.length, DSO: grupos.DSO.length,
      CP:  grupos.CP.length,  RM:  grupos.RM.length,  SG:  grupos.SG.length,
      SO:  grupos.SO.length,  IND: grupos.IND.length, PER: grupos.PER.length,
      OTROS: grupos.OTROS.length,
    }
  };
}

// ── CALCULAR DIESEL ────────────────────────────────────────────────────
function calcDiesel(dieselRows, activeUnits, wd) {
  var total = 0, litros = 0, count = 0;
  var porUnidad = {};
  dieselRows.forEach(function(r){
    var fecha = String(r["Fecha Registro"] || r["Fecha"] || "").slice(0, 10);
    var unidad = String(r["Numero Economico"] || r["Unidad"] || "").trim();
    if (!activeUnits[unidad]) return;
    if (wd.indexOf(fecha) === -1) return;
    var costo = parseFloat(String(r["Costo Total ($)"] || r["Costo"] || "0").replace(/[$,]/g, "")) || 0;
    var lts = parseFloat(r["Litros"] || "0") || 0;
    var kml = parseFloat(r["Rendimiento Km/Lt"] || r["Rendimiento"] || "0") || 0;
    if (costo <= 0) return;
    total += costo; litros += lts; count++;
    if (!porUnidad[unidad]) porUnidad[unidad] = { costo: 0, litros: 0, kml: 0, operador: r["Operador"] || "" };
    porUnidad[unidad].costo += costo;
    porUnidad[unidad].litros += lts;
    if (kml > 0) porUnidad[unidad].kml = kml;
  });
  return { total: total, litros: litros, registros: count, porUnidad: porUnidad };
}

// ── CALCULAR KML ───────────────────────────────────────────────────────
function calcKML(rendRows, activeUnits) {
  var porUnidad = {};
  rendRows.forEach(function(r){
    var unidad = String(r["Numero Economico"] || r["Unidad"] || "").trim();
    if (!activeUnits[unidad]) return;
    var kml = parseFloat(r["Rendimiento Calculado"] || r["RendimientoKmLt"] || r["Rendimiento Km/Lt"] || "0") || 0;
    if (kml <= 0) return;
    if (!porUnidad[unidad]) porUnidad[unidad] = { vals: [], operador: r["Operador"] || "", clasificacion: r["Clasificacion"] || "" };
    porUnidad[unidad].vals.push(kml);
  });
  var result = {};
  Object.keys(porUnidad).forEach(function(u){
    var vals = porUnidad[u].vals;
    result[u] = { kml: (vals.reduce(function(a,b){return a+b;},0)/vals.length).toFixed(2), operador: porUnidad[u].operador, clasificacion: porUnidad[u].clasificacion };
  });
  return result;
}

// ── CALCULAR OTIF ──────────────────────────────────────────────────────
function calcOTIF(viajesRows) {
  var entregadosEstatus = ["finalizado","entregado","terminado"];
  var total = 0, onTime = 0, late = 0, sinFecha = 0;
  var detalle = [];
  viajesRows.forEach(function(r){
    var estatus = String(r["Estatus viaje"] || "").toLowerCase();
    var entregado = entregadosEstatus.some(function(e){ return estatus.includes(e); });
    if (!entregado) return;
    total++;
    var citaStr = String(r["Cita descarga"] || r["Fecha descarga"] || "").trim();
    var realStr = String(r["Fecha descarga"] || "").trim();
    var observ = String(r["Observaciones"] || "");
    if (!citaStr || citaStr === "nan" || citaStr === "-" || citaStr === "") {
      sinFecha++;
      detalle.push({ unidad: r["Unidad"]||"", caja: r["Caja"]||"", cliente: r["Cliente"]||"", coordinador: r["Coordinador"]||"", estatus: "Entregado", otif: "Sin fecha", motivo: observ });
      return;
    }
    var cumple = true;
    if (observ && (observ.toLowerCase().includes("retraso") || observ.toLowerCase().includes("tarde") || observ.toLowerCase().includes("demora"))) cumple = false;
    if (cumple) onTime++; else late++;
    detalle.push({ unidad: r["Unidad"]||"", caja: r["Caja"]||"", cliente: r["Cliente"]||"", coordinador: r["Coordinador"]||"", circuito: r["Circuito"]||"", citaDescarga: citaStr, fechaDescarga: realStr, estatus: "Entregado", otif: cumple ? "✅ A tiempo" : "🔴 Tardío", motivo: observ.slice(0,80) });
  });
  return { total: total, onTime: onTime, late: late, sinFecha: sinFecha, pct: total > 0 ? (onTime / total * 100).toFixed(1) : "0", detalle: detalle.slice(0, 50) };
}

// ── CALCULAR ENTREGAS VENCIDAS (con circuito dinámico) ────────────────
function calcEntregas(viajesRows, circMap) {
  var todayStr = today();
  var entregadosEstatus = ["finalizado","entregado","terminado"];
  var vencidas = [], aTiempo = [], pendientes = [];

  viajesRows.forEach(function(r){
    var estatus = String(r["Estatus viaje"] || "").toLowerCase();
    var entregado = entregadosEstatus.some(function(e){ return estatus.includes(e); });
    var citaStr = String(r["Cita descarga"] || r["Fecha descarga"] || "").trim();
    var unidad = r["Unidad"] || "";
    // Circuito dinámico desde mapa
    var circuito = resolveCircuito(r, circMap);
    var coord = r["Coordinador"] || "";
    var cliente = r["Cliente"] || "";

    if (!entregado && citaStr && citaStr !== "-" && citaStr !== "" && citaStr !== "nan") {
      var fechaObj = new Date(citaStr);
      var isVencida = !isNaN(fechaObj) && fechaObj < new Date(todayStr);
      if (isVencida) {
        vencidas.push({ unidad: unidad, caja: r["Caja"]||"", cliente: cliente, coordinador: coord, circuito: circuito, cita: citaStr, estatus: r["Estatus viaje"]||"", comentarios: String(r["Observaciones"]||"").slice(0,60) });
      } else {
        pendientes.push({ unidad: unidad, caja: r["Caja"]||"", cliente: cliente, coordinador: coord, circuito: circuito, cita: citaStr });
      }
    }
    if (entregado) {
      aTiempo.push({ unidad: unidad, cliente: cliente, coordinador: coord, circuito: circuito });
    }
  });

  var total = vencidas.length + aTiempo.length;
  return { vencidas: vencidas, aTiempo: aTiempo, pendientes: pendientes, totalVencidas: vencidas.length, totalATiempo: aTiempo.length, pctCumplimiento: total > 0 ? (aTiempo.length / total * 100).toFixed(1) : "0" };
}

// ── CALCULAR CAJAS ─────────────────────────────────────────────────────
function calcCajas(cajasRows) {
  var resumen = { Cargada:0, Disponible:0, Dañada:0, Transito:0, Siniestro:0, NoLocalizada:0, Vacia:0, Venta:0, Otros:0 };
  var total = cajasRows.length;
  cajasRows.forEach(function(c){
    var s = String(c["Estatus"] || "");
    if(s==="Cargada") resumen.Cargada++;
    else if(s==="Disponible") resumen.Disponible++;
    else if(s==="Dañada") resumen.Dañada++;
    else if(s.includes("ránsito")) resumen.Transito++;
    else if(s==="Siniestro") resumen.Siniestro++;
    else if(s==="No localizada") resumen.NoLocalizada++;
    else if(s==="Vacia"||s==="En patio"||s==="En cliente") resumen.Vacia++;
    else if(s==="Venta") resumen.Venta++;
    else resumen.Otros++;
  });
  var pctCargadas = total > 0 ? (resumen.Cargada / total * 100).toFixed(1) : "0";
  return { total: total, resumen: resumen, pctCargadas: pctCargadas };
}

// ── CALCULAR RANKING DE OPERADORES ────────────────────────────────────
// Métricas: total cargado, rendimiento/km, rendimiento/viaje,
//           último viaje, último rendimiento
function calcRanking(rankingRows, dieselRows, viajesRows) {
  // Si viene de hoja "Ranking de Operadores" la usamos como base
  // y la enriquecemos con cálculos propios

  // Construir mapa de operadores desde dieselRows
  var opMap = {};

  // Desde diesel: total litros cargados, último rendimiento, última fecha
  dieselRows.forEach(function(r){
    var op = String(r["Operador"] || "").trim();
    var unidad = String(r["Numero Economico"] || r["Unidad"] || "").trim();
    if (!op) return;
    var fecha = String(r["Fecha Registro"] || r["Fecha"] || "").slice(0, 10);
    var litros = parseFloat(r["Litros"] || "0") || 0;
    var kml = parseFloat(r["Rendimiento Km/Lt"] || r["Rendimiento"] || "0") || 0;
    var costo = parseFloat(String(r["Costo Total ($)"] || r["Costo"] || "0").replace(/[$,]/g, "")) || 0;

    if (!opMap[op]) opMap[op] = { operador: op, unidad: unidad, totalLitros: 0, totalCosto: 0, kmlVals: [], lastFecha: "", lastKml: 0, viajes: 0, kmTotal: 0, ventaTotal: 0, rendViajeVals: [] };
    opMap[op].totalLitros += litros;
    opMap[op].totalCosto += costo;
    if (kml > 0) {
      opMap[op].kmlVals.push(kml);
      if (fecha >= opMap[op].lastFecha) {
        opMap[op].lastFecha = fecha;
        opMap[op].lastKml = kml;
        opMap[op].unidad = unidad;
      }
    }
  });

  // Desde viajes: viajes completados, km, venta
  viajesRows.forEach(function(r){
    var op = String(r["Operador"] || "").trim();
    if (!op) return;
    var estatus = String(r["Estatus viaje"] || "").toLowerCase();
    var finalizado = ["finalizado","entregado","terminado"].some(function(s){ return estatus.includes(s); });
    if (!finalizado) return;
    var km = parseFloat(r["Km cargados"] || r["Km"] || "0") || 0;
    var venta = parseFloat(String(r["Venta real"] || r["Monto"] || r["Venta"] || "0").replace(/[$,]/g, "")) || 0;
    var fecha = String(r["Fecha"]||r["Fecha de carga"]||"").slice(0,10);

    if (!opMap[op]) opMap[op] = { operador: op, unidad: r["Unidad"]||"", totalLitros: 0, totalCosto: 0, kmlVals: [], lastFecha: "", lastKml: 0, viajes: 0, kmTotal: 0, ventaTotal: 0, rendViajeVals: [] };
    opMap[op].viajes++;
    opMap[op].kmTotal += km;
    opMap[op].ventaTotal += venta;
    if (km > 0 && opMap[op].totalLitros > 0) {
      // Rendimiento por viaje = km / (litros proporcionales) — estimado
      var litrosPorViaje = opMap[op].viajes > 0 ? opMap[op].totalLitros / opMap[op].viajes : 0;
      if (litrosPorViaje > 0) opMap[op].rendViajeVals.push(km / litrosPorViaje);
    }
    if (fecha >= (opMap[op].lastViajeDate||"")) opMap[op].lastViajeDate = fecha;
  });

  // Enriquecer con rankingRows si existen columnas adicionales
  var rankMap = {};
  rankingRows.forEach(function(r){
    var op = String(r["Operador"] || r["Nombre"] || "").trim();
    if (op) rankMap[op] = r;
  });

  // Construir resultado final
  var resultado = Object.keys(opMap).map(function(op){
    var d = opMap[op];
    var kmlProm = d.kmlVals.length > 0 ? (d.kmlVals.reduce(function(a,b){return a+b;},0)/d.kmlVals.length).toFixed(2) : "—";
    var rendViaje = d.rendViajeVals.length > 0 ? (d.rendViajeVals.reduce(function(a,b){return a+b;},0)/d.rendViajeVals.length).toFixed(2) : "—";
    // Enrichment desde hoja ranking
    var rk = rankMap[op] || {};
    return {
      operador:         op,
      unidad:           d.unidad || rk["Unidad"] || "—",
      totalLitros:      d.totalLitros.toFixed(0),
      totalCosto:       d.totalCosto.toFixed(0),
      rendimientoKmLt:  kmlProm,
      rendimientoViaje: rendViaje,
      viajesCompletados:d.viajes,
      kmTotal:          d.kmTotal.toFixed(0),
      ventaTotal:       d.ventaTotal.toFixed(0),
      ultimaFechaCarga: d.lastFecha || rk["Ultima Fecha"] || "—",
      ultimoRendimiento:d.lastKml > 0 ? d.lastKml.toFixed(2) : (rk["Ultimo Rendimiento"] || "—"),
      ultimoViaje:      d.lastViajeDate || "—",
      // Datos extra de hoja ranking si existen
      clasificacion:    rk["Clasificacion"] || rk["Categoria"] || "—",
      extra:            rk,
    };
  });

  // Ordenar por rendimiento km/lt descendente
  resultado.sort(function(a,b){
    var ra = parseFloat(a.rendimientoKmLt) || 0;
    var rb = parseFloat(b.rendimientoKmLt) || 0;
    return rb - ra;
  });

  return resultado;
}

// ── CALCULAR KPIs POR COORDINADOR (con detalle de unidades) ───────────
function calcCoordinadores(flota, cajasRows, viajesRows, clientesRows, circuitosRows, venta, circMap) {
  var coords = {
    TELLO:    { nombre: "Juan José Tello",    key: "TELLO",    color: "#3b82f6" },
    CRISTIAN: { nombre: "Cristian Zuñiga",    key: "CRISTIAN", color: "#10b981" },
    JULIO:    { nombre: "Julio Hernandez",    key: "JULIO",    color: "#f59e0b" },
  };

  Object.keys(coords).forEach(function(ck){
    var c = coords[ck];

    // Todas las unidades (sin importar motivo)
    var allGrupos = Object.values(flota.grupos).reduce(function(acc, arr){ return acc.concat(arr); }, []);
    var propias = allGrupos.filter(function(u){ return String(u.coordinador||"").toUpperCase().includes(ck); });

    c.totalUnidades = propias.length;

    // ACTIVAS = VTA + TRN + MOV + LIB (operando)
    c.activas = propias.filter(function(u){
      var m = String(u.motivo||"").toUpperCase();
      return m.startsWith("VTA")||m.startsWith("TRN")||m.startsWith("MOV")||m.startsWith("LIB");
    });

    // Detalle para interactividad (click en número)
    c.activasDetalle = c.activas.map(function(u){ return { unidad: u.unidad, ubicacion: u.ubicacion||u.ruta||"—", cliente: u.cliente||"—", circuito: u.circuito||"Sin circuito", motivo: u.motivo, operador: u.operador, comentarios: u.comentarios }; });
    c.activas = c.activas.length;

    c.dco = flota.grupos.DCO.filter(function(u){ return String(u.coordinador||"").toUpperCase().includes(ck); }).length;
    c.dso = flota.grupos.DSO.filter(function(u){ return String(u.coordinador||"").toUpperCase().includes(ck); }).length;
    // LIB = liberar descarga (en circulación, no vacante)
    c.lib = flota.grupos.LIB.filter(function(u){ return String(u.coordinador||"").toUpperCase().includes(ck); }).length;
    c.so  = flota.grupos.SO.filter(function(u){  return String(u.coordinador||"").toUpperCase().includes(ck); }).length;
    c.ind = flota.grupos.IND.filter(function(u){ return String(u.coordinador||"").toUpperCase().includes(ck); }).length;
    c.per = flota.grupos.PER.filter(function(u){ return String(u.coordinador||"").toUpperCase().includes(ck); }).length;
    // MANTENIMIENTO = CP + RM + SG (sin LIB)
    c.mtto = (flota.grupos.CP||[]).filter(function(u){ return String(u.coordinador||"").toUpperCase().includes(ck); }).length
           + (flota.grupos.RM||[]).filter(function(u){ return String(u.coordinador||"").toUpperCase().includes(ck); }).length
           + (flota.grupos.SG||[]).filter(function(u){ return String(u.coordinador||"").toUpperCase().includes(ck); }).length;
    // Vacantes = SO + IND + PER de este coordinador
    c.vacantes = c.so + c.ind + c.per;

    // Detalle de unidades CP (interactividad)
    var cpDetalle = (flota.grupos.CP||[]).concat(flota.grupos.RM||[]).concat(flota.grupos.SG||[])
      .filter(function(u){ return String(u.coordinador||"").toUpperCase().includes(ck); })
      .map(function(u){ return { unidad: u.unidad, ubicacion: u.ubicacion||u.ruta||"—", cliente: u.cliente||"—", circuito: u.circuito, motivo: u.motivo, comentarios: u.comentarios }; });
    c.mttoDetalle = cpDetalle;

    // Detalle de DSO/DCO
    var dcoDetalle = (flota.grupos.DCO||[]).concat(flota.grupos.DSO||[])
      .filter(function(u){ return String(u.coordinador||"").toUpperCase().includes(ck); })
      .map(function(u){ return { unidad: u.unidad, ubicacion: u.ubicacion||u.ruta||"—", cliente: u.cliente||"—", circuito: u.circuito, motivo: u.motivo, comentarios: u.comentarios }; });
    c.dcoDetalle = dcoDetalle;

    // Cajas
    var cajasCoord = cajasRows.filter(function(cj){ return String(cj["Coordinador"]||"").toUpperCase().includes(ck === "CRISTIAN" ? "CRISTIAN" : ck === "TELLO" ? "TELLO" : "JULIO"); });
    c.totalCajas      = cajasCoord.length;
    c.cajasCargadas   = cajasCoord.filter(function(cj){ return cj["Estatus"]==="Cargada"; }).length;
    c.cajasDisponibles= cajasCoord.filter(function(cj){ return cj["Estatus"]==="Disponible"; }).length;
    c.cajasDañadas    = cajasCoord.filter(function(cj){ return cj["Estatus"]==="Dañada"; }).length;
    c.cajasNoLocaliz  = cajasCoord.filter(function(cj){ return cj["Estatus"]==="No localizada"; }).length;
    c.cajasConCliente = cajasCoord.filter(function(cj){ return cj["Estatus"]==="Cargada"; }).map(function(cj){
      return { caja: cj["Caja"]||"", cliente: cj["Cliente"]||"", ciudad: cj["Ciudad / Ubicación"]||"", comentarios: cj["Comentarios"]||"" };
    });

    // Venta (desde VIAJES)
    c.ventaHoy    = venta.hoy[ck]    || 0;
    c.ventaSemana = venta.semana[ck] || 0;
    c.metaSemana  = META[ck] || 0;
    c.cumplMeta   = c.metaSemana > 0 ? Math.round(c.ventaSemana / c.metaSemana * 100) : 0;

    // Circuitos dinámicos (desde circMap)
    var cirsCoord = circuitosRows.filter(function(r){
      return String(r["Coordinador"]||"").toUpperCase().includes(ck === "CRISTIAN" ? "CRISTIAN" : ck === "TELLO" ? "TELLO" : "JULIO");
    });
    c.circuitos = [...new Set(cirsCoord.map(function(r){ return r["Circuito"]||""; }).filter(Boolean))];
    // Añadir circuitos que aparecen en unidades activas del coordinador
    var circDeActivas = propias.map(function(u){ return u.circuito; }).filter(function(ci){ return ci && ci !== "Sin circuito"; });
    c.circuitos = [...new Set(c.circuitos.concat(circDeActivas))].slice(0, 8);

    // Clientes
    var cls = clientesRows.filter(function(r){ return String(r["Coordinador"]||"").toUpperCase().includes(ck === "CRISTIAN" ? "CRISTIAN" : ck === "TELLO" ? "TELLO" : "JULIO"); });
    c.clientes = cls.map(function(r){ return { nombre: r["Nombre del Cliente"]||"", ciudad: r["Ciudad"]||"", tipo: r["Tipo de Operación"]||"", frecuencia: r["Frecuencia"]||"" }; }).slice(0, 8);

    // Eficiencia
    c.eficiencia = c.totalUnidades > 0 ? (c.activas / c.totalUnidades * 100).toFixed(0) : "0";

    // Unidades vacantes detalle
    c.unidadesVacantes = flota.grupos.SO.concat(flota.grupos.IND||[]).concat(flota.grupos.PER||[])
      .filter(function(u){ return String(u.coordinador||"").toUpperCase().includes(ck); })
      .map(function(u){ return { unidad: u.unidad, motivo: u.motivo, comentarios: u.comentarios }; });
  });

  return coords;
}

// ── GET PRINCIPAL ─────────────────────────────────────────────────────
function doGet(e) {
  try {
    var tab = e.parameter.tab || "VIAJES";
    var hdrMap = {
      "VIAJES":2, "Estatus_diario":1, "Control_Cajas":2,
      "CATALOGO_UNIDADES":2, "CATALOGO_OPERADORES":2,
      "RENDIMIENTOS":2, "Circuitos":1, "Ventas":1,
      "CLIENTES":1, "CONTROL_OPERADORES":4,
      "CARGAS_DIESEL":2, "MANTENIMIENTO":2,
      "Gastos":1, "ALERTAS_OPERATIVAS":4,
      "Ranking de Operadores":1,
    };

    // ── Tab especial: resumen_completo ─────────────────────────────────
    if (tab === "resumen_completo") {
      var wd = weekDates();
      var estatusRows   = readTab(TABS.estatus, 1);
      var cajasRows     = readTab(TABS.cajas, 2);
      var viajesRows    = readTab(TABS.viajes, 2);
      var rendRows      = readTab(TABS.rendimientos, 2);
      var dieselRows    = readTab(TABS.diesel, 2);
      var clientesRows  = readTab(TABS.clientes, 1);
      var circuitosRows = readTab(TABS.circuitos, 1);

      // Ventas desde hoja Ventas (si existe) para circuito
      var ventasRows = [];
      try { ventasRows = readTab(TABS.ventas, 1); } catch(ex) {}

      // Ranking de Operadores (si existe)
      var rankingRows = [];
      try { rankingRows = readTab(TABS.ranking, 1); } catch(ex) {}

      var active    = getActiveUnits(estatusRows);
      var circMap   = buildCircuitMap(circuitosRows, ventasRows);
      var flota     = calcFlota(estatusRows, circMap);
      // v8: venta desde VIAJES, no Estatus_diario
      var venta     = calcVentaDesdeViajes(viajesRows, wd);
      var diesel    = calcDiesel(dieselRows, active.units, wd);
      var kml       = calcKML(rendRows, active.units);
      var otif      = calcOTIF(viajesRows);
      var cajas     = calcCajas(cajasRows);
      var entregas  = calcEntregas(viajesRows, circMap);
      var coords    = calcCoordinadores(flota, cajasRows, viajesRows, clientesRows, circuitosRows, venta, circMap);
      var ranking   = calcRanking(rankingRows, dieselRows, viajesRows);

      // Gastos semana
      var gastosTotal = 0;
      try {
        var gastosRows = readTab("Gastos", 1);
        gastosRows.forEach(function(g){
          var f = String(g["Fecha"]||g["fecha"]||"").slice(0,10);
          if(wd.indexOf(f) !== -1) gastosTotal += parseFloat(String(g["Monto"]||g["monto"]||"0").replace(/[$,]/g,""))||0;
        });
      } catch(ex) {}

      return ContentService.createTextOutput(JSON.stringify({
        ok: true, tab: "resumen_completo",
        flota: flota, venta: venta, diesel: diesel, kml: kml,
        otif: otif, cajas: cajas, entregas: entregas,
        coordinadores: coords, gastosTotal: gastosTotal,
        ranking: ranking,
        weekDates: wd, meta: META,
        generado: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm"),
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // ── Lectura estándar ───────────────────────────────────────────────
    var hdr = hdrMap[tab] || 1;
    var rows = readTab(tab, hdr);
    return ContentService.createTextOutput(JSON.stringify({ ok: true, tab: tab, count: rows.length, data: rows }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch(err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: err.toString(), stack: err.stack||"" }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ── POST ──────────────────────────────────────────────────────────────
function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents);
    var tab = payload.tab, rows = payload.rows || [];
    var hdrMap = { "VIAJES":2,"Estatus_diario":1,"Control_Cajas":2,"CARGAS_DIESEL":2,"MANTENIMIENTO":2,"Gastos":1,"CONTROL_OPERADORES":4 };
    var hdr = hdrMap[tab] || 2;
    if (payload.action === "replace" && rows.length > 0) {
      var ss = SpreadsheetApp.getActiveSpreadsheet();
      var ws = ss.getSheetByName(tab);
      if (ws) {
        var lc = ws.getLastColumn(), lr = ws.getLastRow();
        var headers = ws.getRange(hdr, 1, 1, lc).getValues()[0];
        if (lr > hdr) ws.getRange(hdr+1,1,lr-hdr,lc).clearContent();
        var matrix = rows.map(function(r){ return headers.map(function(h){ return r[String(h).trim()]||""; }); });
        if (matrix.length > 0) ws.getRange(hdr+1,1,matrix.length,headers.length).setValues(matrix);
      }
    }
    if (payload.meta) { META = payload.meta; }
    return ContentService.createTextOutput(JSON.stringify({ ok: true, written: rows.length })).setMimeType(ContentService.MimeType.JSON);
  } catch(err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: err.toString() })).setMimeType(ContentService.MimeType.JSON);
  }
}
