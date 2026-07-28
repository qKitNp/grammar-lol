/**
 * Dev-only plugin: bridges OAuth codes between the external browser tab
 * (where Google redirects to localhost:1420/callback) and the Tauri app.
 *
 * WKWebView and external browsers don't share localStorage, so we use
 * an HTTP endpoint on the Vite dev server as a relay.
 */
import type { Plugin } from "vite";

export function oauthBridgePlugin(): Plugin {
  const codes = new Map<string, string>();

  return {
    name: "oauth-bridge",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url) return next();

        if (req.url === "/__oauth-state" && req.method === "GET") {
          let code = codes.get("code");
          if (code) codes.delete("code");
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ code }));
          return;
        }

        if (req.url === "/__oauth-state" && req.method === "POST") {
          let body = "";
          req.on("data", (chunk: Buffer) => (body += chunk));
          req.on("end", () => {
            try {
              const data = JSON.parse(body);
              if (data.code) codes.set("code", data.code);
              res.writeHead(201, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ ok: true }));
            } catch {
              res.writeHead(400);
              res.end("bad request");
            }
          });
          return;
        }

        next();
      });
    },
  };
}
