import { Nav } from "@/components/nav";
import { getContexto } from "@/lib/datos";
import { Cargador } from "./cargador";

export const dynamic = "force-dynamic";

export default async function Cargar() {
  const ctx = await getContexto();

  return (
    <>
      <Nav email={ctx.email} />

      <main className="mx-auto max-w-[1100px] px-6 py-6">
        <div className="mb-6">
          <h1 className="text-xl font-semibold tracking-tight">Cargar datos</h1>
          <p className="mt-0.5 max-w-2xl text-sm text-[var(--text-secondary)]">
            Sube cualquier Excel. Atlas perfila las columnas por su contenido
            —no por su nombre—, propone el mapeo y tú lo confirmas una vez. La
            próxima carga con la misma estructura se procesa sola.
          </p>
        </div>

        <Cargador campanas={ctx.campanas} />
      </main>
    </>
  );
}
