create index carga_reconciliacion_venta_tenant_idx
  on carga_reconciliacion_venta (tenant_id);

create index carga_reconciliacion_venta_carga_anterior_idx
  on carga_reconciliacion_venta (carga_anterior_id);
