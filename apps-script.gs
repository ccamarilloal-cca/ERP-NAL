// ═══════════════════════════════════════════════════════════════════════
//  GOOGLE APPS SCRIPT v5 — ERP NAL
//  Adaptado al archivo: sistema_logistico.xlsx
//  Pestañas fuente: VIAJES, Estatus_diario, Control_Cajas,
//                   CATALOGO_UNIDADES, RENDIMIENTOS, CONTROL_OPERADORES
//
//  INSTALACIÓN:
//  1. Abre tu archivo en Google Sheets (el que subiste a Drive)
//  2. Extensiones → Apps Script
//  3. Borra TODO el código existente
//  4. Pega este código completo
//  5. Guardar (Ctrl+S o ícono 💾)
//  6. Implementar → Nueva implementación
//  7. Tipo: Aplicación web
//  8. Ejecutar como: Yo
//  9. Quién tiene acceso: Cualquier persona
//  10. Click Implementar → Autorizar → Copiar URL /exec
//  11. Esa URL va en tu index.html: window.SHEETS_URL = "TU_URL"
// ═══════════════════════════════════════════════════════════════════════

// ── Nombres exactos de las pestañas en tu archivo ──────────────────────
const TABS = {
  viajes:      "VIAJES",
  estatus:     "Estatus_diario",
  cajas:       "Control_Cajas",
  unidades:    "CATALOGO_UNIDADES",
  operadores:  "CATALOGO_OPERADORES",
  rendimientos:"RENDIMIENTOS",
  circuitos:   "Circuito",
  clientes:    "CLIENTES",
  control_op:  "CONTROL_OPERADORES",
  tablero:     "TABLERO_DE_CONTROL",
  alertas:     "ALERTAS_OPERATIVAS",
};

// ── Lee una pestaña y devuelve array de objetos ─────────────────────────
function readSheet(tabName, headerRow) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ws = ss.getSheetByName(tabName);
  if (!ws) return [];

  var lastRow = ws.getLastRow();
  var lastCol = ws.getLastColumn();
  if (lastRow <= headerRow) return [];

  var hdr = ws.getRange(headerRow, 1, 1, lastCol).getValues()[0];
  var data = ws.getRange(headerRow + 1, 1, lastRow - headerRow, lastCol).getValues();

  return data
    .filter(function(r){ return r.some(function(c){ return c !== "" && c !== null; }); })
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

// ── Escribe filas en una pestaña ────────────────────────────────────────
function writeSheet(tabName, headerRow, rows) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ws = ss.getSheetByName(tabName);
  if (!ws || rows.length === 0) return false;

  var lastCol = ws.getLastColumn();
  var hdr = ws.getRange(headerRow, 1, 1, lastCol).getValues()[0];

  // Clear from headerRow+1 down
  var lastRow = ws.getLastRow();
  if (lastRow > headerRow) {
    ws.getRange(headerRow + 1, 1, lastRow - headerRow, lastCol).clearContent();
  }

  // Write new rows
  var matrix = rows.map(function(row){
    return hdr.map(function(h){
      var k = String(h).trim();
      return (row[k] !== undefined && row[k] !== null) ? row[k] : "";
    });
  });

  if (matrix.length > 0) {
    ws.getRange(headerRow + 1, 1, matrix.length, hdr.length).setValues(matrix);
  }
  return true;
}

// ── GET — la app pide datos ─────────────────────────────────────────────
function doGet(e) {
  try {
    var tab = e.parameter.tab || "VIAJES";
    var rows = [];

    // Determine header row per tab
    var headerRow = 2; // default: row 1 = menu icon, row 2 = headers
    if (tab === "Estatus_diario") headerRow = 1;
    if (tab === "Control_Cajas") headerRow = 2;
    if (tab === "CATALOGO_UNIDADES") headerRow = 2;
    if (tab === "CATALOGO_OPERADORES") headerRow = 2;
    if (tab === "RENDIMIENTOS") headerRow = 2;
    if (tab === "Circuito") headerRow = 1;
    if (tab === "CLIENTES") headerRow = 1;
    if (tab === "CONTROL_OPERADORES") headerRow = 4; // row 4 = real headers
    if (tab === "VIAJES") headerRow = 2;
    if (tab === "ALERTAS_OPERATIVAS") headerRow = 4;

    rows = readSheet(tab, headerRow);

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true, tab: tab, count: rows.length, data: rows }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch(err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ── POST — la app envía actualizaciones ────────────────────────────────
function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents);
    var tab = payload.tab;
    var rows = payload.rows || [];
    var action = payload.action || "replace";

    var headerRow = 2;
    if (tab === "Estatus_diario") headerRow = 1;
    if (tab === "Control_Cajas") headerRow = 2;
    if (tab === "CATALOGO_UNIDADES") headerRow = 2;
    if (tab === "RENDIMIENTOS") headerRow = 2;
    if (tab === "CONTROL_OPERADORES") headerRow = 4;
    if (tab === "VIAJES") headerRow = 2;

    if (action === "replace" && rows.length > 0) {
      writeSheet(tab, headerRow, rows);
    }

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true, written: rows.length, tab: tab }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch(err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
