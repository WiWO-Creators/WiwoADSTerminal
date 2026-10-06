import "./_alias.mjs";
import assert from "node:assert/strict";
import test from "node:test";

const { tipoDeDocumento, rutaDeDocumento, nombreDeArchivo } = await import("../lib/facturas-pura.ts");

test("distingue factura de extracto por lo que dice el documento y no adivina si es ambiguo", () => {
  assert.equal(tipoDeDocumento(["Factura 123456 septiembre"]), "FACTURA");
  assert.equal(tipoDeDocumento(["Estado de cuenta"]), "EXTRACTO");
  assert.equal(tipoDeDocumento(["Payment receipt"]), "EXTRACTO");
  assert.equal(tipoDeDocumento(["Invoice + statement"]), "SIN_CLASIFICAR");
  assert.equal(tipoDeDocumento([null, "documento.pdf"]), "SIN_CLASIFICAR");
});

test("ruta INVOICE/CLIENTE/MES/TIPO/archivo sin tildes ni caracteres raros", () => {
  assert.equal(
    rutaDeDocumento({ cliente: "Colbún Comunicaciones", anio: 2026, mes: 9, tipo: "FACTURA", archivo: nombreDeArchivo({ plataforma: "Meta", cuenta: "557475804838986", numero: "A-12/3", extension: ".pdf" }) }),
    "INVOICE/Colbun_Comunicaciones/2026-09/FACTURA/Meta_557475804838986_A-12_3.pdf",
  );
});
