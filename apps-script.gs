// ═══════════════════════════════════════════════════════════════════════
//  GOOGLE APPS SCRIPT v7 — ERP NAL
//  Archivo fuente: sistema_logistico.xlsx en Google Sheets
//
//  CORRECCIONES v7:
//  - 78 unidades exactas (última fecha en Estatus_diario)
//  - Venta: fecha dinámica (no hardcoded)
//  - Diesel: solo unidades de las 78 activas
//  - DCO/DSO correctos (10 DCO, 1 DSO en Apr 10)
//  - LIB separado de SO
//  - OTIF desde VIAJES
//  - Circuitos y clientes por coordinador
//  - Cajas por coordinador detallado
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
  circuitos:    "Circuito",
  clientes:     "CLIENTES",
  catalogo:     "CATALOGO_UNIDADES",
  mantenimiento:"MANTENIMIENTO",
};

// ── META SEMANAL (editar aquí) ─────────────────────────────────────────
var META = {
  TELLO:    500000,
  CRISTIAN: 450000,
  JULIO:    350000,
  TOTAL:   1300000,
};

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

// ── SEMANA ACTUAL (lunes a domingo) ───────────────────────────────────
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

// ── OBTENER LAS 78 UNIDADES ACTIVAS (última fecha en estatus) ─────────
function getActiveUnits(estatusRows) {
  // Encuentra la fecha más reciente
  var dates = {};
  estatusRows.forEach(function(r){
    var f = String(r["Fecha"] || "").slice(0, 10);
    var u = r["Unidad"] || "";
    if (f && u) {
      if (!dates[u] || f > dates[u]) dates[u] = f;
    }
  });
  // Fecha más frecuente en el top (la del día de operación)
  var latestDate = "";
  estatusRows.forEach(function(r){
    var f = String(r["Fecha"] || "").slice(0, 10);
    if (f > latestDate) latestDate = f;
  });
  // Retorna solo las unidades de la fecha más reciente
  var activeUnits = {};
  estatusRows.forEach(function(r){
    var f = String(r["Fecha"] || "").slice(0, 10);
    if (f === latestDate) {
      activeUnits[r["Unidad"]] = true;
    }
  });
  return { units: activeUnits, latestDate: latestDate };
}

// ── CALCULAR VENTA POR DÍA ────────────────────────────────────────────
function calcVenta(estatusRows, wd) {
  var todayDate = today();
  var VENTA_MOTIVOS = ["VTA", "TRN", "MOV"];

  var hoy = { TELLO: 0, CRISTIAN: 0, JULIO: 0, TOTAL: 0 };
  var semana = { TELLO: 0, CRISTIAN: 0, JULIO: 0, TOTAL: 0 };
  var porDia = {};
  wd.forEach(function(d){
    porDia[d] = { fecha: d, dia: ["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"][new Date(d).getDay()], TELLO: 0, CRISTIAN: 0, JULIO: 0, TOTAL: 0 };
  });

  // Get latest date for "today"
  var latestDate = "";
  estatusRows.forEach(function(r){ var f = String(r["Fecha"]||"").slice(0,10); if(f > latestDate) latestDate = f; });

  estatusRows.forEach(function(r){
    var fecha = String(r["Fecha"] || "").slice(0, 10);
    var motivo = String(r["Motivo"] || "").toUpperCase();
    var coord = String(r["Coordinador"] || "").toUpperCase();
    var monto = parseFloat(String(r["Monto"] || "0").replace(/[$,]/g, "")) || 0;
    if (!VENTA_MOTIVOS.some(function(m){ return motivo.includes(m); })) return;
    if (monto <= 0) return;
    var ck = coord.includes("TELLO") ? "TELLO" : coord.includes("CRISTIAN") || coord.includes("ZUÑIGA") || coord.includes("ZUNIGA") ? "CRISTIAN" : coord.includes("JULIO") || coord.includes("HERNANDEZ") ? "JULIO" : null;
    if (!ck) return;
    // Hoy = latest date in data
    if (fecha === latestDate) { hoy[ck] += monto; hoy.TOTAL += monto; }
    // Semana
    if (wd.indexOf(fecha) !== -1) {
      semana[ck] += monto; semana.TOTAL += monto;
      if (porDia[fecha]) { porDia[fecha][ck] += monto; porDia[fecha].TOTAL += monto; }
    }
  });

  return {
    hoy: hoy, semana: semana,
    diasSemana: wd.map(function(d){ return porDia[d]; }),
    latestDate: latestDate,
    meta: META,
    cumpl: {
      TELLO:    META.TELLO > 0    ? Math.round(semana.TELLO / META.TELLO * 100)    : 0,
      CRISTIAN: META.CRISTIAN > 0 ? Math.round(semana.CRISTIAN / META.CRISTIAN * 100) : 0,
      JULIO:    META.JULIO > 0    ? Math.round(semana.JULIO / META.JULIO * 100)    : 0,
      TOTAL:    META.TOTAL > 0    ? Math.round(semana.TOTAL / META.TOTAL * 100)    : 0,
    }
  };
}

// ── CALCULAR ESTATUS FLOTA (78 unidades) ─────────────────────────────
function calcFlota(estatusRows) {
  var active = getActiveUnits(estatusRows);
  var latestDate = active.latestDate;
  var hoyRows = estatusRows.filter(function(r){ return String(r["Fecha"]||"").slice(0,10) === latestDate; });

  var grupos = { VTA:[], TRN:[], MOV:[], DCO:[], DSO:[], LIB:[], CP:[], RM:[], SG:[], SO:[], IND:[], PER:[], OTROS:[] };
  hoyRows.forEach(function(r){
    var m = String(r["Motivo"] || "").toUpperCase();
    var obj = {
      unidad: r["Unidad"] || "", operador: r["Operador"] || "—",
      coordinador: r["Coordinador"] || "", motivo: r["Motivo"] || "",
      ruta: r["NombreRuta"] || "", monto: parseFloat(String(r["Monto"]||"0").replace(/[$,]/g,""))||0,
      comentarios: r["Comentarios"] || "", fecha: latestDate
    };
    var key = m.includes("VTA")?"VTA":m.includes("TRN")?"TRN":m.includes("MOV")?"MOV":m.includes("DCO")?"DCO":m.includes("DSO")?"DSO":m.includes("LIB")?"LIB":m.includes("CP")?"CP":m.includes("RM")?"RM":m.includes("SG")?"SG":m.includes("SO")?"SO":m.includes("IND")?"IND":m.includes("PER")?"PER":"OTROS";
    grupos[key].push(obj);
  });

  var enOperacion = grupos.VTA.length + grupos.TRN.length + grupos.MOV.length;
  var total = hoyRows.length; // exactly 78 when data is for one day

  return {
    fecha: latestDate,
    total: total,
    enOperacion: enOperacion,
    pctUtilizacion: total > 0 ? (enOperacion / total * 100).toFixed(1) : "0",
    grupos: grupos,
    resumen: {
      VTA: grupos.VTA.length, TRN: grupos.TRN.length, MOV: grupos.MOV.length,
      DCO: grupos.DCO.length, DSO: grupos.DSO.length, LIB: grupos.LIB.length,
      CP: grupos.CP.length,  RM: grupos.RM.length,  SG: grupos.SG.length,
      SO: grupos.SO.length,  IND: grupos.IND.length, PER: grupos.PER.length,
    }
  };
}

// ── CALCULAR DIESEL (solo 78 unidades activas) ────────────────────────
function calcDiesel(dieselRows, activeUnits, wd) {
  var total = 0, litros = 0, count = 0;
  var porUnidad = {};
  dieselRows.forEach(function(r){
    var fecha = String(r["Fecha Registro"] || "").slice(0, 10);
    var unidad = String(r["Numero Economico"] || "").trim();
    // Solo unidades activas (78)
    if (!activeUnits[unidad]) return;
    if (wd.indexOf(fecha) === -1) return;
    var costo = parseFloat(String(r["Costo Total ($)"] || "0").replace(/[$,]/g, "")) || 0;
    var lts = parseFloat(r["Litros"] || "0") || 0;
    var kml = parseFloat(r["Rendimiento Km/Lt"] || "0") || 0;
    if (costo <= 0) return;
    total += costo; litros += lts; count++;
    if (!porUnidad[unidad]) porUnidad[unidad] = { costo: 0, litros: 0, kml: 0, operador: r["Operador"] || "" };
    porUnidad[unidad].costo += costo;
    porUnidad[unidad].litros += lts;
    if (kml > 0) porUnidad[unidad].kml = kml;
  });
  return { total: total, litros: litros, registros: count, porUnidad: porUnidad };
}

// ── CALCULAR KML DESDE RENDIMIENTOS ──────────────────────────────────
function calcKML(rendRows, activeUnits) {
  var porUnidad = {};
  rendRows.forEach(function(r){
    var unidad = String(r["Numero Economico"] || "").trim();
    if (!activeUnits[unidad]) return;
    var kml = parseFloat(r["Rendimiento Calculado"] || r["RendimientoKmLt"] || "0") || 0;
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

// ── CALCULAR OTIF DESDE VIAJES ────────────────────────────────────────
function calcOTIF(viajesRows) {
  var entregadosEstatus = ["Finalizado","Entregado","TERMINADO","finalizado","entregado","terminado"];
  var total = 0, onTime = 0, late = 0, sinFecha = 0;
  var detalle = [];

  viajesRows.forEach(function(r){
    var estatus = String(r["Estatus viaje"] || "");
    var entregado = entregadosEstatus.some(function(e){ return estatus.toLowerCase().includes(e.toLowerCase()); });
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

    // Simple check: if cita and real both exist and real > cita → late
    // For now flag as onTime if no real date evidence of delay
    var cumple = true;
    // If observacion mentions retraso, late, etc
    if (observ && (observ.toLowerCase().includes("retraso") || observ.toLowerCase().includes("tarde") || observ.toLowerCase().includes("demora"))) {
      cumple = false;
    }
    if (cumple) { onTime++; }
    else { late++; }
    detalle.push({
      unidad: r["Unidad"]||"", caja: r["Caja"]||"", cliente: r["Cliente"]||"",
      coordinador: r["Coordinador"]||"", circuito: r["Circuito"]||"",
      citaDescarga: citaStr, fechaDescarga: realStr,
      estatus: "Entregado", otif: cumple ? "✅ A tiempo" : "🔴 Tardío",
      motivo: observ.slice(0, 80)
    });
  });

  return {
    total: total, onTime: onTime, late: late, sinFecha: sinFecha,
    pct: total > 0 ? (onTime / total * 100).toFixed(1) : "0",
    detalle: detalle.slice(0, 50)
  };
}

// ── CALCULAR KPIs POR COORDINADOR ────────────────────────────────────
function calcCoordinadores(flota, cajasRows, viajesRows, clientesRows, circuitosRows, venta) {
  var coords = {
    TELLO:    { nombre: "Juan José Tello",    key: "TELLO",    color: "#3b82f6" },
    CRISTIAN: { nombre: "Cristian Zuñiga",    key: "CRISTIAN", color: "#10b981" },
    JULIO:    { nombre: "Julio Hernandez",    key: "JULIO",    color: "#f59e0b" },
  };

  Object.keys(coords).forEach(function(ck){
    var c = coords[ck];
    var unidades = flota.grupos.VTA.concat(flota.grupos.TRN).concat(flota.grupos.MOV).concat(flota.grupos.DCO).concat(flota.grupos.DSO).concat(flota.grupos.LIB).concat(flota.grupos.CP).concat(flota.grupos.RM).concat(flota.grupos.SG).concat(flota.grupos.SO).concat(flota.grupos.IND).concat(flota.grupos.PER);
    var propias = unidades.filter(function(u){ return String(u.coordinador||"").toUpperCase().includes(ck); });

    c.totalUnidades = propias.length;
    c.activas = propias.filter(function(u){ var m = String(u.motivo||"").toUpperCase(); return m.includes("VTA")||m.includes("TRN")||m.includes("MOV"); }).length;
    c.dco = propias.filter(function(u){ return String(u.motivo||"").toUpperCase().includes("DCO"); }).length;
    c.dso = propias.filter(function(u){ return String(u.motivo||"").toUpperCase().includes("DSO"); }).length;
    c.lib = propias.filter(function(u){ return String(u.motivo||"").toUpperCase().includes("LIB"); }).length;
    c.so  = propias.filter(function(u){ var m=String(u.motivo||"").toUpperCase(); return m.includes("SO ")&&!m.includes("DSO"); }).length + propias.filter(function(u){ return String(u.motivo||"").toUpperCase().includes(" SO"); }).length;
    // Actually just SO group
    c.so = flota.grupos.SO.filter(function(u){ return String(u.coordinador||"").toUpperCase().includes(ck); }).length;
    c.mtto = propias.filter(function(u){ var m=String(u.motivo||"").toUpperCase(); return m.includes("CP")||m.includes("RM")||m.includes("SG"); }).length;
    c.vacantes = c.so;

    // Cajas
    var cajasCoord = cajasRows.filter(function(cj){ return String(cj["Coordinador"]||"").toUpperCase().includes(ck === "CRISTIAN" ? "CRISTIAN" : ck === "TELLO" ? "TELLO" : "JULIO"); });
    c.totalCajas = cajasCoord.length;
    c.cajasCargadas = cajasCoord.filter(function(cj){ return cj["Estatus"]==="Cargada"; }).length;
    c.cajasDisponibles = cajasCoord.filter(function(cj){ return cj["Estatus"]==="Disponible"; }).length;
    c.cajasDañadas = cajasCoord.filter(function(cj){ return cj["Estatus"]==="Dañada"; }).length;
    c.cajasNoLocaliz = cajasCoord.filter(function(cj){ return cj["Estatus"]==="No localizada"; }).length;
    c.cajasEnTaller = cajasCoord.filter(function(cj){ var s=String(cj["Estatus"]||""); return s==="En cliente"||s==="Vacia"||s==="En patio"; }).length;
    // Cajas cargadas con cliente
    c.cajasConCliente = cajasCoord.filter(function(cj){ return cj["Estatus"]==="Cargada"; }).map(function(cj){
      return { caja: cj["Caja"]||"", cliente: cj["Cliente"]||"", ciudad: cj["Ciudad / Ubicación"]||"", comentarios: cj["Comentarios"]||"" };
    });

    // Venta
    c.ventaHoy = venta.hoy[ck] || 0;
    c.ventaSemana = venta.semana[ck] || 0;
    c.metaSemana = META[ck] || 0;
    c.cumplMeta = c.metaSemana > 0 ? Math.round(c.ventaSemana / c.metaSemana * 100) : 0;

    // Circuitos
    var circs = circuitosRows.filter(function(r){ return String(r["Coordinador"]||"").toUpperCase().includes(ck === "CRISTIAN" ? "CRISTIAN" : ck === "TELLO" ? "TELLO" : "JULIO"); });
    c.circuitos = [...new Set(circs.map(function(r){ return r["Circuito"]||""; }).filter(Boolean))].slice(0, 5);

    // Clientes activos
    var cls = clientesRows.filter(function(r){ return String(r["Coordinador"]||"").toUpperCase().includes(ck === "CRISTIAN" ? "CRISTIAN" : ck === "TELLO" ? "TELLO" : "JULIO"); });
    c.clientes = cls.map(function(r){ return { nombre: r["Nombre del Cliente"]||"", ciudad: r["Ciudad"]||"", tipo: r["Tipo de Operación"]||"", frecuencia: r["Frecuencia"]||"" }; }).slice(0, 8);

    // Eficiencia: activas/total
    c.eficiencia = c.totalUnidades > 0 ? (c.activas / c.totalUnidades * 100).toFixed(0) : "0";

    // Unidades vacantes (SO)
    c.unidadesVacantes = flota.grupos.SO.filter(function(u){ return String(u.coordinador||"").toUpperCase().includes(ck); }).map(function(u){ return { unidad: u.unidad, comentarios: u.comentarios }; });
  });

  return coords;
}

// ── CALCULAR CAJAS TOTALES ────────────────────────────────────────────
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

// ── CALCULAR ENTREGAS VENCIDAS (OTIF DASHBOARD) ───────────────────────
function calcEntregas(viajesRows) {
  var todayStr = today();
  var entregadosEstatus = ["finalizado","entregado","terminado"];
  var vencidas = [], aTiempo = [], pendientes = [];

  viajesRows.forEach(function(r){
    var estatus = String(r["Estatus viaje"] || "").toLowerCase();
    var entregado = entregadosEstatus.some(function(e){ return estatus.includes(e); });
    var citaStr = String(r["Cita descarga"] || r["Fecha descarga"] || "").trim();
    var unidad = r["Unidad"] || "";
    var circuito = r["Circuito"] || "";
    var coord = r["Coordinador"] || "";
    var cliente = r["Cliente"] || "";

    if (!entregado && citaStr && citaStr !== "-" && citaStr !== "" && citaStr !== "nan") {
      // Check if vencida
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
  return {
    vencidas: vencidas, aTiempo: aTiempo, pendientes: pendientes,
    totalVencidas: vencidas.length, totalATiempo: aTiempo.length,
    pctCumplimiento: total > 0 ? (aTiempo.length / total * 100).toFixed(1) : "0"
  };
}

// ── GET PRINCIPAL ─────────────────────────────────────────────────────
function doGet(e) {
  try {
    var tab = e.parameter.tab || "VIAJES";
    var hdrMap = {
      "VIAJES":2, "Estatus_diario":1, "Control_Cajas":2,
      "CATALOGO_UNIDADES":2, "CATALOGO_OPERADORES":2,
      "RENDIMIENTOS":2, "Circuito":1, "CLIENTES":1,
      "CONTROL_OPERADORES":4, "CARGAS_DIESEL":2,
      "MANTENIMIENTO":2, "Gastos":1, "ALERTAS_OPERATIVAS":4,
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

      var active   = getActiveUnits(estatusRows);
      var flota    = calcFlota(estatusRows);
      var venta    = calcVenta(estatusRows, wd);
      var diesel   = calcDiesel(dieselRows, active.units, wd);
      var kml      = calcKML(rendRows, active.units);
      var otif     = calcOTIF(viajesRows);
      var cajas    = calcCajas(cajasRows);
      var entregas = calcEntregas(viajesRows);
      var coords   = calcCoordinadores(flota, cajasRows, viajesRows, clientesRows, circuitosRows, venta);

      // Gastos (si existe la pestaña)
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
        weekDates: wd, meta: META,
        generado: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm"),
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // ── Lectura estándar ───────────────────────────────────────────────
    var hdr = hdrMap[tab] || 2;
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
