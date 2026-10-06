# Estado por cliente: qué tenemos y qué falta

Fecha: 2026-10-05. Cruza la lista que dio el equipo (MGC y WIWO) con lo que Windsor lee hoy (Google Ads, Meta, TikTok, LinkedIn y GA4) y con lo que ya está cargado en la ficha de cada cliente en WiWO.ADS.

**Leyenda:** ✓ = lo traemos · ✗ = falta (con qué hacer) · — = no aplica o el equipo no lo pidió.
«Lo traemos» significa que Windsor lo lee (así llega a la app). **GA4/GTM** además se comparan con la cuenta de servicio de lectura (`wiwo-lectura-analytics@wiwo-ads.iam.gserviceaccount.com`, ver `ACCESOS_PENDIENTES.md`).
**En la ficha** = el ID de GA4/GTM ya está cargado en WiWO.ADS; sin eso la app no vigila la medición de ese cliente.

---

## MGC

### Grupo Valor (Ébano, Corotú, Marea, Bijao)
| Plataforma | Estado |
|---|---|
| Google Ads | ✓ Valor Development 595-229-1307 |
| Meta | ✓ «Grupo Valor #2» 528836355882248 y «Ébano» 1271746788353880 (Windsor). ✗ Confirmar a qué proyecto corresponde cada una (Corotú, Marea y Bijao no tienen cuenta propia visible) |
| GA4 | ✓ Ébano 530554404 · ✓ corotusantamaria.com 525122394 · ✗ WEB VALOR 488612729 (falta acceso en Windsor y cuenta de servicio) · ✗ Marea y Bijao: no existen propiedades |
| GTM | ✗ Ébano y Corotú: la cuenta existe pero no se ve ningún contenedor (dar «Leer» a nivel de cuenta). ✗ Marea y Bijao: no se encontró |
| Segmentos | ✓ Ébano, Corotú, Marea y Bijao se reconocen por su nombre en campañas |

### AIMA
| Google Ads | ✓ Aima 866-336-0598 (+ administradora «Aima 2») |
|---|---|
| Meta | — el equipo no la pidió |
| GA4 | ✓ 508525564 |
| GTM | ✓ `GTM-NCWP7W48` (Aima Patagonia) |
| En la app | ✗ **No existía como cliente**: se crea con la migración 0028 |

### Palta (holding)
| Google Ads | ✓ Agencia Palta - Cuenta GAds 466-890-0970 (Windsor). La cuenta administradora 556-514-6813 y Ventisqueros 178-762-5735 no están en Windsor |
|---|---|
| Meta | ✗ La cuenta 1645720452948877 la ve el Facebook del equipo pero **Windsor no la tiene conectada** (no entra a la app) |
| GA4 | ✓ 354519679 |
| GTM | ✓ `GTM-5FL5C3Z5` |

### Foundaxis
| Google Ads | ✓ 728-736-2856 |
|---|---|
| Meta | ✓ 1327585191742131 (aunque el equipo no lo pidió) |
| GA4 | ✓ 478107495 |
| GTM | ✗ la cuenta existe pero no se ve el contenedor |

### SQM (SPN México · LATAM Perú/Colombia/Ecuador · ESPAÑA Iberia)
| Google Ads | ✓ SQM NUTRITION 465-094-9852 (una sola cuenta para México, Ecuador, Colombia, Perú y España; se separa por segmento) |
|---|---|
| Meta | ✓ SQM SPN 2737262463224930 · ✓ SQM LATAM 985579737840293 · ✓ SQM ESPAÑA 899439413222155 |
| GA4 | ✓ sqmnutrition.com 382329583 · ✗ sqmindustrialchemicals.com (328525394, 364807965) · ✗ sqmyodonutricionvegetal.com 462304181 · ✗ sangral (328546165, 365116115) — falta acceso |
| GTM | ✓ cuenta «sqmnutrition» (sin contenedor visible: ✗ dar «Leer» a nivel de cuenta) |

### Cornerstone
| Google Ads | ✓ Cornerstone / Career Partners / CLS 185-304-1133 |
|---|---|
| Meta | ✓ Cornerstone Perú 2026 2195498387953258 |
| LinkedIn | ✓ Cornerstone Perú (520473140, 512754838) — solo lectura |
| GA4 | ✓ Cornerstone Perú 429136856 (Windsor) · ✗ CLSelection 429653754 · ✗ falta acceso a la cuenta de servicio |
| GTM | ✗ no se encontró |

### TrueCaller
| Meta | ✓ TrueCaller \| Colombia \| Español 1110358747560979 |
|---|---|
| TikTok | ✓ USD Truecaller Colombia 7602721778298355728 (cuenta, campañas y anuncios: arreglado el 2026-10-05, 86 anuncios en el mes) |
| Google Ads | — (el equipo dice que solo Meta y TikTok) |
| GA4/GTM | — |

### Colbún Comunicaciones
| Google Ads | ✓ Colbún Energía 423-204-0466 |
|---|---|
| Meta | ✓ Colbún Energía 2006250736667023 (+ Instagram `energiacolbun`) |
| GA4 | ✓ Colbun.cl 307451372 (en la ficha) |
| GTM | ✗ **No tiene Tag Manager** (alerta activa; sin él las conversiones no se miden y la puja de Google parte en «Maximizar clics») |

### Colbún Marketing
| LinkedIn | ✓ Colbún Clientes 555900177 y Colbun S.A 555950160 (solo lectura) |
|---|---|

---

## WIWO

### Anker (Chile y Argentina)
| Google Ads | ✓ Anker Argentina 514-699-0658 · ✓ Soundcore 985-043-3091 (no estaban en la lista del equipo) |
|---|---|
| Meta | ✓ Anker Chile + Argentina (una sola cuenta) «Soundcore Chile» 1494126595605892 · ✓ Anker Argentina 4252945408262033 |
| TikTok | ✓ Soundcore Chile 7606087454329372673 (cuenta, campañas y anuncios) |
| GA4/GTM | ✗ no se encontró ninguno |

### ALO Group (Perú, Colombia, Ecuador, Panamá, Argentina, Chile)
| Google Ads | ✓ las seis cuentas: Chile 111-856-2413 · Colombia 795-361-1860 · Panamá 335-407-3572 · Perú 719-949-3611 · Ecuador 820-279-1929 · Argentina 988-103-2709 |
|---|---|
| Meta | ✓ ALO GROUP 898923521443041 (una sola cuenta para todos los países) |
| GA4 | ✓ Windsor lee más de 20 propiedades de ALO (cada sitio y su versión «- GA4»); la ficha admite hasta 12 → **confirmar cuáles son las que importan** |
| GTM | ✗ no se encontró |

### Bodenor Flexcenter
| Google Ads | ✓ 414-969-7360 |
|---|---|
| LinkedIn | ✓ 551831377 y 507218626 (no estaba en la lista; solo lectura) |
| GA4 | ✓ 430828037 (en la ficha) |
| GTM | ✗ la cuenta existe, sin contenedor visible |
| Meta | ✗ no se encontró (el equipo tampoco la pidió) |

### Funeraria María Ayuda
| Google Ads | ✓ 182-750-4429 |
|---|---|
| Meta | ✓ 453169699698594 y 792906527166172 |
| GA4 | ✓ 523292488 |
| GTM | ✗ la cuenta existe, sin contenedor visible |

### Acai Berry
Por definir: sin cuentas ni redes todavía. Se crea el cliente cuando existan.

---

## Clientes que están en la app pero no en esta lista
Primeros Pueblos es de **MGC** (asignado). Skydive Andes, Amipass y Wildsty ya no son clientes: quedaron **archivados** (salen de los selectores; sus datos se conservan).

## Resumen: qué falta, por prioridad
1. **Cargar en la ficha los GA4/GTM que ya existen** (hecho con la migración 0028 para los que no son ambiguos; ALO y Valor completo quedan por confirmar).
2. **GTM:** dar «Leer» a nivel de cuenta en Ébano, Corotú, Foundaxis, SQM, Bodenor y Funeraria; instalar GTM en **Colbún**.
3. **GA4 sin acceso:** WEB VALOR, las cinco propiedades de SQM, CLSelection.
4. **Meta de Palta:** 1645720452948877 sigue sin aparecer entre las cuentas de Windsor (verificado hoy con una consulta directa).
5. **Marea y Bijao:** no tienen propiedades de GA4 ni cuentas propias.
7. **Acai Berry:** definir.
