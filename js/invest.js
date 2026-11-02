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

function aplicarMovimento(lotes, mov) {
  if (mov.tipo === 'Aporte') { lotes.push({ dia: mov.dia, principal: mov.valor, valor: mov.valor }); return; }
  const total = lotes.reduce((t, l) => t + l.valor, 0);
  if (total <= 0) return;
  const f = Math.min(1, mov.valor / total);
  lotes.forEach((l) => { l.principal *= (1 - f); l.valor *= (1 - f); });
}

export const ehIsento = (inv) => inv.isento === 'Sim' || ['LCI', 'LCA', 'Poupança'].includes(inv.tipo);

// inv: registro da aba Investimentos; movs: [{data, tipo, valor}]
export function calcular(inv, movs, ind, hoje) {
  const ordem = movs.filter((m) => m.data && m.valor).map((m) => ({ dia: m.data, tipo: m.tipo, valor: Number(m.valor) }))
    .sort((a, b) => (a.dia < b.dia ? -1 : a.dia > b.dia ? 1 : (a.tipo === 'Aporte' ? -1 : 1)));
  const lotes = [];
  let i = 0;
  for (const dia of ind.dias) {
    if (dia > hoje) break;
    lotes.forEach((l) => { if (l.dia < dia) l.valor *= fatorDoDia(inv, dia, ind); });
    while (i < ordem.length && ordem[i].dia <= dia) aplicarMovimento(lotes, ordem[i++]);
  }
  while (i < ordem.length && ordem[i].dia <= hoje) aplicarMovimento(lotes, ordem[i++]);
  const isento = ehIsento(inv);
  const r = { aplicado: 0, bruto: 0, rendimento: 0, iof: 0, ir: 0, liquido: 0, lotes: [] };
  lotes.forEach((l) => {
    const rend = Math.max(0, l.valor - l.principal);
    const dias = diasEntre(l.dia, hoje);
    const iof = rend * aliquotaIOF(dias);
    const ir = isento ? 0 : (rend - iof) * aliquotaIR(dias);
    r.aplicado += l.principal; r.bruto += l.valor; r.rendimento += l.valor - l.principal; r.iof += iof; r.ir += ir;
    if (l.valor > 0.005) r.lotes.push({ dia: l.dia, dias, principal: l.principal, valor: l.valor });
  });
  r.liquido = r.bruto - r.iof - r.ir;
  ['aplicado', 'bruto', 'rendimento', 'iof', 'ir', 'liquido'].forEach((k) => { r[k] = arred(r[k]); });
  return r;
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
