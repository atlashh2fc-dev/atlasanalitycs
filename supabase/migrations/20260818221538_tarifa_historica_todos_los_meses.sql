-- La tarifa informada por el mandante es la misma para todo el historial
-- disponible. Se retrotrae su vigencia para que los meses anteriores a la
-- carga inicial (por ejemplo julio de 2026) se valoricen con los mismos
-- tramos, sin duplicar filas ni alterar las ventas.
update tarifa
set vigencia_desde = date '1900-01-01',
    vigencia_hasta = null
where vigencia_desde = date '2026-08-01';
