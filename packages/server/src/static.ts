import { readFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { extname, join, resolve, sep } from "node:path";

type Handler = (request: IncomingMessage, response: ServerResponse) => void;

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

  const deliver = async (file: string, response: ServerResponse): Promise<boolean> => {
    try {
      const body = await readFile(file);
      const type = TYPES[extname(file)] ?? "application/octet-stream";
      response.writeHead(200, { "content-type": type });
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
    deliver(file, response).then(async (found) => {
      if (found) {
        return;
      }
      if (extname(file) !== "" || !(await deliver(page, response))) {
        reply(response, 404, "not found");
      }
    });
  };
}
