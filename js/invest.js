// Cálculo dos investimentos — o mesmo do robô da planilha (montar-planilha.gs,
// seção 8), para o app mostrar números atualizados na hora, inclusive de
// aportes e resgates que o robô ainda não viu.
import { arred, somaMes, mesDe } from './util.js';

const IOF_TABELA = [96, 93, 90, 86, 83, 80, 76, 73, 70, 66, 63, 60, 56, 53, 50,
  46, 43, 40, 36, 33, 30, 26, 23, 20, 16, 13, 10, 6, 3];

export function aliquotaIR(dias) {
  if (dias <= 180) return 0.225;
  if (dias <= 360) return 0.20;
  if (dias <= 720) return 0.175;
  return 0.15;
}
export const aliquotaIOF = (dias) => (dias < 1 || dias >= 30 ? 0 : IOF_TABELA[dias - 1] / 100);

export function diasEntre(a, b) {
  const u = (c) => { const [x, m, d] = c.split('-').map(Number); return Date.UTC(x, m - 1, d); };
  return Math.round((u(b) - u(a)) / 86400000);
}
export function somaDiasChave(c, n) {
  const [a, m, d] = c.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10);
}

// linhas da aba Índices → estrutura de consulta
export function prepararIndices(linhas) {
  const ind = { dias: [], cdi: {}, selic: {}, ipcaMes: {}, ipcaUltimo: 0, duMes: {} };
  const ipcaDatas = [];
  linhas.forEach((l) => {
    const k = l.dia;
    if (!k) return;
    if (l.cdi !== '' && l.cdi !== null && l.cdi !== undefined) {
      ind.dias.push(k); ind.cdi[k] = Number(l.cdi);
      const m = k.slice(0, 7); ind.duMes[m] = (ind.duMes[m] || 0) + 1;
    }
    if (l.selic !== '' && l.selic !== null && l.selic !== undefined) ind.selic[k] = Number(l.selic);
    if (l.ipca !== '' && l.ipca !== null && l.ipca !== undefined) { ind.ipcaMes[k.slice(0, 7)] = Number(l.ipca); ipcaDatas.push(k); }
  });
  ind.dias.sort();
  ipcaDatas.sort();
  if (ipcaDatas.length) ind.ipcaUltimo = ind.ipcaMes[ipcaDatas[ipcaDatas.length - 1].slice(0, 7)];
  const mesAtual = ind.dias.length ? ind.dias[ind.dias.length - 1].slice(0, 7) : '';
  if (mesAtual) ind.duMes[mesAtual] = Math.max(ind.duMes[mesAtual], 21);
  return ind;
}

function fatorDoDia(inv, dia, ind) {
  const taxa = Number(inv.taxa) || 0;
  const anual = (t) => Math.pow(1 + t / 100, 1 / 252);
  switch (inv.indexador) {
    case 'CDI': return 1 + (ind.cdi[dia] / 100) * (taxa / 100);
    case 'Selic': return (1 + (ind.selic[dia] ?? ind.cdi[dia]) / 100) * anual(taxa);
    case 'IPCA': {
      const m = dia.slice(0, 7);
      const ipca = ind.ipcaMes[m] ?? ind.ipcaUltimo;
      return Math.pow(1 + ipca / 100, 1 / (ind.duMes[m] || 21)) * anual(taxa);
    }
    default: return anual(taxa);
  }
}

// ---- Núcleo do cálculo (idêntico no app e no robô da planilha)

// Feriados nacionais: só para estimar os dias úteis que ainda não têm índice
function pascoa(ano) {
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
  return ano + '-' + String(mes).padStart(2, '0') + '-' + String(dia).padStart(2, '0');
}
const FERIADOS_CACHE = {};
function feriadosNacionais(ano) {
  if (FERIADOS_CACHE[ano]) return FERIADOS_CACHE[ano];
  const p = pascoa(ano);
  const fixos = ['01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '11-20', '12-25'].map((x) => ano + '-' + x);
  const moveis = [-48, -47, -2, 60].map((n) => somaDiasChave(p, n)); // carnaval (2), sexta-feira santa, corpus christi
  FERIADOS_CACHE[ano] = fixos.concat(moveis);
  return FERIADOS_CACHE[ano];
}
export function ehDiaUtil(chave) {
  const [a, m, d] = chave.split('-').map(Number);
  const s = new Date(Date.UTC(a, m - 1, d)).getUTCDay();
  return s > 0 && s < 6 && feriadosNacionais(a).indexOf(chave) < 0;
}

// O banco já credita o CDI de ontem; o Banco Central publica com atraso.
// Dias úteis depois do último índice (até ontem) usam o último índice
// conhecido (estimativa, trocada pelo valor real quando o robô buscar).
export function completarIndices(ind, hoje) {
  if (!ind.dias.length) return ind;
  const ult = ind.dias[ind.dias.length - 1];
  const est = [];
  for (let d = somaDiasChave(ult, 1); d < hoje && est.length < 7; d = somaDiasChave(d, 1)) if (ehDiaUtil(d)) est.push(d);
  if (!est.length) return ind;
  const ix = Object.assign({}, ind, { dias: ind.dias.concat(est), cdi: Object.assign({}, ind.cdi), selic: Object.assign({}, ind.selic), estimados: est });
  est.forEach((d) => { ix.cdi[d] = ind.cdi[ult]; if (ind.selic[ult] !== undefined) ix.selic[d] = ind.selic[ult]; });
  return ix;
}

// De quais depósitos sai o resgate: 'novos' (mais novos primeiro), 'antigos'
// (mais antigos primeiro) ou 'proporcional' (de todos, na proporção)
export function ordemDoResgate(texto) {
  const t = String(texto || '').toLowerCase();
  if (t.indexOf('antigo') >= 0) return 'antigos';
  if (t.indexOf('proporc') >= 0) return 'proporcional';
  return 'novos';
}

// Tira "bruto" dos lotes; devolve o IR + IOF retido na hora
function tirarDosLotes(lotes, bruto, dia, ordem, isento) {
  const total = lotes.reduce((t, l) => t + l.valor, 0);
  if (total <= 0 || bruto <= 0) return 0;
  let imposto = 0;
  const tirar = (l, frac) => {
    if (frac <= 0) return;
    const ganho = Math.max(0, l.valor - l.principal) * frac;
    const dias = diasEntre(l.dia, dia);
    const iof = ganho * aliquotaIOF(dias);
    const ir = isento ? 0 : (ganho - iof) * aliquotaIR(dias);
    l.rendRetirado += ganho; l.impostoPago += iof + ir; imposto += iof + ir;
    l.principal *= 1 - frac; l.valor *= 1 - frac;
  };
  if (ordem === 'proporcional') {
    const f = Math.min(1, bruto / total);
    lotes.forEach((l) => tirar(l, f));
    return imposto;
  }
  const fila = lotes.slice().sort((a, b) => (a.dia < b.dia ? -1 : a.dia > b.dia ? 1 : 0));
  if (ordem === 'novos') fila.reverse();
  let resta = bruto;
  for (const l of fila) {
    if (resta <= 0.000001) break;
    if (l.valor <= 0) continue;
    const t = Math.min(resta, l.valor);
    tirar(l, t / l.valor);
    resta -= t;
  }
  return imposto;
}

function aplicarMovimento(lotes, mov, ordem, isento) {
  if (mov.tipo === 'Aporte') {
    lotes.push({ dia: mov.dia, original: mov.valor, principal: mov.valor, valor: mov.valor, rendRetirado: 0, impostoPago: 0 });
    return;
  }
  const total = lotes.reduce((t, l) => t + l.valor, 0);
  if (total <= 0) return;
  if (mov.tipo === 'Ajuste') { // correção pelo banco: muda só o rendimento
    const g = Math.max(0, 1 + mov.valor / total);
    lotes.forEach((l) => { l.valor *= g; });
    return;
  }
  tirarDosLotes(lotes, mov.valor, mov.dia, ordem, isento);
}

// Lotes (um por depósito) na manhã de "hoje": rendem desde o dia do depósito;
// o índice de cada dia útil é creditado no dia seguinte.
function lotesAte(inv, movs, ind, hoje, ordem, isento) {
  const lista = movs.filter((m) => m.dia && Number(m.valor)).map((m) => ({ dia: m.dia, tipo: m.tipo, valor: Number(m.valor) }))
    .sort((a, b) => (a.dia < b.dia ? -1 : a.dia > b.dia ? 1 : (a.tipo === 'Aporte' ? -1 : 1) - (b.tipo === 'Aporte' ? -1 : 1)));
  const lotes = [];
  let i = 0;
  for (const dia of ind.dias) {
    if (dia >= hoje) break;
    while (i < lista.length && lista[i].dia <= dia) aplicarMovimento(lotes, lista[i++], ordem, isento);
    lotes.forEach((l) => { l.valor *= fatorDoDia(inv, dia, ind); });
  }
  while (i < lista.length && lista[i].dia <= hoje) aplicarMovimento(lotes, lista[i++], ordem, isento);
  return lotes;
}

function resumoDosLotes(lotes, hoje, isento) {
  const r = { aplicado: 0, bruto: 0, rendimento: 0, iof: 0, ir: 0, liquido: 0, lotes: [] };
  lotes.forEach((l) => {
    const rend = Math.max(0, l.valor - l.principal);
    const dias = diasEntre(l.dia, hoje);
    const iof = rend * aliquotaIOF(dias);
    const ir = isento ? 0 : (rend - iof) * aliquotaIR(dias);
    r.aplicado += l.principal; r.bruto += l.valor; r.rendimento += l.valor - l.principal; r.iof += iof; r.ir += ir;
    r.lotes.push({ dia: l.dia, dias: dias, original: l.original, principal: l.principal, valor: l.valor,
      rendimento: l.valor - l.principal + l.rendRetirado, imposto: iof + ir + l.impostoPago, retirado: l.original - l.principal });
  });
  r.liquido = r.bruto - r.iof - r.ir;
  return r;
}

export const ehIsento = (inv) => inv.isento === 'Sim' || ['LCI', 'LCA', 'Poupança'].includes(inv.tipo);

const paraCore = (movs) => movs.map((m) => ({ dia: m.data, tipo: m.tipo, valor: Number(m.valor) }));
export const ORDENS_RESGATE = ['Depósitos mais novos', 'Depósitos mais antigos', 'Proporcional'];

export function calcular(inv, movs, ind, hoje) {
  const isento = ehIsento(inv);
  const ix = completarIndices(ind, hoje);
  const lotes = lotesAte(inv, paraCore(movs), ix, hoje, ordemDoResgate(inv.ordemResgate), isento);
  const r = resumoDosLotes(lotes, hoje, isento);
  r.depositos = r.lotes.map((l) => ({ ...l, valor: arred(l.valor), principal: arred(l.principal), rendimento: arred(l.rendimento), imposto: arred(l.imposto), retirado: arred(l.retirado) }));
  r.lotes = r.lotes.filter((l) => l.valor > 0.005);
  ['aplicado', 'bruto', 'rendimento', 'iof', 'ir', 'liquido'].forEach((k) => { r[k] = arred(r[k]); });
  r.estimados = ix.estimados || [];
  return r;
}

// Resgate informado pelo que caiu na conta: quanto saiu do investimento
// (bruto) naquele dia, pela posição do dia e pela ordem de resgate.
export function brutoDoResgate(inv, movs, ind, data, liquido) {
  const isento = ehIsento(inv);
  const ordem = ordemDoResgate(inv.ordemResgate);
  const ix = completarIndices(ind, data);
  const base = lotesAte(inv, paraCore(movs).filter((m) => m.dia <= data), ix, data, ordem, isento);
  const total = base.reduce((t, l) => t + l.valor, 0);
  const liqDe = (b) => { const c = base.map((l) => ({ ...l })); return b - tirarDosLotes(c, b, data, ordem, isento); };
  if (total <= 0) return { bruto: arred(liquido), total: false };
  if (liqDe(total) <= liquido + 0.005) return { bruto: arred(total), total: true };
  let lo = liquido, hi = total;
  for (let k = 0; k < 60; k++) { const m = (lo + hi) / 2; if (liqDe(m) < liquido) lo = m; else hi = m; }
  return { bruto: arred(hi), total: false };
}

// Taxas anuais de referência a partir dos índices mais recentes
export function indicesDoDia(ind) {
  const ult = ind.dias[ind.dias.length - 1];
  if (!ult) return null;
  const cdiAno = (Math.pow(1 + ind.cdi[ult] / 100, 252) - 1) * 100;
  const selicDia = ind.selic[ult] ?? ind.cdi[ult];
  const selicAno = (Math.pow(1 + selicDia / 100, 252) - 1) * 100;
  // IPCA acumulado nos últimos 12 meses com dado
  const meses = Object.keys(ind.ipcaMes).sort().slice(-12);
  const ipca12 = (meses.reduce((f, m) => f * (1 + ind.ipcaMes[m] / 100), 1) - 1) * 100;
  return { dia: ult, cdiAno, selicAno, ipca12, ipcaMeses: meses.length };
}

// Simulação de 1 ano com os índices de hoje (para o formulário de novo investimento)
export function simularAno(inv, valor, ind) {
  const ref = indicesDoDia(ind);
  if (!ref || !valor) return null;
  const taxa = Number(inv.taxa) || 0;
  let anual;
  if (inv.indexador === 'CDI') anual = ref.cdiAno * taxa / 100;
  else if (inv.indexador === 'Selic') anual = ((1 + ref.selicAno / 100) * (1 + taxa / 100) - 1) * 100;
  else if (inv.indexador === 'IPCA') anual = ((1 + ref.ipca12 / 100) * (1 + taxa / 100) - 1) * 100;
  else anual = taxa;
  const bruto = valor * (1 + anual / 100);
  const rend = bruto - valor;
  const ir = ehIsento(inv) ? 0 : rend * aliquotaIR(365);
  const liquido = bruto - ir;
  // % do CDI que um CDB tributado precisaria para empatar no líquido
  const cdbEquivalente = ref.cdiAno > 0 ? ((rend - ir) / valor) / (1 - aliquotaIR(365)) / (ref.cdiAno / 100) * 100 : 0;
  return { anual, bruto: arred(bruto), rendimento: arred(rend), ir: arred(ir), liquido: arred(liquido), cdbEquivalente };
}

// Próxima mudança de faixa do IR do aporte mais antigo ainda aplicado
export function proximaFaixa(lotes, hoje) {
  if (!lotes.length) return null;
  const l = lotes.slice().sort((a, b) => (a.dia < b.dia ? -1 : 1))[0];
  const dias = diasEntre(l.dia, hoje);
  const limites = [180, 360, 720];
  const prox = limites.find((x) => dias <= x);
  if (!prox) return { atual: 15, proxima: null, data: null };
  return { atual: aliquotaIR(dias) * 100, proxima: aliquotaIR(prox + 1) * 100, data: somaDiasChave(l.dia, prox + 1) };
}

export { mesDe, somaMes };

// Quanto de rendimento bruto precisa entrar (ou sair) hoje para o app bater
// com o valor que o banco mostra. "base" = 'liquido' ou 'bruto'.
export function ajusteParaBater(inv, movs, ind, hoje, alvo, base = 'liquido') {
  const valorCom = (d) => {
    const extra = d ? [...movs, { data: hoje, tipo: 'Ajuste', valor: d }] : movs;
    return calcular(inv, extra, ind, hoje)[base];
  };
  let d = 0, v = valorCom(0);
  for (let k = 0; k < 6 && Math.abs(alvo - v) >= 0.005; k++) {
    // sensibilidade numérica: quanto o valor muda para cada R$ 1 de ajuste
    const passo = Math.max(1, Math.abs(alvo - v));
    const s = (valorCom(d + passo) - v) / passo || 1;
    d += (alvo - v) / s;
    v = valorCom(d);
  }
  // em centavos, o que chega mais perto do banco
  const c = arred(d);
  return [c, arred(c - 0.01), arred(c + 0.01), arred(c - 0.02), arred(c + 0.02)]
    .map((x) => [x, Math.abs(valorCom(x) - alvo)]).sort((a, b) => a[1] - b[1])[0][0];
}
