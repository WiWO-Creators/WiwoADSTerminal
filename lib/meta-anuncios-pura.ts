/**
 * Un anuncio leído directo de Meta, traducido a las filas con las que Windsor entrega los anuncios, para reutilizar el mismo
 * traductor (`detalleAnuncioMeta`). Sirve para editar lo recién creado, que Windsor tarda horas en entregar. Puro (sin red).
 */

export const CAMPOS_DE_ANUNCIO_META =
  "id,name,status,effective_status,adset_id,campaign_id,creative{id,title,body,link_url,call_to_action_type,image_url,thumbnail_url,url_tags,object_story_spec,object_story_id,effective_object_story_id,source_instagram_media_id,instagram_permalink_url}";

const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const objeto = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

export function filaDeAnuncioMeta(ad: unknown, accountId: string): Record<string, unknown> | null {
  const a = objeto(ad);
  const id = texto(a.id);
  if (!id) return null;
  const c = objeto(a.creative);
  const historia = objeto(c.object_story_spec);
  const enlace = objeto(historia.link_data);
  const video = objeto(historia.video_data);
  const botonEnlace = objeto(enlace.call_to_action);
  const botonVideo = objeto(video.call_to_action);
  const destinoVideo = objeto(botonVideo.value);
  return {
    ad_id: id,
    account_id: accountId.replace(/^act_/, ""),
    campaign_id: texto(a.campaign_id),
    adset_id: texto(a.adset_id),
    ad_name: texto(a.name),
    effective_status: texto(a.effective_status) ?? texto(a.status),
    body: texto(enlace.message) ?? texto(video.message) ?? texto(c.body),
    title: texto(enlace.name) ?? texto(video.title) ?? texto(c.title),
    link: texto(enlace.link) ?? texto(destinoVideo.link) ?? texto(c.link_url),
    call_to_action_type: texto(botonEnlace.type) ?? texto(botonVideo.type) ?? texto(c.call_to_action_type),
    image_url: texto(c.image_url),
    thumbnail_url: texto(c.thumbnail_url),
    image_hash: texto(enlace.image_hash) ?? texto(video.image_hash),
    url_tags: texto(c.url_tags),
    creative_id: texto(c.id),
    instagram_permalink_url: texto(c.instagram_permalink_url),
    effective_object_story_id: texto(c.effective_object_story_id) ?? texto(c.object_story_id),
    source_instagram_media_id: texto(c.source_instagram_media_id),
  };
}
