import {
  DEV_SESSION_COOKIE_NAME,
  devLoginEnabled,
} from "@/app/chatgpt-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!devLoginEnabled()) return new Response("No disponible", { status: 404 });

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

  return new Response(null, {
    status: 303,
    headers: {
      location: destino.toString(),
      "set-cookie": `${DEV_SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
      "cache-control": "no-store",
    },
  });
}
