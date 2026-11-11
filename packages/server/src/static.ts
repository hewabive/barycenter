import { readFile, stat } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { extname, join, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { gzip } from "node:zlib";

type Handler = (request: IncomingMessage, response: ServerResponse) => void;

interface Packed {
  stamp: number;
  body: Buffer;
}

const pack = promisify(gzip);
const TEXTUAL = new Set([".html", ".js", ".css", ".json", ".map", ".svg"]);
const HASHED = `${sep}assets${sep}`;

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".map": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

function reply(response: ServerResponse, status: number, text: string): void {
  response.writeHead(status, { "content-type": "text/plain; charset=utf-8" });
  response.end(`${text}\n`);
}

export function createStaticHandler(folder: string | null): Handler {
  if (folder === null) {
    return (_request, response) => reply(response, 200, "barycenter");
  }
  const root = resolve(folder);
  const packed = new Map<string, Packed>();

  const compressed = async (file: string): Promise<Buffer> => {
    const stamp = (await stat(file)).mtimeMs;
    const known = packed.get(file);
    if (known?.stamp === stamp) {
      return known.body;
    }
    const body = await pack(await readFile(file));
    packed.set(file, { stamp, body });
    return body;
  };

  const deliver = async (
    file: string,
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<boolean> => {
    try {
      const extension = extname(file);
      const accepted = String(request.headers["accept-encoding"] ?? "");
      const squeeze = TEXTUAL.has(extension) && /\bgzip\b/.test(accepted);
      const body = squeeze ? await compressed(file) : await readFile(file);
      response.writeHead(200, {
        "content-type": TYPES[extension] ?? "application/octet-stream",
        "cache-control": file.includes(HASHED) ? "public, max-age=31536000, immutable" : "no-cache",
        vary: "accept-encoding",
        ...(squeeze ? { "content-encoding": "gzip" } : {}),
      });
      response.end(body);
      return true;
    } catch {
      return false;
    }
  };

  return (request, response) => {
    if (request.method !== "GET" && request.method !== "HEAD") {
      reply(response, 405, "method not allowed");
      return;
    }
    let path: string;
    try {
      path = decodeURIComponent(new URL(request.url ?? "/", "http://local").pathname);
    } catch {
      reply(response, 400, "bad request");
      return;
    }
    const target = resolve(root, `.${path}`);
    if (target !== root && !target.startsWith(root + sep)) {
      reply(response, 403, "forbidden");
      return;
    }
    const page = join(root, "index.html");
    const file = target === root || path.endsWith("/") ? join(target, "index.html") : target;
    deliver(file, request, response).then(async (found) => {
      if (found) {
        return;
      }
      if (extname(file) !== "" || !(await deliver(page, request, response))) {
        reply(response, 404, "not found");
      }
    });
  };
}
