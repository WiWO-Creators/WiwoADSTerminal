interface Fetcher {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

interface D1Result<T = Record<string, unknown>> {
  results?: T[];
  success: boolean;
  meta: {
    changes?: number;
    duration?: number;
    last_row_id?: number;
    rows_read?: number;
    rows_written?: number;
  };
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(columnName?: string): Promise<T | null>;
  run<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T> & { results: T[] }>;
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = Record<string, unknown>>(
    statements: D1PreparedStatement[],
  ): Promise<Array<D1Result<T>>>;
  exec(query: string): Promise<D1Result>;
}

interface R2HTTPMetadata {
  contentType?: string;
  contentDisposition?: string;
  cacheControl?: string;
}

interface R2Object {
  key: string;
  size: number;
  httpMetadata?: R2HTTPMetadata;
  body: ReadableStream;
  arrayBuffer(): Promise<ArrayBuffer>;
}

interface R2Bucket {
  put(
    key: string,
    value: ArrayBuffer | ArrayBufferView | ReadableStream | Blob | string,
    options?: { httpMetadata?: R2HTTPMetadata },
  ): Promise<unknown>;
  get(key: string): Promise<R2Object | null>;
  delete(key: string): Promise<void>;
}

declare module "cloudflare:workers" {
  export const env: {
    DB?: D1Database;
    MEDIA?: R2Bucket;
    OAUTH_TOKEN_KEY?: string;
    WINDSOR_API_KEY?: string;
    ANTHROPIC_API_KEY?: string;
    SESSION_SECRET?: string;
    WIWO_RUNTIME?: string;
    ANTHROPIC_MODEL?: string;
    APP_ORIGIN?: string;
    OAUTH_ADMIN_EMAILS?: string;
    DEV_LOGIN_ENABLED?: string;
    GOOGLE_CLIENT_ID?: string;
    GOOGLE_CLIENT_SECRET?: string;
    GOOGLE_ADS_DEVELOPER_TOKEN?: string;
    GOOGLE_ADS_API_VERSION?: string;
    META_APP_ID?: string;
    META_APP_SECRET?: string;
    META_GRAPH_VERSION?: string;
    GEMINI_API_KEY?: string;
  };
}
