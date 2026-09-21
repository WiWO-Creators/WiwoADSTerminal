import {
  DEV_NAME_COOKIE_NAME,
  DEV_SESSION_COOKIE_NAME,
} from "@/app/chatgpt-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const returnTo = new URL(request.url).searchParams.get("return_to") ?? "/";
  const target =
    returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/";

  // Se va directo a la pantalla de acceso, no a la raíz.
  //
  // Pasar por "/" hacía que la redirección de la raíz reconstruyera la URL y
  // perdiera el indicador: el cierre ocurría pero sin ninguna señal visible,
  // que es exactamente lo que se ve cuando el clic nunca llegó.
  const destino = new URL("/acceso", request.url);
  destino.searchParams.set("cerrada", "1");
  destino.searchParams.set("return_to", target);

  const headers = new Headers({
    location: destino.toString(),
    "cache-control": "no-store",
  });
  // Las dos: dejar el nombre vivo después de cerrar sesión haría que la
  // siguiente persona en este navegador entre saludada con el nombre ajeno.
  for (const cookie of [DEV_SESSION_COOKIE_NAME, DEV_NAME_COOKIE_NAME]) {
    headers.append(
      "set-cookie",
      `${cookie}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
    );
  }

  return new Response(null, { status: 303, headers });
}
