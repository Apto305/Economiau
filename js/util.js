// Utilidades gerais: dinheiro, datas e meses.
// Datas circulam no app como texto 'AAAA-MM-DD' e meses como 'AAAA-MM'.

export const brl = (n) =>
  'R$ ' + (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const brlSinal = (n) => (n < 0 ? '− ' : '') + brl(Math.abs(n));

export const arred = (n) => Math.round((Number(n) || 0) * 100) / 100;

// "1.234,56" ou "1234.56" → 1234.56
export function lerValor(txt) {
  if (typeof txt === 'number') return txt;
  let s = String(txt || '').replace(/[^\d,.-]/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

export const pad2 = (n) => String(n).padStart(2, '0');

export function hojeISO() {
  const d = new Date();
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}

export const mesDe = (iso) => (iso ? String(iso).slice(0, 7) : '');

export function somaMes(mes, n) {
  let [a, m] = mes.split('-').map(Number);
  m += n;
  while (m > 12) { m -= 12; a++; }
  while (m < 1) { m += 12; a--; }
  return a + '-' + pad2(m);
}

export const diasNoMes = (mes) => {
  const [a, m] = mes.split('-').map(Number);
  return new Date(a, m, 0).getDate();
};

// Dia do mês limitado ao tamanho do mês (dia 31 em fevereiro → 28/29)
export const dataNoMes = (mes, dia) => mes + '-' + pad2(Math.min(dia, diasNoMes(mes)));

export const nomeMes = (mes) => MESES[Number(mes.slice(5, 7)) - 1];
export const nomeMesAno = (mes) => {
  const n = nomeMes(mes);
  return n.charAt(0).toUpperCase() + n.slice(1) + ' de ' + mes.slice(0, 4);
};
export const mesCurto = (mes) => MESES_CURTOS[Number(mes.slice(5, 7)) - 1];

export const dataCurta = (iso) => (iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) : '');
export const dataBR = (iso) => (iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) : '');

export function diaSemana(iso) {
  const [a, m, d] = iso.split('-').map(Number);
  return DIAS[new Date(a, m - 1, d).getDay()];
}

export function somaDias(iso, n) {
  const [a, m, d] = iso.split('-').map(Number);
  const x = new Date(a, m - 1, d + n);
  return x.getFullYear() + '-' + pad2(x.getMonth() + 1) + '-' + pad2(x.getDate());
}

// Planilha Google: datas são números de série (dias desde 30/12/1899)
const BASE = Date.UTC(1899, 11, 30);
export function serialParaISO(v) {
  if (v === '' || v === null || v === undefined) return '';
  if (typeof v === 'string') {
    if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
    const m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m) return m[3] + '-' + pad2(m[2]) + '-' + pad2(m[1]);
    return '';
  }
  const d = new Date(BASE + Math.floor(v) * 86400000);
  return d.toISOString().slice(0, 10);
}
export function isoParaSerial(iso) {
  if (!iso) return '';
  const [a, m, d] = iso.split('-').map(Number);
  return Math.round((Date.UTC(a, m - 1, d) - BASE) / 86400000);
}
export function agoraSerial() {
  const d = new Date();
  return (Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds()) - BASE) / 86400000;
}

// Escapa texto para HTML
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const formatarId = (prefixo, n) => prefixo + '-' + String(n).padStart(4, '0');

export function proximoNumero(lista, prefixo) {
  let max = 0;
  lista.forEach((x) => {
    const m = String(x.id || '').match(new RegExp('^' + prefixo + '-(\\d+)$'));
    if (m) max = Math.max(max, Number(m[1]));
  });
  return max + 1;
}
