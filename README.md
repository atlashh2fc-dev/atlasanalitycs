# Atlas Analytics

Motor de **"sube tu Excel y obtén un dashboard"**. Cada archivo se suma a su
campaña con campos, métricas, dimensiones y fechas detectadas; los packs de
negocio, como contact center, se activan sólo cuando corresponden.

Next.js 15 (App Router) · TypeScript · Node 22 · Tailwind 4 · Recharts ·
Supabase · Vercel.

---

## Cómo funciona

**Capa genérica.** El usuario elige una campaña y sube cualquier Excel. Atlas
acumula todas sus cargas en un único historial, perfila cada hoja en
el navegador, clasifica las columnas **por su contenido y no por su nombre**,
pregunta sólo por las ambiguas y conserva todas las filas originales. Un catálogo
estable de campos alimenta consultas dinámicas y un primer dashboard automático.
La confirmación alimenta un diccionario de sinónimos, así que la siguiente carga
con la misma estructura se procesa sola.

**Pack contact center opcional.** Cuando aparece la firma típica (RUT + fecha + ejecutivo
+ producto), se generan los dashboards de gestión de venta outbound sin que el
usuario configure nada.

### Por qué el perfilado va por contenido

Los archivos reales que originaron el diseño traían columnas llamadas `dede`,
`deded` y `DEDED` que contenían el **tramo etario**, y la columna de RUT
aparecía con cinco nombres distintos entre hojas (`RUT_BENEFICIARIO`,
`Rut_Beneficiario`, `Rut Contratante`…). Un perfilador que confíe en el
encabezado bota datos útiles y se rompe cada mes.

`lib/perfilador.ts` detecta RUT validando módulo 11 sobre una muestra, fechas,
teléfonos chilenos, emails, UF vs. pesos y categorías; descarta columnas de
varianza cero; detecta hojas en formato matriz (fechas en cabecera, entidades en
filas) para hacer unpivot; y lee metadatos del nombre de la hoja (`CM 5` →
línea CM, día 5).

---

## Estructura

```
app/
  inicio/           entrada basada en las campañas reales del usuario
  datos/            cargas, campos, calidad e historial por campaña
  analisis/         dashboard automático de métricas y dimensiones detectadas
  login/            autenticación con Supabase
  dashboard/        pack especializado de ventas (ruta compatible)
  equipo/           movilidad de cuartiles y matriz de transición
  cargar/           subida, perfilado y mapeo confirmable
  mantenedor/       configuración y funciones especializadas contextuales
  api/
    cargar/         inserta filas crudas y deriva al modelo canónico
    recalcular/     congela el periodo y ejecuta calcular_kpi_periodo
    inicializar/    arranque de la organización
components/
  charts/           gráficos Recharts con paleta validada
  ui/               card, stat tiles, badges
lib/
  perfilador.ts     clasificación de columnas por contenido
  rut.ts            normalización y módulo 11
  datos.ts          consultas del dashboard
  supabase/         clientes browser / server / middleware
supabase/migrations/  historial SQL canónico del proyecto
scripts/etl_prueba.py prueba de extremo a extremo con datos reales
```

---

## Métricas

Tres índices de productividad, porque son tres preguntas de gestión distintas y
no se promedian en un solo número:

| Índice | Fórmula | Responde |
|---|---|---|
| **IP-D** | asegurados netos / días gestionados | ¿cuánto produce por día trabajado? |
| **IP-C** | asegurados / cotizaciones | ¿qué tan bien convierte lo que toca? |
| **IP-V** | UF / días gestionados | ¿cuánto valor produce? |

Se leen cruzados en la matriz de diagnóstico del dashboard. Sin IP-C, un ranking
por volumen premia a quien más gestiona aunque cierre peor — en los datos reales
había un ejecutivo con 404 cotizaciones y 6 contratos junto a otro con 75 y 12.

La unidad de la meta es **asegurados = titular + cargas**, no contratos.

### Movilidad de cuartiles

Los KPI se congelan por periodo en `kpi_ejecutivo`, así el histórico no cambia
cuando llegan correcciones. `v_movilidad_cuartil` compara a cada ejecutivo con
su propio cuartil anterior (`sube`, `baja`, `estable_alto`, `estable_medio`,
`estable_bajo`) y `v_matriz_transicion` agrega el movimiento del equipo.

`ntile(4)` ordena ascendente: **cuartil 4 = mejor desempeño, 1 = peor.**
Un ejecutivo estancado en el cuartil inferior varios periodos seguidos es la
alerta de intervención más accionable del sistema.

---

## Puesta en marcha

### 1. Variables de entorno

```bash
cp .env.example .env.local
```

```
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<publishable key>
```

### 2. Base de datos

Las migraciones versionadas ya están aplicadas en el proyecto Supabase
`atlas-analytics`.
Para un entorno nuevo:

```bash
supabase link --project-ref <ref>
supabase db push
```

### 3. Local

```bash
npm install
npm run dev
```

### 4. Vercel

Importar el repo, agregar las dos variables de entorno y desplegar. No requiere
configuración adicional: el build de Next detecta el App Router.

### 5. Primer uso

1. Crear el usuario en Supabase → Authentication → Users.
2. Entrar a la app e ir a **Mantenedor → Inicializar**. Eso crea la organización,
   el perfil admin, la campaña base, los cuatro productos y las metas del mes
   (250 CM+CAT / 60 Oncológico).
3. Entrar a la campaña y **cargar datos** con todos sus archivos diarios.
4. El dashboard se arma solo.

---

## Seguridad

Row Level Security en las 36 tablas. El administrador ve todo su tenant; el
supervisor sólo las campañas que tiene asignadas. Las funciones `SECURITY
DEFINER` tienen `search_path` fijo y `EXECUTE` revocado para `anon`. Las
extensiones viven fuera del esquema `public`.

Las preexistencias médicas **no se enmascaran**: son parte del producto que se
entrega al cliente. Se categorizan con la taxonomía GES/AUGE del MINSAL
(90 problemas de salud en 10 categorías), con capítulo CIE-10 como respaldo para
lo que no calza.

---

## Verificación

El esquema se validó cargando los Excel reales de agosto 2026 de punta a punta
en PostgreSQL: reprodujo exactamente las cifras del análisis exploratorio
—83 contratos, 104 asegurados, 2.064 cotizaciones, 36,08 UF— incluido el unpivot
de las planillas de asistencia y la explosión de los campos concatenados de
beneficiarios.

```bash
python3 scripts/etl_prueba.py
```

---

## Pendientes de dato

- **Base de anulaciones** → habilita venta neta, persistencia e índice de venta sana
- **Catálogo del checklist DPS** → completa el mapeo a las categorías GES
- **Datos del discador** → habilita contactabilidad, intentos y contacto efectivo
- **Meses anteriores** → serie histórica para la movilidad de cuartiles
