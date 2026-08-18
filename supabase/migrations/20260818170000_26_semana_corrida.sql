-- ---------------------------------------------------------------------
-- 26 · Semana corrida, y la unidad la define el tramo
-- ---------------------------------------------------------------------
-- Dos cosas:
--
-- 1. Semana corrida. El artículo 45 del Código del Trabajo da derecho a
--    pago por el día de descanso semanal calculado sobre la
--    remuneración variable devengada día a día. En la práctica mensual
--    equivale a dividir la comisión por los días que se trabaja en la
--    semana: con cinco días, un 20% extra.
--
--    Se guarda como factor y no como cálculo de calendario a propósito:
--    el promedio legal es semanal, así que contar domingos del mes
--    contra días hábiles del mes da un número distinto del que
--    corresponde. El factor es 1 dividido por los días trabajados por
--    semana, se audita de un vistazo y se edita si el contrato cambia.
--
--    Se aplica a la comisión y no a los bonos: el bono de productividad
--    es mensual y no se devenga día a día.
--
-- 2. La unidad del tramo la define el propio tramo. Oncológico paga por
--    beneficiario; complementario paga por venta efectiva. Antes la
--    función multiplicaba siempre por beneficiarios, lo que habría
--    pagado de más en complementario apenas una póliza tuviera cargas.
-- ---------------------------------------------------------------------

alter table remuneracion
  add column if not exists factor_semana_corrida numeric(6,4) not null default 0.2000;

comment on column remuneracion.factor_semana_corrida is
  'Proporción de la comisión que se paga como semana corrida. 0.20 = un
   día de descanso por cada cinco trabajados. 0 la desactiva.';

alter table remuneracion drop constraint if exists remuneracion_semana_corrida_valida;
alter table remuneracion add constraint remuneracion_semana_corrida_valida
  check (factor_semana_corrida >= 0 and factor_semana_corrida <= 1);

drop function if exists comision_ejecutivo(date, date, uuid);

create or replace function comision_ejecutivo(
  p_desde date,
  p_hasta date,
  p_campana uuid default null
)
returns table (
  ejecutivo_id       uuid,
  ejecutivo          text,
  agrupacion_meta    text,
  contratos          int,
  beneficiarios      int,
  unidad             text,
  tramo_clp          numeric,
  comision_clp       numeric,
  semana_corrida_clp numeric,
  bonos_clp          numeric,
  total_clp          numeric
)
language sql
stable
security invoker
set search_path = public
as $fn$
with produccion as (
  select
    v.ejecutivo_id,
    pr.agrupacion_meta,
    count(distinct v.id)::int   as contratos,
    count(va.id)::int           as beneficiarios
  from venta v
  join producto pr on pr.id = v.producto_id
  join venta_asegurado va on va.venta_id = v.id
  where v.fecha_solicitud::date between p_desde and p_hasta
    and v.ejecutivo_id is not null
    and (p_campana is null or v.campana_id = p_campana)
  group by 1, 2
),
factores as (
  select r.ejecutivo_id, r.factor_semana_corrida
  from remuneracion r
  where r.vigencia_desde <= p_hasta
    and (r.vigencia_hasta is null or r.vigencia_hasta >= p_desde)
),
tramo as (
  select
    p.ejecutivo_id, p.agrupacion_meta, p.contratos, p.beneficiarios,
    (select to_jsonb(c) from comision c
      where c.agrupacion_meta = p.agrupacion_meta
        and c.tipo = 'escalonada'
        and (p_campana is null or c.campana_id = p_campana)
        and c.vigencia_desde <= p_hasta
        and (c.vigencia_hasta is null or c.vigencia_hasta >= p_desde)
        and c.desde <= case c.base
                         when 'beneficiario' then p.beneficiarios
                         else p.contratos
                       end
      order by c.desde desc limit 1) as t,
    coalesce((
      select sum(c.monto_clp) from comision c
      where c.agrupacion_meta = p.agrupacion_meta
        and c.tipo = 'bono' and c.acumulable
        and (p_campana is null or c.campana_id = p_campana)
        and c.vigencia_desde <= p_hasta
        and (c.vigencia_hasta is null or c.vigencia_hasta >= p_desde)
        and c.desde <= case c.base
                         when 'beneficiario' then p.beneficiarios
                         else p.contratos
                       end
    ), 0)
    + coalesce((
      select c.monto_clp from comision c
      where c.agrupacion_meta = p.agrupacion_meta
        and c.tipo = 'bono' and not c.acumulable
        and (p_campana is null or c.campana_id = p_campana)
        and c.vigencia_desde <= p_hasta
        and (c.vigencia_hasta is null or c.vigencia_hasta >= p_desde)
        and c.desde <= case c.base
                         when 'beneficiario' then p.beneficiarios
                         else p.contratos
                       end
      order by c.desde desc limit 1
    ), 0) as bonos_clp
  from produccion p
),
con_monto as (
  select
    tr.*,
    (tr.t->>'base') as base_tramo,
    coalesce((tr.t->>'monto_clp')::numeric, 0) as monto_tramo,
    coalesce((tr.t->>'monto_clp')::numeric, 0) *
      case when tr.t->>'base' = 'beneficiario' then tr.beneficiarios else tr.contratos end
      as comision_clp
  from tramo tr
)
select
  c.ejecutivo_id,
  e.nombre_canonico,
  c.agrupacion_meta,
  c.contratos,
  c.beneficiarios,
  case c.base_tramo when 'beneficiario' then 'beneficiario' when 'contrato' then 'venta' end,
  nullif(c.monto_tramo, 0),
  round(c.comision_clp, 0),
  round(c.comision_clp * coalesce(f.factor_semana_corrida, 0), 0),
  round(c.bonos_clp, 0),
  round(
    c.comision_clp
    + c.comision_clp * coalesce(f.factor_semana_corrida, 0)
    + c.bonos_clp, 0)
from con_monto c
join ejecutivo e on e.id = c.ejecutivo_id
left join factores f on f.ejecutivo_id = c.ejecutivo_id
order by 11 desc;
$fn$;

comment on function comision_ejecutivo is
  'Comisión, semana corrida y bonos por ejecutivo y línea. El tramo
   alcanzado se aplica a toda la producción del periodo, no sólo al
   excedente, y su unidad —beneficiario o venta efectiva— la define el
   propio tramo. La semana corrida no incluye los bonos.';
