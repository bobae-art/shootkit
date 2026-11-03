// 로컬 확인용 정적 서버: 배포와 같은 주소 구조로 띄운다.
//   /bobaedream/nuxt-shootkit/*  → nuxt-shootkit/.output/public (nuxt generate 결과)
//   /bobaedream/*                → 저장소 public/ (아이콘 · 예시 사진 · 인식 데이터)
// 사용: node scripts/serve.mjs [포트=5191]
import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const appDir = resolve(here, "../.output/public");
const siteDir = resolve(here, "../../public");
const port = Number(process.argv[2] || 5191);
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".wasm": "application/wasm",
  ".woff2": "font/woff2",
};

const pick = (root, rel) => {
  const p = normalize(join(root, rel));
  if (!p.startsWith(root)) return null;
  if (existsSync(p) && statSync(p).isFile()) return p;
  if (existsSync(join(p, "index.html"))) return join(p, "index.html");
  return null;
};

createServer((req, res) => {
  const url = decodeURIComponent((req.url || "/").split("?")[0]);
  let file = null;
  if (url.startsWith("/bobaedream/nuxt-shootkit/")) file = pick(appDir, url.slice("/bobaedream/nuxt-shootkit/".length)) ?? pick(appDir, "index.html");
  // 자동 시험용 짧은 주소(주소에 「shootkit」 글자가 두 번 나오지 않게): /bobaedream/nk/ → 같은 앱
  else if (url.startsWith("/bobaedream/nk/")) file = pick(appDir, "index.html");
  else if (url.startsWith("/bobaedream/")) file = pick(siteDir, url.slice("/bobaedream/".length));
  if (!file) {
    res.writeHead(404);
    return res.end("not found");
  }
  res.writeHead(200, { "content-type": types[extname(file)] || "application/octet-stream" });
  createReadStream(file).pipe(res);
}).listen(port, () => console.log(`http://localhost:${port}/bobaedream/nuxt-shootkit/`));
