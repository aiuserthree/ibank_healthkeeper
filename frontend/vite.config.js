import { defineConfig } from "vite";
import { existsSync } from "fs";
import { resolve } from "path";

const webRoot = resolve(__dirname, "../web");

/** nginx try_files $uri $uri/ $uri.html 과 동일하게 확장자 없는 HTML 경로 처리 */
function extensionlessHtmlRoutes() {
  return {
    name: "extensionless-html-routes",
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        const [pathname, search = ""] = (req.url || "").split("?");
        if (
          !pathname ||
          pathname === "/" ||
          pathname.includes(".") ||
          pathname.endsWith("/")
        ) {
          return next();
        }
        const htmlPath = resolve(webRoot, pathname.slice(1) + ".html");
        if (existsSync(htmlPath)) {
          req.url = pathname + ".html" + (search ? "?" + search : "");
        }
        next();
      });
    },
  };
}

/** nginx 의 예전 주소 리다이렉트와 동일 — /go/stairs(예전 배너 링크), /lounge(아케이드 옛 주소) */
const REDIRECTS = { "/go/stairs": "/games/stairs", "/lounge": "/arcade", "/lounge.html": "/arcade" };
function goRedirects() {
  return {
    name: "go-redirects",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const to = REDIRECTS[(req.url || "").split("?")[0]];
        if (!to) return next();
        res.statusCode = 302;
        res.setHeader("Location", to);
        res.end();
      });
    },
  };
}

/** @type {import('vite').UserConfig} */
export default defineConfig({
  root: webRoot,
  plugins: [extensionlessHtmlRoutes(), goRedirects()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8100",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: resolve(__dirname, "../dist/web"),
    emptyOutDir: true,
  },
});
