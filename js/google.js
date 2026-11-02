// Login Google, seletor de planilha e chamadas à API do Google Sheets.
import { CONFIG } from './config.js';

let token = null;        // { access_token, expira }
let clienteToken = null;

const CHAVE_TOKEN = 'economiau-token';

function carregarScript(src) {
  return new Promise((ok, erro) => {
    if (document.querySelector('script[src="' + src + '"]')) return ok();
    const s = document.createElement('script');
    s.src = src; s.async = true; s.onload = ok; s.onerror = () => erro(new Error('Sem conexão com o Google.'));
    document.head.appendChild(s);
  });
}

export function tokenValido() {
  if (!token) {
    try { token = JSON.parse(sessionStorage.getItem(CHAVE_TOKEN) || 'null'); } catch (e) { token = null; }
  }
  return !!(token && token.expira > Date.now() + 60000);
}

export async function prepararLogin() {
  await carregarScript('https://accounts.google.com/gsi/client');
}

// Abre a janela do Google. Precisa ser chamado num clique (o navegador
// bloqueia janelas abertas sem ação do usuário).
export function entrar(dica) {
  return new Promise((ok, erro) => {
    if (!window.google || !google.accounts || !google.accounts.oauth2) return erro(new Error('O login do Google ainda não carregou. Tente de novo em alguns segundos.'));
    clienteToken = google.accounts.oauth2.initTokenClient({
      client_id: CONFIG.clientId,
      scope: CONFIG.escopos,
      callback: (r) => {
        if (r.error) return erro(new Error(r.error === 'access_denied' ? 'Acesso não autorizado.' : 'Não foi possível entrar (' + r.error + ').'));
        token = { access_token: r.access_token, expira: Date.now() + (Number(r.expires_in) || 3600) * 1000 };
        try { sessionStorage.setItem(CHAVE_TOKEN, JSON.stringify(token)); } catch (e) { /* sem armazenamento */ }
        ok(token);
      },
      error_callback: (e) => erro(new Error(e && e.type === 'popup_closed' ? 'A janela do Google foi fechada.' : 'Não foi possível abrir a janela do Google.')),
    });
    clienteToken.requestAccessToken({ prompt: '', login_hint: dica || undefined });
  });
}

export function sair() {
  if (token && window.google && google.accounts && google.accounts.oauth2) {
    try { google.accounts.oauth2.revoke(token.access_token, () => {}); } catch (e) { /* ignora */ }
  }
  token = null;
  try { sessionStorage.removeItem(CHAVE_TOKEN); } catch (e) { /* ignora */ }
}

export class SessaoExpirada extends Error {}

async function api(url, opcoes = {}) {
  if (!tokenValido()) throw new SessaoExpirada('Sessão expirada');
  const r = await fetch(url, {
    cache: 'no-store',
    ...opcoes,
    headers: { Authorization: 'Bearer ' + token.access_token, 'Content-Type': 'application/json', ...(opcoes.headers || {}) },
  });
  if (r.status === 401) { token = null; throw new SessaoExpirada('Sessão expirada'); }
  if (!r.ok) {
    let msg = 'Erro ' + r.status;
    try { const j = await r.json(); msg = (j.error && j.error.message) || msg; } catch (e) { /* sem corpo */ }
    const err = new Error(msg); err.status = r.status; throw err;
  }
  return r.json();
}

export const usuario = () => api('https://www.googleapis.com/oauth2/v3/userinfo');

// Seletor de arquivos do Google: com o escopo drive.file o app só
// enxerga a planilha que a pessoa escolher aqui.
export async function escolherPlanilha() {
  await carregarScript('https://apis.google.com/js/api.js');
  await new Promise((ok) => gapi.load('picker', ok));
  return new Promise((ok) => {
    const view = new google.picker.DocsView(google.picker.ViewId.SPREADSHEETS).setMode(google.picker.DocsViewMode.LIST);
    const picker = new google.picker.PickerBuilder()
      .addView(view)
      .setOAuthToken(token.access_token)
      .setDeveloperKey(CONFIG.apiKey)
      .setAppId(CONFIG.appId)
      .setLocale('pt-BR')
      .setTitle('Escolha a planilha do Economiau')
      .setCallback((d) => {
        if (d.action === google.picker.Action.PICKED) ok({ id: d.docs[0].id, nome: d.docs[0].name });
        else if (d.action === google.picker.Action.CANCEL) ok(null);
      })
      .build();
    picker.setVisible(true);
  });
}

// ------------------------------------------------------------ Google Sheets
const BASE = 'https://sheets.googleapis.com/v4/spreadsheets/';
const q = (s) => "'" + s.replace(/'/g, "''") + "'";

export const sheets = {
  metadados: (id) => api(BASE + id + '?fields=properties.title,sheets.properties(sheetId,title)'),
  lerAbas(id, abas, render = 'UNFORMATTED_VALUE') {
    const p = abas.map((a) => 'ranges=' + encodeURIComponent(q(a))).join('&');
    return api(BASE + id + '/values:batchGet?' + p + '&valueRenderOption=' + render + '&dateTimeRenderOption=SERIAL_NUMBER');
  },
  lerCabecalhos(id, abas) {
    const p = abas.map((a) => 'ranges=' + encodeURIComponent(q(a) + '!1:1')).join('&');
    return api(BASE + id + '/values:batchGet?' + p + '&valueRenderOption=FORMULA');
  },
  escrever(id, data) {
    return api(BASE + id + '/values:batchUpdate', { method: 'POST', body: JSON.stringify({ valueInputOption: 'RAW', data }) });
  },
  lote(id, requests) {
    return api(BASE + id + ':batchUpdate', { method: 'POST', body: JSON.stringify({ requests }) });
  },
  intervalo: (aba, linha, col1, col2) => q(aba) + '!' + letra(col1) + linha + ':' + letra(col2) + linha,
};

export function letra(n) { // 1 → A, 27 → AA
  let s = '';
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}
