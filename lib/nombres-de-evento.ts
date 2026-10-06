/**
 * Normaliza el nombre de un evento para detectar el mismo evento escrito de dos
 * maneras: sin mayúsculas ni tildes, y con cualquier separador como «_».
 * «Contacto-salesforce» y «contacto_salesforce» quedan iguales.
 */
export function normalizarNombreDeEvento(nombre: string): string {
  return nombre
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}
