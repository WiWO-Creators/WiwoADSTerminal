# Mapa de clientes — plataformas, medición y huecos (2026-10-02)

Armado con: la lista de clientes que dio el equipo, el selector de cuentas de Google Ads (59), las cuentas de Meta que ve el Facebook del equipo (53) y las que lee Windsor (8), las propiedades de GA4 (73) y lo que ve la cuenta de servicio `wiwo-lectura-analytics` en GA4 y GTM. **Es un inventario de nombres e IDs, no de rendimiento.** Lo marcado «?» es inferencia por nombre y debe confirmarse.

Leyenda GA4/GTM: ✓ = la cuenta de servicio ya lo ve · ✗ = existe pero falta darle acceso · — = no se encontró.

## Grupo Valor (Ébano, Corotú, Marea, Bijao)
| Plataforma | Detalle |
|---|---|
| Google Ads | Valor Development 595-229-1307 (USD) |
| Meta | «Grupo Valor #2» (la lee Windsor; **no la ve el Facebook del equipo**) |
| GA4 | Ébano 530554404 ✓ · Corotú Santa María 524902836 ✓ · corotusantamaria.com 525122394 ✓ · Grupo Valor Development 423670304 ✓ · WEB VALOR 488612729 ✗ · Marea — · Bijao — |
| GTM | cuentas «Ébano» y «Corotú Santa María» ✓ (sin contenedor visible) |
Huecos: GA4 de Marea y Bijao; qué cuenta de Google/Meta corresponde a cada proyecto.

## AIMA
Google: Aima 866-336-0598 (CLP) y administradora Aima 2 772-442-3744 · Meta: no se ve ninguna · GA4: Aima 508525564 ✓ · GTM: Aima Patagonia `GTM-NCWP7W48` ✓.

## Palta (Agencia Palta)
Google: Agencia Palta (administradora) 556-514-6813, Cuenta GAds 466-890-0970, Ventisqueros 178-762-5735 · Meta: Agencia Palta 1645720452948877 ✓ (la ve el equipo) · GA4: 354519679 ✓ · GTM: `GTM-5FL5C3Z5` ✓.

## Foundaxis
Google 728-736-2856 · Meta 1327585191742131 (la ve el equipo) · GA4 478107495 ✓ · GTM: cuenta ✓ (sin contenedor visible).

## SQM (Colombia, Perú, Ecuador = LATAM, México, España = Iberia)
Google: SQM NUTRITION 465-094-9852 (USD) · Meta: SQM SPN, SQM LATAM, SQM ESPAÑA (Windsor lee «SQM SPN»; **ninguna la ve el Facebook del equipo**) · GA4: sqmnutrition.com 382329583 ✓ · sqmindustrialchemicals.com (328525394, 364807965) ✗ · sqmyodonutricionvegetal.com 462304181 ✗ · sangral (328546165, 365116115) ✗ · GTM: cuenta «sqmnutrition» ✓.
Huecos: qué países cubre cada cuenta de Meta; cuentas de Google de México/Iberia (hoy hay una sola).

## Cornerstone (MGC Perú)
Google: Cornerstone / Career Partners / CLS 185-304-1133 (PEN) · Meta: «Cornerstone Perú 2026» (Windsor; **no la ve el Facebook del equipo**) · GA4: Cornerstone Perú 429136856 ✗, CLSelection 429653754 ✗ · GTM —.
Nota de config: Google factura en PEN y Meta en USD; confirmar que son el mismo cliente.

## TrueCaller (MGC Colombia)
Meta: «TrueCaller | Colombia | Español» 1110358747560979 (USD; la ve el equipo y Windsor) · Google: no se ve una cuenta propia (¿MGC -Global 331-782-5860?) · GA4/GTM —.
**No existe como cliente en la configuración**: hoy aparece suelto.

## Colbún
- **Colbún Comunicaciones:** Google «Colbún Energía» 423-204-0466 · Meta «Colbún Energía» 2006250736667023 (Windsor; **no la ve el Facebook del equipo**) · GA4 Colbun.cl 307451372 ✓ · **sin GTM** (alerta activa).
- **Colbún Marketing:** LinkedIn, sin conectar. No existe aún en la configuración.

## Anker Chile y Anker Argentina
Google: Anker Argentina 514-699-0658 (USD), Soundcore 985-043-3091 · Meta: «Anker Chile + Arg» 1494126595605892 (una sola cuenta para ambos; Windsor; **no la ve el Facebook del equipo**) · GA4/GTM —.
Hoy están como un solo cliente «Anker · Soundcore»; falta separarlos y decidir dónde va Soundcore.

## ALO Group (Perú, Colombia, Ecuador, Panamá, Argentina, Chile)
Google: HQ 136-026-9278 (administradora) y las 6 cuentas por país (ya en la configuración) · Meta: ALO GROUP 898923521443041 (la ve el equipo) · GA4: las 8 propiedades ✓ · GTM —.

## Bodenor Flexcenter
Google 414-969-7360 · Meta: no se ve · GA4 430828037 ✓ · GTM: cuenta ✓ (sin contenedor visible).

## Funeraria María Ayuda
Google 182-750-4429 · Meta 453169699698594, 792906527166172 y otra en la configuración (las ve el equipo) · GA4 523292488 ✓ · GTM: cuenta ✓ (sin contenedor visible).

## Acai Berry
Sin cuentas ni redes todavía. Cuando existan: Google, Meta, GA4 y GTM por definir.

## Clientes que están en WiWO.ADS pero no en esta lista
Primeros Pueblos, Skydive Andes, Amipass, Wildsty y MGC. No los toqué.

---
## Hallazgos que cambian prioridades
1. **El Facebook del equipo solo ve parte de las cuentas de Meta.** De las que Windsor lee, el equipo ve ALO, TrueCaller, Agencia Palta, Foundaxis y María Ayuda; **no ve las de Colbún, SQM, Anker, Cornerstone, Valor ni Primeros Pueblos.** Eso confirma que Windsor lee esas con el acceso de otra persona (la que ya no trabaja con ustedes). Si ese acceso cae, se pierden 6 clientes de Meta.
2. **GTM:** solo 2 contenedores visibles de 9 cuentas; falta darle a la cuenta de servicio acceso a nivel de contenedor.
3. **GA4:** 52 de 73 propiedades sin acceso; las de clientes de esta lista están en la tabla de arriba.
4. **Modelo de datos:** WiWO.ADS no tiene «proyectos» ni «países» dentro de un cliente (Valor, SQM, ALO, Anker, Colbún), ni dos «marcas» de un mismo cliente con plataformas distintas (Colbún Comunicaciones/Marketing).

---
## Actualización (respuestas del equipo, 2026-10-02)
- **Marea y Bijao** son proyectos de Grupo Valor y se reconocen por su nombre dentro de campañas y anuncios.
- **SQM:** SPN = México, LATAM = Perú, Colombia y Ecuador, ESPAÑA = Iberia.
- **TrueCaller:** solo Meta y TikTok; ya existe como cliente (con su cuenta de Meta).
- **Colbún Marketing:** creado en la base, sin cuentas hasta conectar LinkedIn (no aparece en el selector mientras no tenga cuentas).
- **Acai Berry:** nada que mapear aún.
- Implementado: **segmentos por cliente** (migración 0024). Valor (Ébano, Corotú, Marea, Bijao), SQM (México, LATAM, Iberia), ALO Group (6 países) y Anker (Chile, Argentina) tienen un filtro «Proyecto / país» en su tabla. Se reconocen por palabras en el nombre de la cuenta, campaña, conjunto o anuncio.

## LinkedIn (2026-10-02)
Windsor tiene LinkedIn conectado con 7 cuentas: Colbún Clientes (555900177) y Colbun S.A (555950160) → Colbún Marketing; Amipass (510459144); Cornerstone Perú (520473140, 512754838); Bodenor Flexcenter (551831377, 507218626). También hay TikTok en Windsor: «USD Truecaller Colombia» y «Soundcore Chile» (aún no se lee). Windsor conecta además 20 cuentas de Meta (en la app solo salen las que tuvieron datos en el periodo), incluidas SQM SPN/ESPAÑA/LATAM, Anker Argentina y Ébano.
