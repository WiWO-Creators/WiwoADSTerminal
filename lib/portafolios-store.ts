import semilla from "@/config/portafolios.json";
import { getRawDb } from "@/db";
import { can, type Actor } from "@/lib/permisos";

/**
 * Portafolios (clientes) en la base.
 *
 * Antes vivían en config/portafolios.json y los editaba yo a mano. Ahora los
 * crea el equipo desde la interfaz, así que el archivo pasa a ser solo la
 * semilla inicial: se vuelca una vez y después manda la base.
 *
 * Un portafolio agrupa cuentas publicitarias de distintas plataformas bajo un
 * mismo cliente, y guarda lo que Meta exige y las métricas no traen: la página
 * de Facebook y los países de segmentación.
 */

export class PortafolioError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
  ) {
    super(message);
  }
}

export type Portfolio = {
  id: string;
  name: string;
  pageId: string | null;
  instagramId: string | null;
  countries: string[];
  contactEmail: string | null;
  /** true cuando el dato lo dedujo el sistema y nadie lo confirmó. */
  needsReview: boolean;
  reviewNote: string | null;
  notes: string | null;
  /**
   * Metas de rendimiento para el motor de reglas. Sin ellas, el cliente
   * simplemente no genera recomendaciones de presupuesto — el motor nunca
   * inventa un umbral por su cuenta.
   */
  targetCpaMicros: number | null;
  /** Como razón real (3.5 = 3.5x), no en la unidad `_bp` que usa la base. */
  targetRoas: number | null;
  accountIds: string[];
  /**
   * Página de Facebook por cuenta de Meta, no por cliente.
   *
   * SQM lo exige: factura Meta desde tres cuentas —SPN/México, España,
   * LATAM— y cada una publica bajo su propia página regional. Claves con el
   * `external_id` tal como está en `accountIds`.
   */
  accountPages: Record<string, string | null>;
  /**
   * Países de segmentación por cuenta, no por cliente.
   *
   * ALO Group lo exige: seis cuentas de Google Ads, una por país (Chile,
   * Panamá, Perú, Colombia, Ecuador, Argentina). Un solo campo por cliente no
   * puede describir eso. Claves con el `external_id`, valores en códigos ISO.
   */
  accountCountries: Record<string, string[]>;
  /**
   * Plataforma de cada cuenta, como dato guardado.
   *
   * Antes se deducía mirando si la cuenta aparecía en las métricas, y eso
   * fallaba justo en el caso que importa: una cuenta recién creada, sin una
   * sola impresión, no aparece en ninguna métrica y quedaba "sin plataforma"
   * —invisible para el constructor— aunque estuviera perfectamente conectada.
   */
  accountProviders: Record<string, string | null>;
};

type PortfolioRow = {
  id: string;
  name: string;
  page_id: string | null;
  instagram_id: string | null;
  countries: string;
  contact_email: string | null;
  needs_review: number;
  review_note: string | null;
  notes: string | null;
  target_cpa_micros: number | null;
  target_roas_bp: number | null;
};

const SEED_FLAG = "portfolios_seed_v1";

/**
 * Vuelca el archivo de semilla la primera vez.
 *
 * Se hace una sola vez y queda marcado: si alguien borra un portafolio no debe
 * reaparecer solo en la siguiente carga.
 */
export async function ensureSeed(): Promise<void> {
  const db = getRawDb();
  const done = await db
    .prepare("SELECT value FROM app_meta WHERE key = ? LIMIT 1")
    .bind(SEED_FLAG)
    .first<{ value: string }>();
  if (done) return;

  const now = Date.now();
  type Declarado = {
    id: string;
    nombre: string;
    cuentas: string[];
    pagina?: string;
    paises?: string[];
  };
  const declarados = (semilla.portafolios ?? []) as Declarado[];

  const statements = [];
  for (const item of declarados) {
    statements.push(
      db
        .prepare(
          `INSERT OR IGNORE INTO portfolios
             (id, name, page_id, countries, created_at, updated_at, created_by)
           VALUES (?, ?, ?, ?, ?, ?, 'semilla')`,
        )
        .bind(
          item.id,
          item.nombre,
          item.pagina ?? null,
          (item.paises ?? []).join(","),
          now,
          now,
        ),
    );
    for (const cuenta of item.cuentas) {
      statements.push(
        db
          .prepare(
            `INSERT OR IGNORE INTO portfolio_accounts
               (id, portfolio_id, external_id, created_at)
             VALUES (?, ?, ?, ?)`,
          )
          .bind(`${item.id}::${cuenta}`, item.id, cuenta, now),
      );
    }
  }
  statements.push(
    db
      .prepare(
        "INSERT OR IGNORE INTO app_meta (key, value, updated_at) VALUES (?, 'listo', ?)",
      )
      .bind(SEED_FLAG, now),
  );
  await db.batch(statements);
}

export async function listPortfolios(): Promise<Portfolio[]> {
  await ensureSeed();
  const db = getRawDb();
  const [rows, links] = await Promise.all([
    db
      .prepare(
        `SELECT id, name, page_id, instagram_id, countries, contact_email,
                needs_review, review_note, notes, target_cpa_micros, target_roas_bp
         FROM portfolios ORDER BY name COLLATE NOCASE`,
      )
      .all<PortfolioRow>(),
    db
      .prepare(
        "SELECT portfolio_id, external_id, provider, page_id, countries FROM portfolio_accounts",
      )
      .all<{
        portfolio_id: string;
        external_id: string;
        provider: string | null;
        page_id: string | null;
        countries: string | null;
      }>(),
  ]);

  const byPortfolio = new Map<string, string[]>();
  const pagesByPortfolio = new Map<string, Record<string, string | null>>();
  const countriesByPortfolio = new Map<string, Record<string, string[]>>();
  const providersByPortfolio = new Map<string, Record<string, string | null>>();
  for (const link of links.results) {
    byPortfolio.set(link.portfolio_id, [
      ...(byPortfolio.get(link.portfolio_id) ?? []),
      link.external_id,
    ]);
    const paginas = pagesByPortfolio.get(link.portfolio_id) ?? {};
    paginas[link.external_id] = link.page_id;
    pagesByPortfolio.set(link.portfolio_id, paginas);
    const paises = countriesByPortfolio.get(link.portfolio_id) ?? {};
    paises[link.external_id] = link.countries
      ? link.countries.split(",").filter(Boolean)
      : [];
    countriesByPortfolio.set(link.portfolio_id, paises);
    const proveedores = providersByPortfolio.get(link.portfolio_id) ?? {};
    proveedores[link.external_id] = link.provider;
    providersByPortfolio.set(link.portfolio_id, proveedores);
  }

  return rows.results.map((row) => ({
    id: row.id,
    name: row.name,
    pageId: row.page_id,
    instagramId: row.instagram_id,
    countries: row.countries ? row.countries.split(",").filter(Boolean) : [],
    contactEmail: row.contact_email,
    needsReview: Boolean(row.needs_review),
    reviewNote: row.review_note,
    notes: row.notes,
    targetCpaMicros: row.target_cpa_micros,
    targetRoas: row.target_roas_bp === null ? null : row.target_roas_bp / 100,
    accountIds: byPortfolio.get(row.id) ?? [],
    accountPages: pagesByPortfolio.get(row.id) ?? {},
    accountCountries: countriesByPortfolio.get(row.id) ?? {},
    accountProviders: providersByPortfolio.get(row.id) ?? {},
  }));
}

/** Índice cuenta → portafolio, para agrupar sin volver a consultar. */
export async function accountIndex(): Promise<Map<string, Portfolio>> {
  const index = new Map<string, Portfolio>();
  for (const portfolio of await listPortfolios()) {
    for (const cuenta of portfolio.accountIds) {
      index.set(normalizeAccountId(cuenta), portfolio);
    }
  }
  return index;
}

export type PortfolioInput = {
  name: string;
  pageId?: string | null;
  instagramId?: string | null;
  countries?: string[];
  contactEmail?: string | null;
  needsReview?: boolean;
  notes?: string | null;
  targetCpaMicros?: number | null;
  /** Como razón real (3.5 = 3.5x); se convierte a `_bp` al guardar. */
  targetRoas?: number | null;
  accountIds?: string[];
};

export async function createPortfolio(
  actor: Actor,
  input: PortfolioInput,
): Promise<string> {
  assertCanManage(actor);
  const name = input.name.trim();
  if (!name) throw new PortafolioError("El cliente necesita un nombre");

  const db = getRawDb();
  const id = slug(name);
  const existing = await db
    .prepare("SELECT id FROM portfolios WHERE id = ? OR name = ? LIMIT 1")
    .bind(id, name)
    .first<{ id: string }>();
  if (existing) throw new PortafolioError("Ya existe un cliente así", 409);

  const now = Date.now();
  await db
    .prepare(
      `INSERT INTO portfolios
         (id, name, page_id, instagram_id, countries, notes, created_at, updated_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      name,
      clean(input.pageId),
      clean(input.instagramId),
      (input.countries ?? []).map((c) => c.trim().toUpperCase()).join(","),
      clean(input.notes),
      now,
      now,
      actor.email,
    )
    .run();

  await replaceAccounts(id, input.accountIds ?? []);
  return id;
}

export async function updatePortfolio(
  actor: Actor,
  id: string,
  input: Partial<PortfolioInput>,
): Promise<void> {
  assertCanManage(actor);
  const db = getRawDb();
  const row = await db
    .prepare("SELECT id FROM portfolios WHERE id = ? LIMIT 1")
    .bind(id)
    .first<{ id: string }>();
  if (!row) throw new PortafolioError("Ese cliente no existe", 404);

  const campos: string[] = [];
  const valores: unknown[] = [];
  if (input.name !== undefined) {
    if (!input.name.trim()) throw new PortafolioError("El nombre no puede quedar vacío");
    campos.push("name = ?");
    valores.push(input.name.trim());
  }
  if (input.pageId !== undefined) {
    campos.push("page_id = ?");
    valores.push(clean(input.pageId));
  }
  if (input.instagramId !== undefined) {
    campos.push("instagram_id = ?");
    valores.push(clean(input.instagramId));
  }
  if (input.countries !== undefined) {
    campos.push("countries = ?");
    valores.push(input.countries.map((c) => c.trim().toUpperCase()).join(","));
  }
  if (input.contactEmail !== undefined) {
    campos.push("contact_email = ?");
    valores.push(clean(input.contactEmail));
  }
  if (input.needsReview !== undefined) {
    // Confirmar un cliente (needsReview: false) borra también la nota: ya no
    // hay nada que revisar. Esta ruta no admite volver a marcarlo con una nota
    // nueva —eso solo ocurre en la siembra inicial de datos deducidos—, así
    // que acá la nota siempre se limpia, sin condicionarlo.
    //
    // Antes decía `input.needsReview ? null : null`: un ternario que da lo
    // mismo en los dos casos, señal de que el código no hacía lo que su
    // comentario prometía.
    campos.push("needs_review = ?", "review_note = ?");
    valores.push(input.needsReview ? 1 : 0, null);
  }
  if (input.notes !== undefined) {
    campos.push("notes = ?");
    valores.push(clean(input.notes));
  }
  if (input.targetCpaMicros !== undefined) {
    campos.push("target_cpa_micros = ?");
    valores.push(input.targetCpaMicros);
  }
  if (input.targetRoas !== undefined) {
    campos.push("target_roas_bp = ?");
    valores.push(
      input.targetRoas === null ? null : Math.round(input.targetRoas * 100),
    );
  }

  if (campos.length > 0) {
    campos.push("updated_at = ?");
    valores.push(Date.now(), id);
    await db
      .prepare(`UPDATE portfolios SET ${campos.join(", ")} WHERE id = ?`)
      .bind(...valores)
      .run();
  }
  if (input.accountIds !== undefined) {
    await replaceAccounts(id, input.accountIds);
  }
}

/**
 * Reemplaza las cuentas de un portafolio.
 *
 * Una cuenta pertenece a un solo cliente: el índice único lo garantiza, y
 * antes de insertar se quita de donde estuviera. Si no, la misma inversión se
 * contaría en dos carteras.
 */
async function replaceAccounts(
  portfolioId: string,
  accountIds: string[],
): Promise<void> {
  const db = getRawDb();
  const limpias = [...new Set(accountIds.map((a) => a.trim()).filter(Boolean))];

  // La página de cada cuenta se guarda por separado (ver `page_id` en el
  // esquema) y no viaja en esta lista de ids: si no se rescata antes de borrar,
  // reordenar o retocar las cuentas de un cliente le borraría también sus
  // páginas de Meta ya cargadas.
  const previas = limpias.length
    ? await db
        .prepare(
          `SELECT external_id, page_id, countries FROM portfolio_accounts
           WHERE external_id IN (${limpias.map(() => "?").join(",")})`,
        )
        .bind(...limpias)
        .all<{
          external_id: string;
          page_id: string | null;
          countries: string | null;
        }>()
    : { results: [] };
  const paginaPrevia = new Map(
    previas.results.map((row) => [row.external_id, row.page_id]),
  );
  const paisesPrevios = new Map(
    previas.results.map((row) => [row.external_id, row.countries]),
  );

  await db
    .prepare("DELETE FROM portfolio_accounts WHERE portfolio_id = ?")
    .bind(portfolioId)
    .run();
  if (limpias.length === 0) return;

  const now = Date.now();
  await db.batch(
    limpias.flatMap((externalId) => [
      db
        .prepare("DELETE FROM portfolio_accounts WHERE external_id = ?")
        .bind(externalId),
      db
        .prepare(
          `INSERT INTO portfolio_accounts (id, portfolio_id, external_id, page_id, countries, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          `${portfolioId}::${externalId}`,
          portfolioId,
          externalId,
          paginaPrevia.get(externalId) ?? null,
          paisesPrevios.get(externalId) ?? null,
          now,
        ),
    ]),
  );
}

/**
 * Página de Facebook de una cuenta de Meta puntual.
 *
 * A diferencia de `page_id` en `portfolios` —una por cliente—, esta es la que
 * de verdad usa el constructor cuando se implemente la publicación: cada
 * cuenta de Meta pertenece a un Business Manager y publica bajo su propia
 * página, y un cliente puede tener varias cuentas.
 */
export async function setAccountPageId(
  actor: Actor,
  portfolioId: string,
  externalId: string,
  pageId: string | null,
): Promise<void> {
  assertCanManage(actor);
  const db = getRawDb();
  const row = await db
    .prepare(
      "SELECT id FROM portfolio_accounts WHERE portfolio_id = ? AND external_id = ? LIMIT 1",
    )
    .bind(portfolioId, externalId)
    .first<{ id: string }>();
  if (!row) {
    throw new PortafolioError("Esa cuenta no pertenece a este cliente", 404);
  }
  await db
    .prepare("UPDATE portfolio_accounts SET page_id = ? WHERE id = ?")
    .bind(clean(pageId), row.id)
    .run();
}

/** Países de segmentación de una cuenta puntual. Ver `setAccountPageId`. */
export async function setAccountCountries(
  actor: Actor,
  portfolioId: string,
  externalId: string,
  countries: string[],
): Promise<void> {
  assertCanManage(actor);
  const db = getRawDb();
  const row = await db
    .prepare(
      "SELECT id FROM portfolio_accounts WHERE portfolio_id = ? AND external_id = ? LIMIT 1",
    )
    .bind(portfolioId, externalId)
    .first<{ id: string }>();
  if (!row) {
    throw new PortafolioError("Esa cuenta no pertenece a este cliente", 404);
  }
  const limpios = countries
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean);
  await db
    .prepare("UPDATE portfolio_accounts SET countries = ? WHERE id = ?")
    .bind(limpios.length ? limpios.join(",") : null, row.id)
    .run();
}

function assertCanManage(actor: Actor): void {
  // Quien crea campañas administra también la cartera de clientes.
  if (!can(actor, "crear_campanas")) {
    throw new PortafolioError("Tu rol no puede administrar clientes", 403);
  }
}

function clean(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed ? trimmed : null;
}

function slug(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

export function normalizeAccountId(value: string): string {
  return value.trim().replace(/-/g, "").toLowerCase();
}
