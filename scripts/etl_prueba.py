"""
Prueba de extremo a extremo del esquema Atlas Analytics.

Carga los Excel reales de agosto 2026 en el modelo canónico y ejecuta
calcular_kpi_periodo(), para verificar que el esquema produce los mismos
números que el análisis exploratorio hecho con pandas.
"""
import datetime
import re
import unicodedata

import pandas as pd
import psycopg2
import psycopg2.extras

U = "/root/.claude/uploads/429aaaed-c793-5b50-a4bd-284b7bc3979c/"
DSN = "host=/tmp port=5433 user=postgres dbname=atlas"


def norm(s):
    """Espejo de normaliza_texto() en SQL."""
    s = unicodedata.normalize("NFKD", str(s))
    s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", s).strip().lower()


cn = psycopg2.connect(DSN)
cn.autocommit = True
cur = cn.cursor()

# --- limpieza -------------------------------------------------------
cur.execute("""
    truncate kpi_ejecutivo, kpi_equipo, periodo, venta_asegurado, venta,
             cotizacion, asistencia, ejecutivo_alias, ejecutivo_campana,
             ejecutivo, cliente, producto, meta, campana, perfil, tenant
    restart identity cascade
""")

# --- tenant y campaña ----------------------------------------------
cur.execute(
    "insert into tenant (nombre, slug) values ('Atlas', 'atlas') returning id")
tenant = cur.fetchone()[0]

cur.execute("""insert into campana (tenant_id, nombre, tipo, fecha_inicio)
               values (%s, 'Venta Seguros', 'venta', '2026-08-01') returning id""",
            (tenant,))
campana = cur.fetchone()[0]

# --- productos ------------------------------------------------------
productos = {
    "Seguro Complementario":    ("Complementario", "CM+CAT"),
    "Seguro Catastrófico":      ("Catastrófico",   "CM+CAT"),
    "Seguro Oncológico":        ("Oncológico",     "ONCO"),
    "Seguro Oncológico Total":  ("Oncológico",     "ONCO"),
}
prod_id = {}
for nombre, (linea, agr) in productos.items():
    cur.execute("""insert into producto (tenant_id, nombre, linea, agrupacion_meta)
                   values (%s,%s,%s,%s) returning id""",
                (tenant, nombre, linea, agr))
    prod_id[nombre] = cur.fetchone()[0]

# --- metas ----------------------------------------------------------
for agr, valor in (("CM+CAT", 250), ("ONCO", 60)):
    cur.execute("""insert into meta (tenant_id, campana_id, agrupacion_meta, unidad,
                                     valor, dg_esperados, periodo_inicio, periodo_fin)
                   values (%s,%s,%s,'asegurados',%s,22,'2026-08-01','2026-08-31')""",
                (tenant, campana, agr, valor))

# --- ejecutivos: conciliación de alias ------------------------------
v = pd.read_excel(U + "eb799181-venta_20260812_230240.xlsx", sheet_name="VENTA")
c = pd.read_excel(U + "c7b30aef-cotizaciones_20260812_230356.xlsx",
                  sheet_name="Cotizaciones")

nombres = {}
for raw in list(v["Ejecutivo Venta"].dropna()) + list(c["Usuario"].dropna()):
    nombres.setdefault(norm(raw), raw)

ejec_id = {}
for clave, original in nombres.items():
    cur.execute("""insert into ejecutivo (tenant_id, nombre_canonico, jornada_horas)
                   values (%s,%s,42) returning id""",
                (tenant, " ".join(str(original).split())))
    eid = cur.fetchone()[0]
    ejec_id[clave] = eid
    cur.execute("""insert into ejecutivo_alias (tenant_id, ejecutivo_id, alias_original, origen)
                   values (%s,%s,%s,'excel')""", (tenant, eid, original))
    cur.execute("""insert into ejecutivo_campana (ejecutivo_id, campana_id, desde)
                   values (%s,%s,'2026-08-01')""", (eid, campana))

# alias sucios adicionales: el mismo nombre con espacio doble ya normalizado
print(f"ejecutivos conciliados: {len(ejec_id)} "
      f"(de {v['Ejecutivo Venta'].nunique()} en ventas + "
      f"{c['Usuario'].nunique()} en cotizaciones)")

# --- asistencia (unpivot de la hoja matriz) -------------------------
asis = pd.read_excel(U + "3216e5e2-Asistencia_UCC_1208.xlsx",
                     sheet_name="Agosto", header=None)
fechas_fila = asis.iloc[2]
cols_fecha = {i: pd.Timestamp(fechas_fila[i]) for i in range(2, asis.shape[1])
              if isinstance(fechas_fila[i], (pd.Timestamp, datetime.datetime,
                                             datetime.date))}

marcas_ok = {"P", "A", "V", "L", "B", "F", "S"}
n_asis = 0
for r in range(3, len(asis)):
    nombre = asis.iloc[r, 1]
    if not isinstance(nombre, str) or not nombre.strip():
        continue
    # el nombre en asistencia es completo; se busca por primer + apellido
    partes = norm(nombre).split()
    match = next((k for k in ejec_id
                  if partes[0] in k and any(p in k for p in partes[1:])), None)
    if not match:
        continue
    jornada = 42
    if isinstance(asis.iloc[r, 0], str) and "hrs" in asis.iloc[r, 0]:
        jornada = float(re.sub(r"[^0-9]", "", asis.iloc[r, 0]))
    for ci, fecha in cols_fecha.items():
        m = asis.iloc[r, ci]
        if isinstance(m, str) and m.strip().upper() in marcas_ok:
            cur.execute("""insert into asistencia
                             (tenant_id, ejecutivo_id, campana_id, fecha, marca, jornada_horas)
                           values (%s,%s,%s,%s,%s,%s)
                           on conflict (ejecutivo_id, fecha) do nothing""",
                        (tenant, ejec_id[match], campana, fecha.date(),
                         m.strip().upper(), jornada))
            n_asis += 1
print(f"marcas de asistencia cargadas (unpivot): {n_asis}")

# --- cotizaciones ---------------------------------------------------
for _, row in c.iterrows():
    cur.execute("""insert into cotizacion
                     (tenant_id, campana_id, ejecutivo_id, producto_id, fecha,
                      nombre_cotizante, email, telefono, sistema_salud,
                      precio_uf, precio_clp, valor_uf, procedencia_lead)
                   values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                (tenant, campana, ejec_id[norm(row["Usuario"])],
                 prod_id.get(row["Producto Cotizado"]), row["Fecha Cotización"],
                 row["Nombre Cotizante"], row["Email Cotizante"],
                 str(row["Teléfono Cotizante"]), row["Sistema Salud Cotizante"],
                 row["Precio UF"], row["Precio $"], row["Valor UF"],
                 row["Procedencia Leads"]))

# --- ventas + asegurados + preexistencias ---------------------------
def parse_persona(txt):
    """'72941 | 15599629-3 | Ximena Cespedes | 11-05-1984 | Endometriosis'"""
    p = [t.strip() for t in str(txt).split("|")]
    p += [""] * (5 - len(p))
    return p[1], p[2], p[3], p[4]


ben_cols = [x for x in v.columns if str(x).startswith("Datos Beneficiario")]
n_pre = 0
for _, row in v.iterrows():
    rut, nombre, fnac, _ = parse_persona(row["Datos Titular"])
    cur.execute("""insert into cliente (tenant_id, rut, nombre, email, telefono,
                                        fecha_nacimiento, sexo, prevision)
                   values (%s,%s,%s,%s,%s,%s,%s,%s)
                   on conflict (tenant_id, rut) do update set nombre = excluded.nombre
                   returning id""",
                (tenant, row["Rut Contratante"], row["Nombre Contratante"],
                 row["Email Contratante"], str(row["Teléfono Contratante"]),
                 pd.to_datetime(fnac, dayfirst=True, errors="coerce"),
                 row["Genero Contratante"], row["Sistema Salud"]))
    cliente = cur.fetchone()[0]

    cur.execute("""insert into venta
                     (tenant_id, campana_id, ejecutivo_id, cliente_id, producto_id,
                      nro_solicitud, codigo_contrato, fecha_solicitud, fecha_pago,
                      precio_uf, precio_clp, valor_uf, cobertura, medio_pago,
                      canal, n_asegurados)
                   values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                   returning id""",
                (tenant, campana, ejec_id[norm(row["Ejecutivo Venta"])], cliente,
                 prod_id.get(row["Plan"]), str(row["Nro. Solicitud"]),
                 str(row["Código Contrato"]),
                 pd.to_datetime(row["Fecha Solicitud"], dayfirst=True),
                 pd.to_datetime(row["Fecha Pago"], dayfirst=True),
                 row["Precio UF"], row["Precio $"], row["Valor UF $"],
                 str(row["Cobertura"]), row["Medio de Pago"],
                 row["Canal Ejecutivo"], int(row["Número Beneficiarios"])))
    venta_id = cur.fetchone()[0]

    personas = [("titular", row["Datos Titular"])]
    personas += [("carga", row[bc]) for bc in ben_cols if pd.notna(row[bc])]

    for orden, (par, txt) in enumerate(personas, start=1):
        rut_a, nom_a, fn_a, pre = parse_persona(txt)
        cur.execute("""insert into venta_asegurado
                         (tenant_id, venta_id, orden, parentesco, rut, nombre, fecha_nacimiento)
                       values (%s,%s,%s,%s,%s,%s,%s) returning id""",
                    (tenant, venta_id, orden, par, rut_a or None, nom_a,
                     pd.to_datetime(fn_a, dayfirst=True, errors="coerce")))
        aseg_id = cur.fetchone()[0]
        for item in [t.strip() for t in pre.split(",") if t.strip()]:
            cur.execute("""insert into venta_preexistencia
                             (tenant_id, venta_asegurado_id, texto_declarado)
                           values (%s,%s,%s)""", (tenant, aseg_id, item))
            n_pre += 1

print(f"preexistencias explotadas a filas: {n_pre}")

# --- periodo y cálculo de KPI ---------------------------------------
cur.execute("""insert into periodo (tenant_id, tipo, fecha_inicio, fecha_fin, etiqueta)
               values (%s,'mes','2026-08-01','2026-08-31','Agosto 2026') returning id""",
            (tenant,))
periodo = cur.fetchone()[0]

cur.execute("select calcular_kpi_periodo(%s)", (periodo,))
print(f"filas de KPI calculadas: {cur.fetchone()[0]}")

# --- verificación ---------------------------------------------------
print("\n" + "=" * 78)
print("VERIFICACIÓN: esquema SQL vs análisis exploratorio en pandas")
print("=" * 78)

cur.execute("""
  select sum(contratos), sum(asegurados), sum(cotizaciones), round(sum(uf),2)
    from kpi_ejecutivo where periodo_id = %s""", (periodo,))
print("SQL    -> contratos %s | asegurados %s | cotizaciones %s | UF %s" % cur.fetchone())
print("pandas -> contratos 83 | asegurados 104 | cotizaciones 2064 | UF 36.08")

print("\nTop 6 por IP-D (asegurados netos / día gestionado):")
cur.execute("""
  select e.nombre_canonico, k.dg, k.cotizaciones, k.contratos, k.asegurados,
         k.ip_d, k.ip_c, k.cuartil_ip_d, k.ranking
    from kpi_ejecutivo k join ejecutivo e on e.id = k.ejecutivo_id
   where k.periodo_id = %s and k.dg > 0
   order by k.ip_d desc nulls last limit 6""", (periodo,))
print(f"{'ejecutivo':28s} {'DG':>3s} {'cot':>5s} {'con':>4s} {'aseg':>5s} "
      f"{'IP-D':>6s} {'IP-C':>6s} {'Q':>2s} {'rk':>3s}")
for r in cur.fetchall():
    print(f"{r[0][:28]:28s} {r[1]:3d} {r[2]:5d} {r[3]:4d} {r[4]:5d} "
          f"{r[5] or 0:6.2f} {r[6] or 0:6.3f} {r[7] or 0:2d} {r[8] or 0:3d}")

print("\nCumplimiento por agrupación de meta:")
cur.execute("""
  select p.agrupacion_meta,
         sum(v.n_asegurados) as asegurados,
         m.valor as meta,
         round(sum(v.n_asegurados) / m.valor * 100, 1) as pct
    from venta v
    join producto p on p.id = v.producto_id
    join meta m on m.agrupacion_meta = p.agrupacion_meta
                and m.campana_id = v.campana_id
   where v.fecha_solicitud::date between '2026-08-01' and '2026-08-31'
   group by p.agrupacion_meta, m.valor order by 1""")
for r in cur.fetchall():
    print(f"  {r[0]:8s} {r[1]:4d} de {r[2]:6.0f}  = {r[3]:5.1f}%")

cur.close()
cn.close()
