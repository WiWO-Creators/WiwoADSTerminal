/**
 * Las dos empresas del grupo. Trabajan juntas: la empresa es solo un tema de orden (agrupa los selectores y las
 * listas), no limita quién ve qué. Puro (sin red ni base de datos).
 */
export const EMPRESAS = ["mgc", "wiwo"] as const;
export type Empresa = (typeof EMPRESAS)[number];

export const EMPRESA_LABELS: Record<Empresa, string> = { mgc: "MGC", wiwo: "WIWO" };

export function esEmpresa(valor: unknown): valor is Empresa {
  return typeof valor === "string" && (EMPRESAS as readonly string[]).includes(valor);
}

type ConEmpresa = { empresa?: Empresa | null; archivado?: boolean };

/**
 * Los clientes que se ofrecen (sin archivados), agrupados por empresa en el orden MGC, WIWO y «Sin empresa». Si todos
 * quedan en un solo grupo, el título sobra y se devuelve `etiqueta: null`.
 */
export function agruparPorEmpresa<T extends ConEmpresa>(clientes: T[]): Array<{ empresa: Empresa | null; etiqueta: string | null; clientes: T[] }> {
  const visibles = clientes.filter((c) => !c.archivado);
  const grupos = [...EMPRESAS, null].map((e) => ({
    empresa: e as Empresa | null,
    etiqueta: e ? EMPRESA_LABELS[e] : "Sin empresa",
    clientes: visibles.filter((c) => (c.empresa ?? null) === e),
  }));
  const conClientes = grupos.filter((g) => g.clientes.length > 0);
  return conClientes.length <= 1 ? conClientes.map((g) => ({ ...g, etiqueta: null })) : conClientes;
}
