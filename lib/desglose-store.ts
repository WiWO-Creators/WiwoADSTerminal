import {
  camposDeDesglose,
  dimensionesDe,
  filasDeDesglose,
  type Dimension,
  type FilaDeDesglose,
} from "@/lib/desglose";
import { PLATFORM, type NivelEntidad, type Platform } from "@/lib/plataformas";
import { requestWindsorConnector } from "@/lib/windsor";

/** Campo de Windsor que identifica cada nivel, por plataforma. */
const CAMPO_ID: Record<Platform, Record<NivelEntidad, string>> = {
  meta: { campana: "campaign_id", conjunto: "adset_id", anuncio: "ad_id" },
  google: { campana: "campaign_id", conjunto: "ad_group_id", anuncio: "ad_id" },
  tiktok: { campana: "campaign_id", conjunto: "ad_group_id", anuncio: "ad_id" },
  linkedin: { campana: "campaign_id", conjunto: "campaign_id", anuncio: "ad_id" },
};

export class ErrorDeDesglose extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/**
 * Lee de Windsor el desglose de UNA entidad, filtrando en el servidor de
 * Windsor por su id (no se trae la cuenta entera para recortar después). Solo
 * lectura y sin caché: es una consulta a demanda de quien mira ese segmento.
 */
export async function fetchDesglose({
  provider,
  accountId,
  nivel,
  id,
  dimension,
  desde,
  hasta,
}: {
  provider: Platform;
  accountId: string;
  nivel: NivelEntidad;
  id: string;
  dimension: Dimension;
  desde: string;
  hasta: string;
}): Promise<FilaDeDesglose[]> {
  if (!dimensionesDe(provider).some((d) => d.id === dimension)) {
    throw new ErrorDeDesglose(`${PLATFORM[provider].label} no ofrece el desglose «${dimension}».`, 400);
  }
  const campos = camposDeDesglose(provider, dimension);
  if (!campos) throw new ErrorDeDesglose("Esta plataforma no ofrece desgloses.", 400);
  const campoId = CAMPO_ID[provider][nivel];
  const filas = await requestWindsorConnector(
    PLATFORM[provider].connector,
    [...new Set([...campos, campoId])],
    desde,
    hasta,
    { selectAccounts: accountId, filtro: [[campoId, "eq", id]], timeoutMs: 90_000 },
  );
  return filasDeDesglose(provider, dimension, filas);
}
