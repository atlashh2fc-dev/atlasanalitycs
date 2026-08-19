-- calcular_kpi_periodo recibe un UUID arbitrario y es una pieza interna.
-- Las sesiones de aplicacion deben entrar por recalcular_periodos_carga,
-- que deriva y valida el tenant desde auth.uid().
revoke execute on function public.calcular_kpi_periodo(uuid) from authenticated;
