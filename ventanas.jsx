// ═══════════════════════════════════════════════════════════════════════
//  VENTANAS OPERATIVAS — Módulo independiente
//  Torre de Control Logística · ERP NAL v9
//
//  INTEGRACIÓN:
//  - Se carga después de app.jsx (ver index.html)
//  - Usa window.SHEETS_URL ya definido
//  - Exporta window.VentanasOperativas para que app.jsx lo consuma
//  - No modifica ningún componente existente
//
//  FUENTES DE DATOS:
//  - GET resumen_completo → viajesSemana, flota, coordinadores, circuitos
//  - GET INCIDENCIAS      → historial de incidencias guardadas en Sheets
//  - POST VIAJES          → guardar ediciones de celda
//  - POST INCIDENCIAS     → guardar nuevas incidencias
//
//  DETECCIÓN DINÁMICA DE ENCABEZADOS:
//  - buildVentanas() mapea columnas por nombre real devuelto por el backend
//  - Si cambia el orden en Sheets, se adapta automáticamente
// ═══════════════════════════════════════════════════════════════════════

(function () {
  "use strict";

  const { useState, useEffect, useRef, useCallback } = React;

  // ── Constantes de color de estado ──────────────────────────────────────
  const COLOR = {
    ok:      "#10b981",
    riesgo:  "#f59e0b",
    retraso: "#ef4444",
    vencida: "#ef4444",
    curso:   "#3b82f6",
    vacio:   "#1e293b",
    muted:   "#475569",
  };

  const CSS_CLASS = {
    ok:      "vn-card-ok",
    riesgo:  "vn-card-riesgo",
    retraso: "vn-card-retraso",
    vencida: "vn-card-vencida",
    curso:   "vn-card-curso",
    vacio:   "vn-card-vacio",
  };

  // ── Helpers ────────────────────────────────────────────────────────────
  const fmt$ = v =>
    v >= 1e6 ? `$${(v / 1e6).toFixed(2)}M` :
    v >= 1e3 ? `$${(v / 1e3).toFixed(0)}K` :
    `$${Math.round(v).toLocaleString()}`;

  const parseMonto = v =>
    parseFloat(String(v || "0").replace(/[$,\s]/g, "")) || 0;

  // Color del coordinador (reutiliza la función global si existe)
  const ccLocal = (c = "") => {
    const u = c.toUpperCase();
    if (u.includes("TELLO"))   return "#3b82f6";
    if (u.includes("CRISTIAN") || u.includes("ZUÑIGA")) return "#10b981";
    if (u.includes("JULIO")   || u.includes("HERNANDEZ")) return "#f59e0b";
    return "#6366f1";
  };

  // Detectar campo dinámicamente por posibles sinónimos
  const field = (row, ...keys) => {
    for (const k of keys) {
      if (row[k] !== undefined && row[k] !== "") return String(row[k] || "");
    }
    return "";
  };

  // ── Construir ventanas desde viajes + flota ────────────────────────────
  // Detección dinámica de encabezados: acepta múltiples nombres de columna
  function buildVentanas(viajesSrc, flotaGrupos, incidenciasMap) {
    const todasActivas = [
      ...(flotaGrupos.VTA || []),
      ...(flotaGrupos.TRN || []),
      ...(flotaGrupos.MOV || []),
      ...(flotaGrupos.LIB || []),
      ...(flotaGrupos.DCO || []),
      ...(flotaGrupos.DSO || []),
    ];

    return (viajesSrc || []).map((v, i) => {
      const tracto = field(v, "Unidad", "Tracto", "Economico");
      const unidadInfo = todasActivas.find(u => u.unidad === tracto) || {};

      // Fechas/horas — detección dinámica
      const citaRaw = field(v, "Cita descarga", "Hora cita", "Cita Descarga", "FechaCita");
      const realRaw = field(v, "Fecha descarga", "Hora real", "FechaDescarga", "FechaEntrega");
      const fechaCarga = field(v, "Fecha de carga", "Fecha", "FechaCarga", "fecha_carga");

      const citaDate = citaRaw ? new Date(citaRaw) : null;
      const realDate = realRaw ? new Date(realRaw) : null;
      const ahora    = new Date();

      let difMin = null;
      let estado = "vacio";
      let cumplimiento = "Sin asignación";

      const estatusViaje = field(v, "Estatus viaje", "Estatus", "Status").toLowerCase();
      const finalizado = ["finaliz", "entreg", "termin"].some(s => estatusViaje.includes(s));

      if (finalizado) {
        if (citaDate && realDate && !isNaN(citaDate) && !isNaN(realDate)) {
          difMin = Math.round((realDate - citaDate) / 60000);
          estado = difMin <= 0 ? "ok" : difMin <= 60 ? "riesgo" : "retraso";
          cumplimiento = difMin <= 0 ? "✅ A tiempo" : difMin <= 60 ? "⚠️ Tardío" : "🔴 Retraso";
        } else {
          estado = "ok"; cumplimiento = "✅ Entregado";
        }
      } else if (citaDate && !isNaN(citaDate)) {
        const diffNow = Math.round((ahora - citaDate) / 60000);
        if (diffNow > 120)     { estado = "vencida"; cumplimiento = "🔴 Vencida"; difMin = diffNow; }
        else if (diffNow > 0)  { estado = "riesgo";  cumplimiento = "⚠️ En riesgo"; }
        else                   { estado = "curso";   cumplimiento = "🕐 En curso"; }
      } else if (estatusViaje) {
        estado = "curso"; cumplimiento = "🕐 En curso";
      }

      const id = `vn_${i}_${tracto}`;
      return {
        id,
        tracto,
        caja:        field(v, "Caja", "Remolque", "Trailer"),
        cliente:     field(v, "Cliente", "Nombre Cliente", "NombreCliente"),
        circuito:    field(v, "Circuito", "NombreRuta", "Ruta") || unidadInfo.circuito || "Sin circuito",
        origen:      field(v, "Origen", "Ciudad origen"),
        destino:     field(v, "Destino", "Ciudad destino"),
        coordinador: field(v, "Coordinador") || unidadInfo.coordinador || "",
        operador:    field(v, "Operador") || unidadInfo.operador || "—",
        citaRaw, realRaw, fechaCarga,
        citaDate, realDate, difMin,
        estado, cumplimiento,
        color: COLOR[estado] || COLOR.vacio,
        cssClass: CSS_CLASS[estado] || CSS_CLASS.vacio,
        estatusViaje: field(v, "Estatus viaje", "Estatus"),
        monto:       parseMonto(field(v, "Venta real", "Monto", "Venta")),
        km:          parseMonto(field(v, "Km cargados", "Km")),
        observaciones: field(v, "Observaciones", "Comentarios", "Notas"),
        ubicacion:   unidadInfo.ubicacion || unidadInfo.ruta || "",
        estadoFlota: unidadInfo.motivo || "",
        // incidencias de esta ventana
        incidencias: incidenciasMap[id] || [],
      };
    });
  }

  // ── API calls ──────────────────────────────────────────────────────────
  const sheetsUrl = () => window.SHEETS_URL || "";

  const apiGetTab = async (tab) => {
    const r = await fetch(`${sheetsUrl()}?tab=${encodeURIComponent(tab)}`);
    const j = await r.json();
    return Array.isArray(j) ? j : (j.data || []);
  };

  const apiPost = async (tab, rows) => {
    await fetch(sheetsUrl(), {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tab, action: "replace", rows }),
    });
  };

  // ── COMPONENTE PRINCIPAL ───────────────────────────────────────────────
  function VentanasOperativas({ data, setTab: setMainTab, onRefresh }) {
    const res = data.resumen;

    // Estado
    const [vista,        setVista]        = useState("tablero");
    const [filtCoord,    setFiltCoord]    = useState("");
    const [filtCliente,  setFiltCliente]  = useState("");
    const [filtCircuito, setFiltCircuito] = useState("");
    const [incMap,       setIncMap]       = useState({});   // id → [incidencias]
    const [seguim,       setSeguim]       = useState({});   // id → bool
    const [saving,       setSaving]       = useState(false);
    const [incRaw,       setIncRaw]       = useState([]);   // filas de hoja INCIDENCIAS
    const [loadingInc,   setLoadingInc]   = useState(false);

    // Carga incidencias desde Sheets al montar
    useEffect(() => {
      if (!sheetsUrl() || sheetsUrl() === "PEGA_TU_URL_AQUI") return;
      setLoadingInc(true);
      apiGetTab("INCIDENCIAS")
        .then(rows => {
          setIncRaw(rows);
          // Mapear por id de ventana
          const m = {};
          rows.forEach(r => {
            const vid = r["VentanaId"] || r["ventana_id"] || r["ID"];
            if (!vid) return;
            if (!m[vid]) m[vid] = [];
            m[vid].push({
              tipo:       r["Tipo"] || r["tipo"] || "",
              min:        r["Minutos"] || r["minutos"] || "",
              comentario: r["Comentarios"] || r["comentario"] || "",
              ts:         r["Fecha"] || r["timestamp"] || "",
              auto:       (r["Origen"] || "") === "auto",
            });
          });
          setIncMap(m);
        })
        .catch(() => {})
        .finally(() => setLoadingInc(false));
    }, []);

    if (!res) return (
      <div style={{ color: "#475569", textAlign: "center", padding: 40 }}>
        Toca 🔄 Sincronizar para cargar datos
      </div>
    );

    // Fuentes de datos
    const viajesSrc   = res.viajesSemana || data.viajesList || [];
    const flotaGrupos = res.flota?.grupos || {};

    // Construir todas las ventanas
    const todasVentanas = buildVentanas(viajesSrc, flotaGrupos, incMap);

    // Listas únicas para filtros (dinámicas)
    const clientes  = [...new Set(todasVentanas.map(v => v.cliente).filter(Boolean))].sort();
    const circuitos = [...new Set(todasVentanas.map(v => v.circuito).filter(c => c && c !== "Sin circuito"))].sort();

    // Filtrar ventanas
    const ventanas = todasVentanas.filter(v => {
      if (filtCoord   && !v.coordinador.toUpperCase().includes(filtCoord))  return false;
      if (filtCliente && v.cliente !== filtCliente)                          return false;
      if (filtCircuito && v.circuito !== filtCircuito)                       return false;
      return true;
    });

    // KPIs dinámicos
    const kpiTotal   = ventanas.length;
    const kpiOk      = ventanas.filter(v => v.estado === "ok").length;
    const kpiRiesgo  = ventanas.filter(v => v.estado === "riesgo" || v.estado === "curso").length;
    const kpiRetraso = ventanas.filter(v => v.estado === "retraso" || v.estado === "vencida").length;
    const kpiPct     = kpiTotal > 0 ? Math.round((kpiOk / kpiTotal) * 100) : 0;
    const incTotal   = Object.values(incMap).reduce((a, b) => a + b.length, 0);

    // Guardar incidencia en Sheets
    const saveIncidencia = async (vid, inc) => {
      const nuevas = [...(incMap[vid] || []), inc];
      setIncMap(p => ({ ...p, [vid]: nuevas }));
      if (!sheetsUrl() || sheetsUrl() === "PEGA_TU_URL_AQUI") return;
      const allRows = [
        ...incRaw,
        {
          VentanaId: vid, Tipo: inc.tipo, Minutos: inc.min,
          Comentarios: inc.comentario,
          Fecha: new Date().toISOString(), Origen: "manual",
        },
      ];
      setIncRaw(allRows);
      setSaving(true);
      try { await apiPost("INCIDENCIAS", allRows); } catch (e) { console.error(e); }
      setSaving(false);
    };

    // Guardar edición de celda en Sheets (POST a VIAJES)
    const saveEdit = async (ventana, campo, valor) => {
      setSaving(true);
      const camposMap = {
        citaRaw:       "Cita descarga",
        realRaw:       "Fecha descarga",
        estatusViaje:  "Estatus viaje",
        observaciones: "Observaciones",
        cliente:       "Cliente",
        destino:       "Destino",
      };
      const colSheets = camposMap[campo] || campo;
      const allViajes = (data.viajesList || []).map((v, i) => {
        const trk = String(v.Unidad || v.Tracto || "");
        if (trk === ventana.tracto) return { ...v, [colSheets]: valor };
        return v;
      });
      try { await apiPost("VIAJES", allViajes); } catch (e) { console.error(e); }
      // Refrescar datos
      if (onRefresh) onRefresh();
      setSaving(false);
    };

    // ── Filtros bar ──────────────────────────────────────────────────────
    const FiltrosBar = () => (
      <div className="vn-filters">
        <select className="vn-select" value={filtCoord} onChange={e => setFiltCoord(e.target.value)}>
          <option value="">👥 Todos los coordinadores</option>
          {["TELLO", "CRISTIAN", "JULIO"].map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select className="vn-select" value={filtCliente} onChange={e => setFiltCliente(e.target.value)}>
          <option value="">🏭 Todos los clientes</option>
          {clientes.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select className="vn-select" value={filtCircuito} onChange={e => setFiltCircuito(e.target.value)}>
          <option value="">🔁 Todos los circuitos</option>
          {circuitos.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        {(filtCoord || filtCliente || filtCircuito) && (
          <button className="vn-select" onClick={() => { setFiltCoord(""); setFiltCliente(""); setFiltCircuito(""); }}
            style={{ cursor: "pointer", color: "#ef4444", borderColor: "#ef444440" }}>
            ✕ Limpiar filtros
          </button>
        )}
        {saving && <span className="vn-saving">Guardando</span>}
        {loadingInc && <span style={{ color: "#64748b", fontSize: 11 }}>Cargando incidencias…</span>}
      </div>
    );

    // ── KPI bar ──────────────────────────────────────────────────────────
    const KPIBar = () => (
      <div className="vn-kpi-grid">
        {[
          [kpiTotal,          "Total",      COLOR.curso,   "📋"],
          [kpiOk,             "A Tiempo",   COLOR.ok,      "✅"],
          [kpiRiesgo,         "En Riesgo",  COLOR.riesgo,  "⚠️"],
          [kpiRetraso,        "Retraso",    COLOR.retraso, "🔴"],
          [`${kpiPct}%`,      "OTIF",       "#6366f1",     "🎯"],
        ].map(([val, lbl, col, ic]) => (
          <div key={lbl} className="vn-kpi-card vn-fade-in"
            style={{ background: col + "18", borderColor: col + "35" }}>
            <div className="vn-kpi-icon">{ic}</div>
            <div className="vn-kpi-val" style={{ color: col }}>{val}</div>
            <div className="vn-kpi-label">{lbl}</div>
          </div>
        ))}
      </div>
    );

    // ── MODAL DETALLE / EDICIÓN ──────────────────────────────────────────
    function ModalDetalle({ ventana: v, onClose }) {
      const [editando, setEditando] = useState(null);
      const [editVal,  setEditVal]  = useState("");
      const [incForm,  setIncForm]  = useState({ tipo: "", min: "", comentario: "" });

      const camposEdit = [
        { k: "citaRaw",       l: "Cita descarga",   type: "datetime-local" },
        { k: "realRaw",       l: "Hora real / Desc.",type: "datetime-local" },
        { k: "estatusViaje",  l: "Estatus viaje",   type: "select",
          opts: ["En tránsito","Cargado","Descargando","Finalizado","Entregado","Con incidencia","Cancelado"] },
        { k: "observaciones", l: "Observaciones",   type: "text" },
        { k: "destino",       l: "Destino",         type: "text" },
        { k: "cliente",       l: "Cliente",         type: "text" },
      ];

      const startEdit = (k, val) => { setEditando(k); setEditVal(val); };
      const commitEdit = (k) => { saveEdit(v, k, editVal); setEditando(null); };

      const addInc = () => {
        if (!incForm.tipo) return;
        saveIncidencia(v.id, { ...incForm, ts: new Date().toISOString() });
        setIncForm({ tipo: "", min: "", comentario: "" });
      };

      return (
        <div style={{ position: "fixed", inset: 0, background: "#000c", zIndex: 9999,
          display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div className="vn-fade-in" style={{ background: "#0d1829", border: "1px solid #1e293b",
            borderRadius: 14, width: "100%", maxWidth: 680, maxHeight: "92vh", overflow: "auto" }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "14px 20px", borderBottom: "1px solid #1e293b",
              position: "sticky", top: 0, background: "#0d1829", zIndex: 1 }}>
              <div>
                <div style={{ color: "#f1f5f9", fontWeight: 900, fontSize: 15, fontFamily: "monospace" }}>
                  🚛 {v.tracto}
                  <span style={{ background: v.color + "20", color: v.color, borderRadius: 6,
                    padding: "2px 9px", fontSize: 10, fontWeight: 700, marginLeft: 10 }}>
                    {v.cumplimiento}
                  </span>
                </div>
                <div style={{ color: "#64748b", fontSize: 11, marginTop: 2 }}>
                  {v.cliente} · {v.circuito} · {(v.coordinador || "").split(" ")[0]}
                </div>
              </div>
              <button onClick={onClose}
                style={{ background: "none", border: "none", color: "#64748b", fontSize: 22, cursor: "pointer" }}>×</button>
            </div>

            <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
              {/* Info rápida */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                {[
                  ["Caja",        v.caja       || "—"],
                  ["Operador",    v.operador   || "—"],
                  ["Origen",      v.origen     || "—"],
                  ["Destino",     v.destino    || "—"],
                  ["Ubicación",   v.ubicacion  || "—"],
                  ["Estatus flota", v.estadoFlota || "—"],
                  ["Km",          v.km > 0 ? v.km.toLocaleString() + " km" : "—"],
                  ["Monto",       v.monto > 0  ? fmt$(v.monto) : "—"],
                  ["Δ minutos",   v.difMin !== null ? (v.difMin > 0 ? "+" : "") + v.difMin + " min" : "—"],
                ].map(([l, val]) => (
                  <div key={l}>
                    <div style={{ color: "#475569", fontSize: 8, textTransform: "uppercase" }}>{l}</div>
                    <div style={{ color: "#f1f5f9", fontWeight: 700, fontSize: 11 }}>{val}</div>
                  </div>
                ))}
              </div>

              {/* Edición de campos */}
              <div style={{ borderTop: "1px solid #1e293b", paddingTop: 14 }}>
                <div style={{ color: "#3b82f6", fontSize: 11, fontWeight: 700, marginBottom: 10 }}>
                  ✏️ Editar campos (Enter o clic fuera para guardar)
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  {camposEdit.map(cf => (
                    <div key={cf.k}>
                      <div style={{ color: "#475569", fontSize: 9, textTransform: "uppercase", marginBottom: 3 }}>{cf.l}</div>
                      {editando === cf.k ? (
                        cf.type === "select"
                          ? <select className="vn-cell-select"
                              value={editVal}
                              onChange={e => setEditVal(e.target.value)}
                              onBlur={() => commitEdit(cf.k)}>
                              {cf.opts.map(o => <option key={o} value={o}>{o}</option>)}
                            </select>
                          : <input className="vn-cell-input" type={cf.type}
                              value={editVal}
                              onChange={e => setEditVal(e.target.value)}
                              onBlur={() => commitEdit(cf.k)}
                              onKeyDown={e => e.key === "Enter" && commitEdit(cf.k)}
                              autoFocus />
                      ) : (
                        <div className="vn-editable-cell"
                          onClick={() => startEdit(cf.k, v[cf.k] || "")}
                          style={{ color: "#94a3b8", fontSize: 11, padding: "5px 8px",
                            background: "#0f172a", borderRadius: 6, border: "1px solid #1e293b",
                            cursor: "text", minHeight: 28 }}>
                          {v[cf.k] || <span style={{ color: "#334155" }}>—</span>}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Incidencias */}
              <div style={{ borderTop: "1px solid #1e293b", paddingTop: 14 }}>
                <div style={{ color: "#f59e0b", fontSize: 11, fontWeight: 700, marginBottom: 8 }}>
                  ⚠️ Incidencias ({(incMap[v.id] || []).length})
                </div>
                <div className="vn-inc-list">
                  {(incMap[v.id] || []).map((inc, i) => (
                    <div key={i} className="vn-inc-item">
                      <span className="vn-inc-tipo">{inc.auto ? "🤖 " : ""}{inc.tipo}</span>
                      {inc.min && <span className="vn-inc-min">{inc.min} min perdidos</span>}
                      {inc.comentario && <div className="vn-inc-comment">{inc.comentario}</div>}
                      {inc.ts && <div style={{ color: "#334155", fontSize: 8, marginTop: 2 }}>{inc.ts.slice(0, 16)}</div>}
                    </div>
                  ))}
                  {(incMap[v.id] || []).length === 0 && (
                    <div style={{ color: "#334155", fontSize: 11 }}>Sin incidencias registradas</div>
                  )}
                </div>

                {/* Formulario agregar incidencia */}
                <div className="vn-inc-form">
                  <div className="vn-inc-form-title">+ Registrar incidencia</div>
                  <div className="vn-inc-form-row">
                    <select className="vn-cell-select" value={incForm.tipo}
                      onChange={e => setIncForm(p => ({ ...p, tipo: e.target.value }))}>
                      <option value="">— Tipo —</option>
                      {["Demora en carga", "Demora en descarga", "Problema mecánico",
                        "Accidente", "Cierre de vialidad", "Cliente no disponible",
                        "Error de documentación", "Problema con caja",
                        "Retraso por tráfico", "Problema aduanal", "Otro"
                      ].map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                    <input className="vn-cell-input" type="number" placeholder="Min perdidos"
                      value={incForm.min}
                      onChange={e => setIncForm(p => ({ ...p, min: e.target.value }))} />
                  </div>
                  <div className="vn-inc-form-actions">
                    <input className="vn-cell-input" placeholder="Comentario..."
                      value={incForm.comentario}
                      onChange={e => setIncForm(p => ({ ...p, comentario: e.target.value }))}
                      onKeyDown={e => e.key === "Enter" && addInc()} />
                    <button onClick={addInc}
                      style={{ background: "#f59e0b20", border: "1px solid #f59e0b50",
                        borderRadius: 6, padding: "6px 14px", color: "#f59e0b",
                        fontWeight: 700, cursor: "pointer", fontSize: 11, whiteSpace: "nowrap" }}>
                      + Agregar
                    </button>
                  </div>
                </div>
              </div>

              {/* Botón ir a Tracker */}
              <button onClick={() => { onClose(); if (setMainTab) setMainTab("tracker"); }}
                style={{ width: "100%", background: "#1e3a5f", border: "1px solid #3b82f660",
                  borderRadius: 8, padding: "10px", color: "#3b82f6",
                  fontWeight: 700, cursor: "pointer", fontSize: 12 }}>
                🛣️ Ver en Tracker → {v.tracto}
              </button>
            </div>
          </div>
        </div>
      );
    }

    // ── VISTA 1: TABLERO PLANNER ─────────────────────────────────────────
    function Tablero() {
      const [cellModal, setCellModal] = useState(null);

      // Agrupar por circuito+cliente (fila) y día de carga (columna)
      const porFila = {};
      ventanas.forEach(v => {
        const fila = `${v.circuito}||${v.cliente}`;
        if (!porFila[fila]) porFila[fila] = { circuito: v.circuito, cliente: v.cliente, dias: {} };
        const dia = v.fechaCarga || "Sin fecha";
        if (!porFila[fila].dias[dia]) porFila[fila].dias[dia] = [];
        porFila[fila].dias[dia].push(v);
      });

      const dias = [...new Set(ventanas.map(v => v.fechaCarga || "Sin fecha"))].sort();

      const Celda = ({ v }) => {
        const inc = (incMap[v.id] || []).length;
        return (
          <div className={`vn-card ${v.cssClass} vn-fade-in`}
            onClick={() => setCellModal(v)}
            style={{ borderColor: v.color + "70" }}>
            {inc > 0 && (
              <div className="vn-inc-badge" title={`${inc} incidencia(s)`}>⚠️</div>
            )}
            <div className="vn-card-tracto">{v.tracto}</div>
            <div className="vn-card-caja">📦 {v.caja || "—"}</div>
            <div className="vn-card-cliente">{v.cliente}</div>
            <div className="vn-card-status" style={{ color: v.color }}>{v.cumplimiento}</div>
            {v.difMin !== null && (
              <div className="vn-card-delta">
                Δ {v.difMin > 0 ? "+" : ""}{v.difMin} min
              </div>
            )}
            {v.citaRaw && (
              <div style={{ color: "#334155", fontSize: 8, marginTop: 1 }}>
                🕐 {v.citaRaw.slice(0, 16)}
              </div>
            )}
            <div className="vn-card-coord" style={{ color: ccLocal(v.coordinador) }}>
              {v.coordinador.split(" ")[0]}
            </div>
          </div>
        );
      };

      return (
        <div>
          {cellModal && <ModalDetalle ventana={cellModal} onClose={() => setCellModal(null)} />}
          {ventanas.length === 0 ? (
            <div style={{ color: "#334155", textAlign: "center", padding: 40 }}>
              Sin viajes en el filtro actual
            </div>
          ) : (
            <div className="vn-planner-wrap">
              <table className="vn-planner-table">
                <thead>
                  <tr>
                    <th className="vn-col-header" style={{ textAlign: "left", minWidth: 160 }}>
                      Circuito / Cliente
                    </th>
                    {dias.map(d => (
                      <th key={d} className="vn-col-header">{d}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Object.values(porFila).map(fila => (
                    <tr key={fila.circuito + fila.cliente} style={{ borderTop: "1px solid #0f1e33" }}>
                      <td className="vn-row-header">
                        {fila.circuito}
                        <span className="vn-row-sub">{fila.cliente}</span>
                      </td>
                      {dias.map(d => {
                        const celdas = (fila.dias[d] || []);
                        return (
                          <td key={d} className="vn-cell-td">
                            {celdas.length === 0
                              ? <div className="vn-cell-empty">—</div>
                              : celdas.map(v => <Celda key={v.id} v={v} />)
                            }
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      );
    }

    // ── VISTA 2: MONITOREO TABLA ─────────────────────────────────────────
    function Monitoreo() {
      const [editCell, setEditCell] = useState(null); // {id, campo}
      const [editVal,  setEditVal]  = useState("");

      const deltaClass = (difMin, estado) => {
        if (difMin === null) return "vn-delta-none";
        if (difMin <= 0)     return "vn-delta-ok";
        if (difMin <= 60)    return "vn-delta-risk";
        return "vn-delta-late";
      };

      const startEdit = (id, campo, val) => {
        setEditCell({ id, campo });
        setEditVal(val);
      };

      const commitEdit = (v) => {
        if (!editCell) return;
        saveEdit(v, editCell.campo, editVal);
        setEditCell(null);
      };

      const CAMPOS_EDIT_OPTS = {
        estatusViaje: ["En tránsito","Cargado","Descargando","Finalizado","Entregado","Con incidencia","Cancelado"],
      };

      const EditableCell = ({ v, campo, valorActual, type = "text" }) => {
        const activo = editCell?.id === v.id && editCell?.campo === campo;
        if (activo) {
          if (CAMPOS_EDIT_OPTS[campo]) return (
            <select className="vn-cell-select" value={editVal}
              onChange={e => setEditVal(e.target.value)}
              onBlur={() => commitEdit(v)}>
              {CAMPOS_EDIT_OPTS[campo].map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          );
          return (
            <input className="vn-cell-input" type={type} value={editVal}
              onChange={e => setEditVal(e.target.value)}
              onBlur={() => commitEdit(v)}
              onKeyDown={e => e.key === "Enter" && commitEdit(v)}
              autoFocus style={{ minWidth: 100 }} />
          );
        }
        return (
          <span className="vn-editable-cell" onClick={() => startEdit(v.id, campo, valorActual)}
            style={{ cursor: "text", color: "#94a3b8", fontSize: 10 }}>
            {valorActual || <span style={{ color: "#334155" }}>—</span>}
          </span>
        );
      };

      return (
        <div style={{ overflowX: "auto" }}>
          <table className="vn-table">
            <thead>
              <tr>
                {["Tracto", "Caja", "Coord.", "Cliente", "Circuito",
                  "Cita", "Real", "Δ min", "Cumplimiento",
                  "Estatus Viaje", "Est. Flota", "Inc.", "Seguim."].map(h => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ventanas.map((v, i) => {
                const inc = (incMap[v.id] || []).length;
                const seg = seguim[v.id] || false;
                return (
                  <tr key={v.id} style={{ opacity: seg ? 0.6 : 1 }}>
                    <td style={{ fontFamily: "monospace", fontWeight: 800, color: "#f1f5f9" }}>{v.tracto}</td>
                    <td style={{ fontFamily: "monospace", fontSize: 10, color: "#94a3b8" }}>{v.caja}</td>
                    <td><span style={{ color: ccLocal(v.coordinador), fontWeight: 700, fontSize: 10 }}>
                      {(v.coordinador || "").split(" ")[0]}
                    </span></td>
                    <td style={{ maxWidth: 90, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#94a3b8" }}>
                      {v.cliente}
                    </td>
                    <td style={{ color: "#a78bfa", fontWeight: 700, fontSize: 10 }}>{v.circuito}</td>
                    <td>
                      <EditableCell v={v} campo="citaRaw" valorActual={v.citaRaw} type="datetime-local"/>
                    </td>
                    <td>
                      <EditableCell v={v} campo="realRaw" valorActual={v.realRaw} type="datetime-local"/>
                    </td>
                    <td className={deltaClass(v.difMin, v.estado)}>
                      {v.difMin === null ? "—" : (v.difMin > 0 ? "+" : "") + v.difMin}
                    </td>
                    <td>
                      <span className="vn-badge" style={{ background: v.color + "20", color: v.color }}>
                        {v.cumplimiento}
                      </span>
                    </td>
                    <td>
                      <EditableCell v={v} campo="estatusViaje" valorActual={v.estatusViaje}/>
                    </td>
                    <td style={{ fontSize: 10 }}>
                      {v.estadoFlota
                        ? <span style={{ background: "#64748b20", color: "#64748b", borderRadius: 4, padding: "1px 5px", fontSize: 9 }}>{v.estadoFlota}</span>
                        : "—"}
                    </td>
                    <td style={{ color: inc > 0 ? "#f59e0b" : "#334155", fontWeight: 700, textAlign: "center" }}>
                      {inc > 0 ? `⚠️ ${inc}` : "—"}
                    </td>
                    <td>
                      <button className={`vn-seg-btn ${seg ? "done" : "pending"}`}
                        onClick={() => setSeguim(p => ({ ...p, [v.id]: !p[v.id] }))}>
                        {seg ? "✅" : "Marcar"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {ventanas.length === 0 && (
            <div style={{ color: "#334155", textAlign: "center", padding: 24 }}>
              Sin registros en el filtro actual
            </div>
          )}
        </div>
      );
    }

    // ── VISTA 3: TIMELINE POR UNIDAD ─────────────────────────────────────
    function Timeline() {
      const [selId, setSelId] = useState(ventanas[0]?.id || "");
      const v = ventanas.find(vn => vn.id === selId);

      const etapas = v ? [
        {
          label: "Asignación", icono: "📋",
          prog: v.fechaCarga || "", real: v.fechaCarga || "",
          ok: !!v.fechaCarga, activo: false,
        },
        {
          label: "Carga", icono: "📦",
          prog: v.fechaCarga || "", real: v.fechaCarga || "",
          ok: !!v.fechaCarga, activo: false,
        },
        {
          label: "En ruta", icono: "🚛",
          prog: "", real: v.estadoFlota?.toUpperCase().includes("TRN") ? "En curso" : "",
          ok: ["TRN","VTA","MOV"].some(m => (v.estadoFlota||"").toUpperCase().includes(m)),
          activo: ["TRN","VTA","MOV"].some(m => (v.estadoFlota||"").toUpperCase().includes(m)),
        },
        {
          label: "Descarga", icono: "🏭",
          prog: v.citaRaw || "", real: v.realRaw || "",
          ok: !!v.realRaw, activo: !!v.citaRaw && !v.realRaw,
        },
        {
          label: "Entregado", icono: "✅",
          prog: "", real: v.realRaw || "",
          ok: ["ok"].includes(v.estado) && !!v.realRaw,
          activo: false,
        },
      ] : [];

      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Selector de unidad */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {ventanas.map(vn => (
              <button key={vn.id} onClick={() => setSelId(vn.id)}
                style={{ background: selId === vn.id ? vn.color + "30" : "#0a1628",
                  border: `1px solid ${selId === vn.id ? vn.color : "#1e293b"}`,
                  borderRadius: 7, padding: "6px 12px",
                  color: selId === vn.id ? "#f1f5f9" : "#64748b",
                  fontSize: 11, cursor: "pointer",
                  fontWeight: selId === vn.id ? 700 : 400 }}>
                {vn.tracto}
                {(incMap[vn.id] || []).length > 0 && " ⚠️"}
              </button>
            ))}
          </div>

          {v ? (
            <div className="vn-fade-in" style={{ background: "#0a1628",
              border: `1px solid ${v.color}30`, borderRadius: 12, padding: 18 }}>
              {/* Header unidad */}
              <div style={{ display: "flex", gap: 10, alignItems: "center",
                marginBottom: 16, flexWrap: "wrap" }}>
                <span style={{ color: "#f1f5f9", fontWeight: 900, fontFamily: "monospace", fontSize: 16 }}>
                  {v.tracto}
                </span>
                <span style={{ color: "#64748b", fontSize: 12 }}>
                  · {v.caja} · {v.cliente}
                </span>
                <span style={{ background: v.color + "20", color: v.color, borderRadius: 6,
                  padding: "2px 9px", fontSize: 10, fontWeight: 700, marginLeft: "auto" }}>
                  {v.cumplimiento}
                </span>
              </div>

              {/* Timeline horizontal */}
              <div className="vn-timeline-wrap">
                <div className="vn-timeline">
                  {etapas.map((et, ei) => (
                    <React.Fragment key={ei}>
                      <div className="vn-node">
                        <div className="vn-node-circle"
                          style={{ background: et.ok ? v.color + "30" : et.activo ? "#1e3a5f" : "#1e293b",
                            borderColor: et.ok ? v.color : et.activo ? "#3b82f6" : "#334155",
                            boxShadow: et.ok ? `0 0 14px ${v.color}50` : et.activo ? "0 0 10px #3b82f640" : "none" }}>
                          {et.ok
                            ? <span style={{ fontSize: 20 }}>{et.icono}</span>
                            : et.activo
                              ? <span style={{ fontSize: 18 }} className="vn-pulse">🔄</span>
                              : <span style={{ color: "#334155", fontSize: 16 }}>◯</span>}
                        </div>
                        <div className={`vn-node-label ${et.ok ? "done" : et.activo ? "active" : ""}`}>
                          {et.label}
                        </div>
                        {et.prog && <div className="vn-node-time-prog">Prog: {et.prog.slice(0, 16)}</div>}
                        {et.real && et.real !== et.prog && (
                          <div className="vn-node-time-real" style={{ color: v.color }}>
                            Real: {et.real.slice(0, 16)}
                          </div>
                        )}
                      </div>
                      {ei < etapas.length - 1 && (
                        <div className="vn-connector"
                          style={{ background: et.ok ? v.color + "70" : "#1e293b" }} />
                      )}
                    </React.Fragment>
                  ))}
                </div>
              </div>

              {/* Detalle */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginTop: 14 }}>
                {[
                  ["Circuito",   v.circuito,                             "#a78bfa"],
                  ["Coordinador",(v.coordinador || "").split(" ")[0],    ccLocal(v.coordinador)],
                  ["Origen",     v.origen || "—",                        "#64748b"],
                  ["Destino",    v.destino || "—",                       "#64748b"],
                  ["Δ Tiempo",   v.difMin !== null
                    ? (v.difMin > 0 ? "+" : "") + v.difMin + " min" : "—",
                    v.difMin > 0 ? "#ef4444" : v.difMin < 0 ? "#10b981" : "#64748b"],
                  ["Monto",      v.monto > 0 ? fmt$(v.monto) : "—",     "#10b981"],
                ].map(([l, val, col2]) => (
                  <div key={l}>
                    <div style={{ color: "#334155", fontSize: 8, textTransform: "uppercase" }}>{l}</div>
                    <div style={{ color: col2, fontWeight: 700, fontSize: 11 }}>{val}</div>
                  </div>
                ))}
              </div>

              {/* Incidencias de la unidad */}
              {(incMap[v.id] || []).length > 0 && (
                <div style={{ marginTop: 12, background: "#f59e0b10",
                  border: "1px solid #f59e0b30", borderRadius: 8, padding: 10 }}>
                  <div style={{ color: "#f59e0b", fontSize: 11, fontWeight: 700, marginBottom: 6 }}>
                    ⚠️ Incidencias ({(incMap[v.id] || []).length})
                  </div>
                  {(incMap[v.id] || []).map((inc, i) => (
                    <div key={i} style={{ fontSize: 10, color: "#94a3b8", marginBottom: 3 }}>
                      <span style={{ color: "#f59e0b", fontWeight: 700 }}>
                        {inc.auto ? "🤖 " : ""}{inc.tipo}
                      </span>
                      {inc.min && <span style={{ color: "#64748b", marginLeft: 6 }}>{inc.min} min</span>}
                      {inc.comentario && <span style={{ color: "#475569", marginLeft: 6 }}>· {inc.comentario}</span>}
                    </div>
                  ))}
                </div>
              )}

              {/* Observaciones */}
              {v.observaciones && (
                <div style={{ marginTop: 10, background: "#0f172a",
                  borderRadius: 7, padding: "8px 12px", fontSize: 10, color: "#64748b" }}>
                  📝 {v.observaciones}
                </div>
              )}
            </div>
          ) : (
            <div style={{ color: "#334155", textAlign: "center", padding: 24 }}>
              Selecciona una unidad para ver su timeline
            </div>
          )}
        </div>
      );
    }

    // ── RENDER PRINCIPAL ──────────────────────────────────────────────────
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {/* Header */}
        <div>
          <div style={{ color: "#475569", fontSize: 11, textTransform: "uppercase", letterSpacing: 2 }}>
            Torre de Control · Sem {res.weekNum || "—"}
          </div>
          <div style={{ color: "#f1f5f9", fontSize: 20, fontWeight: 900, marginTop: 2 }}>
            🏗️ Ventanas Operativas
          </div>
          <div style={{ color: "#334155", fontSize: 10, marginTop: 2 }}>
            {ventanas.length} ventanas · {incTotal > 0 ? `⚠️ ${incTotal} incidencias` : "Sin incidencias"} · {res.flota?.fecha}
          </div>
        </div>

        {/* Filtros */}
        <FiltrosBar />

        {/* KPIs */}
        <KPIBar />

        {/* Sub-tabs */}
        <div className="vn-subtabs">
          {[["tablero","📅 Tablero"], ["monitoreo","📊 Monitoreo"], ["timeline","⏱ Timeline"]].map(([id, l]) => (
            <button key={id} className={`vn-subtab ${vista === id ? "active" : ""}`}
              onClick={() => setVista(id)}>{l}</button>
          ))}
        </div>

        {/* Vistas */}
        <div>
          {vista === "tablero"    && <Tablero />}
          {vista === "monitoreo"  && <Monitoreo />}
          {vista === "timeline"   && <Timeline />}
        </div>
      </div>
    );
  }

  // Exponer globalmente para que app.jsx lo consuma
  window.VentanasOperativas = VentanasOperativas;

})();
