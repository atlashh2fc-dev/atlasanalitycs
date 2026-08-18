import { redirect } from "next/navigation";

/** Compatibilidad con favoritos antiguos: la portada útil es Control. */
export default function Inicio() {
  redirect("/bsc");
}
