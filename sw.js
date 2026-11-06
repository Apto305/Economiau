// Service worker: guarda a "casca" do app para abrir rápido e sem internet.
// Os dados vêm sempre da planilha (não são guardados aqui).
const VERSAO = 'economiau-v1.6.1';
const ARQUIVOS = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/app.js', 'js/config.js', 'js/dados.js', 'js/google.js', 'js/icones.js', 'js/regras.js', 'js/telas.js', 'js/telas2.js', 'js/invest.js', 'js/util.js',
  'assets/davinci-corpo.webp', 'assets/seringa-corpo.webp', 'assets/davinci-rosto.webp', 'assets/seringa-rosto.webp', 'assets/familia-rosto.webp',
  'assets/davinci-despesa.webp', 'assets/davinci-receita.webp', 'assets/seringa-despesa.webp', 'assets/seringa-receita.webp',
  'assets/familia-despesa.webp', 'assets/familia-receita.webp', 'assets/icone-192.png', 'assets/favicon.png',
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSAO).then((c) => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSAO).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // Google e fontes: direto da rede
  // rede primeiro (pega versões novas), cache se estiver sem internet
  // "no-cache" faz o navegador sempre conferir com o GitHub se há versão nova
  // (sem isso, o cache HTTP de 10 minutos do GitHub Pages segura a versão antiga)
  e.respondWith(
    fetch(e.request.url, { cache: 'no-cache', credentials: 'same-origin' }).then((r) => {
      const copia = r.clone();
      caches.open(VERSAO).then((c) => c.put(e.request, copia));
      return r;
    }).catch(() => caches.match(e.request).then((r) => r || caches.match('index.html'))),
  );
});
