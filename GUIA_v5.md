# 🚚 GUÍA COMPLETA v5 — Conexión y Despliegue
## ERP NAL conectado a sistema_logistico.xlsx

---

## ARCHIVOS EN ESTE ZIP

```
erp-v5/
├── index.html       ← Aquí pegas tu URL de Apps Script
├── app.jsx          ← App completa (interfaz sin cambios)
├── manifest.json    ← App instalable en celular
├── sw.js            ← Funciona offline
└── apps-script.gs   ← Código para Google Apps Script
```

---

## PASO 1 — APPS SCRIPT en tu Sheets

Tu archivo ya está en Google Drive como Google Sheets.

1. Ábrelo en Google Sheets
2. Click en **Extensiones → Apps Script**
3. Borra TODO el código que aparece (Ctrl+A → Delete)
4. Abre el archivo `apps-script.gs` de este ZIP con Bloc de Notas
5. Copia todo el contenido → Pégalo en Apps Script
6. Click en el ícono 💾 **Guardar**
7. Click en **"Implementar"** → **"Nueva implementación"**
8. Click en el engrane ⚙️ → Selecciona **"Aplicación web"**
9. Configura:
   - Descripción: `ERP NAL v5`
   - Ejecutar como: **Yo**
   - Acceso: **Cualquier persona**
10. Click **"Implementar"** → **Autorizar** (elige tu cuenta)
11. Aparece la URL — cópiala, se ve así:
    `https://script.google.com/macros/s/AKfycbXXXXX/exec`

⚠️ IMPORTANTE: Si ya tenías un script anterior, crea una NUEVA implementación
para obtener una URL nueva y limpia.

---

## PASO 2 — CONECTAR LA APP

1. Abre el archivo `index.html` con **Bloc de Notas**
   (click derecho → Abrir con → Bloc de notas)

2. Busca esta línea (está cerca del inicio):
   ```
   window.SHEETS_URL = "PEGA_TU_URL_AQUI";
   ```

3. Reemplaza el texto dejando las comillas:
   ```
   window.SHEETS_URL = "https://script.google.com/macros/s/TUURL/exec";
   ```

4. Guarda el archivo (Ctrl+S)

---

## PASO 3 — SUBIR A GITHUB

1. Ve a github.com → tu repositorio
2. **Borra los archivos viejos:**
   - Click en `index.html` → ícono 🗑️ → "Commit changes"
   - Click en `app.jsx` → ícono 🗑️ → "Commit changes"
3. **Sube los 5 archivos nuevos:**
   - Click "Add file" → "Upload files"
   - Arrastra los 5 archivos del ZIP
   - Escribe en commit: "ERP NAL v5 con Sheets"
   - Click "Commit changes"
4. Espera 2 minutos → abre tu URL de GitHub Pages

La app debe mostrar en la barra superior:
**"☁️ Conectado a Google Sheets — HH:MM"**

---

## PASO 4 — INSTALAR EN CELULAR

### Android (Chrome):
1. Abre tu URL de GitHub Pages en Chrome
2. Espera que cargue completamente
3. Toca menú **⋮** (arriba a la derecha)
4. Toca **"Agregar a pantalla de inicio"**
   - Si no aparece: busca "Instalar aplicación"
5. Confirmar → ícono 🚚 en el celular ✅

### iPhone (Safari ÚNICAMENTE):
1. Abre la URL en **Safari** (no Chrome, no Firefox)
2. Toca el botón **Compartir** 📤 (al fondo de la pantalla)
3. Desplázate en el menú que aparece
4. Toca **"Agregar a pantalla de inicio"**
5. Confirmar → ícono 🚚 ✅

### Si el ícono da error al abrirse:
1. Mantén presionado el ícono → Eliminar/Borrar
2. Abre la URL en el navegador directamente
3. Vuelve a agregar a pantalla de inicio (el caché viejo causaba el error)

---

## CÓMO SE CONECTA CADA PESTAÑA DE TU ARCHIVO

| Pestaña en tu Sheets | Qué muestra en la app |
|---|---|
| **VIAJES** | Pestaña Viajes, Dashboard financiero, Tracker |
| **Estatus_diario** | Pestaña Unidades, KPIs de tractos |
| **Control_Cajas** | Pestaña Cajas, KPIs de cajas, Alertas |
| **RENDIMIENTOS** | KM/L por unidad y coordinador |
| **Circuito** | Sugerencias de ruta en Tracker y Distribución |
| **CLIENTES** | Referencia para sugerencias de carga (futuro GPS) |

---

## FLUJO DIARIO — Cómo actualizar

### Desde tu archivo Excel/Sheets:

**Opción A — Editas directamente en Sheets:**
1. Abre sheets.google.com → tu archivo
2. Actualiza la pestaña que corresponda:
   - `Estatus_diario` → para estatus de unidades del día
   - `VIAJES` → para programación y viajes realizados
   - `Control_Cajas` → para estatus de cajas
3. En la app → toca **🔄 Sincronizar** → listo

**Opción B — Pegas desde tu Excel a Sheets:**
1. En tu Excel actualiza los datos
2. Selecciona todo → Ctrl+C
3. Abre tu Sheets → ve a la pestaña correspondiente
4. Click en celda A2 (primera fila de datos, abajo del encabezado)
5. Ctrl+V para pegar
6. En la app → toca **🔄 Sincronizar**

**Opción C — Importar directo en la app:**
1. En la app → pestaña Unidades/Cajas/Viajes
2. Toca **📥 Importar**
3. Copia desde Excel → pega → Confirmar
4. Los datos se guardan localmente Y se envían a Sheets

---

## QUÉ HACE CADA SECCIÓN DE LA APP

### 📊 Dashboard
- KPIs de tractos desde **Estatus_diario** (En Ruta, Disponible, Mtto, Sin Op)
- KPIs de cajas desde **Control_Cajas** (Cargadas, Dañadas, No localizadas, etc.)
- Rentabilidad desde **VIAJES** (Venta Real, Costo, Utilidad, Margen)
- KM/L desde **RENDIMIENTOS** (promedio por coordinador y flota)
- Alertas automáticas de entregas vencidas

### 🛣️ Tracker
- Unidades en tránsito desde **VIAJES** con estatus "En tránsito/Programado"
- Timeline lineal con paradas del circuito
- Sugerencia de siguiente ruta desde **Circuito**

### 🗂️ Distribución
- Distribución por coordinador y por circuito
- % operando por circuito con barra visual

### 🚛 Unidades
- Tabla completa desde **Estatus_diario**
- Filtros por coordinador, estatus, motivo
- Columna de motivo exacto del sistema

### 📦 Cajas
- 130 cajas desde **Control_Cajas**
- Filtros por estatus, ciudad, coordinador
- Totales por estatus (Cargada 66, Disponible 18, Dañada 15, etc.)
- Edición individual sincronizada a Sheets

### 💰 Viajes
- 129+ viajes desde **VIAJES**
- Totales de Venta/Costo/Utilidad
- KM/L por viaje
- Semáforo de entrega

### 🔔 Alertas
- Generadas automáticamente desde todos los datos
- Entregas vencidas/hoy, cajas dañadas, sin operador, en taller, siniestros

---

## SOLUCIÓN DE PROBLEMAS

**La app dice "Modo local" en lugar de Sheets:**
→ La URL en index.html está mal o dice "PEGA_TU_URL_AQUI"
→ Abre index.html con Bloc de Notas → pega tu URL correcta → sube a GitHub

**Error al sincronizar (mensaje rojo):**
→ En Apps Script → Implementar → Gestionar implementaciones → lápiz ✏️
→ Verifica que "Acceso" sea "Cualquier persona" (no "Solo yo")
→ Si no, cambia y reimplementa → copia la nueva URL → actualiza index.html

**Los datos no se actualizan:**
→ Toca 🔄 Sincronizar en la app
→ Verifica que los encabezados de tu Sheets NO tienen espacios extra
→ La pestaña debe llamarse exactamente igual (VIAJES, Estatus_diario, etc.)

**"Cannot read properties of null":**
→ Alguna pestaña del Sheets está vacía o no tiene datos
→ Asegúrate de que al menos haya 1 fila de datos en VIAJES y Estatus_diario

---

## CUANDO CAMBIES DE SEMANA

1. En tu Sheets → pestaña VIAJES → agrega los viajes nuevos (o reemplaza todo)
2. En Estatus_diario → actualiza con la fecha del día y el estatus actual
3. En la app → toca 🔄 Sincronizar → la app muestra los datos nuevos

La app siempre muestra lo que hay en Sheets en ese momento.
No hay que "cerrar semana" ni hacer nada especial.

---

## PARA EL FUTURO — GPS

Cuando tengas la API de tu proveedor GPS (Samsara, Geotab, Traccar, etc.):
- Dime el proveedor y el formato de sus datos
- Conectamos el Tracker para mostrar la posición real en lugar de simulada
- Las alertas de wachicol se añaden en esa misma integración

---

v5 — Abril 2026 | Desarrollado con Claude (Anthropic)
