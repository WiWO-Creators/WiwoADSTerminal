/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    // «Ver como»: mientras un administrador ve la app como otra persona, nada se puede cambiar (solo lectura).
    const metodo = request.method.toUpperCase();
    if (metodo !== "GET" && metodo !== "HEAD" && metodo !== "OPTIONS" && url.pathname !== "/api/ver-como" && /(?:^|;\s*)wiwo_ver_como=/.test(request.headers.get("cookie") ?? "")) {
      return new Response(JSON.stringify({ error: "Estás viendo la app como otra persona: es solo lectura. Vuelve a tu vista para hacer cambios." }), {
        status: 403,
        headers: { "content-type": "application/json", "cache-control": "no-store" },
      });
    }

    return handler.fetch(request, env, ctx);
  },
};

export default worker;
