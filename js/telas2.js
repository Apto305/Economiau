// Telas do fechamento (conferência) e dos investimentos.
import { esc, brl, brlSinal, dataCurta, dataBR, nomeMesAno, mesDe, lerValor, arred, hojeISO, agoraSerial } from './util.js';
import { ic } from './icones.js';
import * as R from './regras.js';
import * as I from './invest.js';
import { apoio, casca, corConta } from './telas.js';

const sens = (txt) => `<span class="valor-sens">${txt}</span>`;
const valorTxt = (n) => (n === '' || n === null || n === undefined ? '' : Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const pct = (n, d = 1) => Number(n).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }) + '%';
const seletorMes = (E) => `<div style="display:flex;align-items:center;gap:2px;height:40px;padding:0 4px;border-radius:12px;background:var(--surf)">
    <button class="icone-btn" style="width:34px;height:34px" data-a="mudarMes" data-v="-1" aria-label="Mês anterior">${ic('esq', 16)}</button>
    <span style="font-size:14px;font-weight:700;padding:0 4px;white-space:nowrap"><span class="so-largo">${nomeMesAno(E.mes)}</span><span class="so-curto" style="text-transform:capitalize">${nomeMesAno(E.mes).slice(0, 3)} ${E.mes.slice(0, 4)}</span></span>
    <button class="icone-btn" style="width:34px;height:34px" data-a="mudarMes" data-v="1" aria-label="Próximo mês">${ic('seta', 16)}</button></div>`;

// ============================================================ conferência
export function faturasDaConferencia(db, mes) {
  return db.faturas.filter((f) => f.mesRenda === mes && R.porId(db.cartoes, f.cartao))
    .sort((a, b) => (a.vencimento < b.vencimento ? -1 : 1));
}
export function comprasDaFatura(db, f) {
  return db.transacoes.filter((t) => t.fatura === f.id && R.ehGasto(t)).sort((a, b) => (a.data < b.data ? 1 : -1));
}
export function estadoFatura(db, f) {
  const compras = comprasDaFatura(db, f);
  const total = R.totalFatura(db, f.id);
  const banco = f.totalBanco === '' || f.totalBanco === undefined || f.totalBanco === null ? null : Number(f.totalBanco);
  const dif = banco === null ? null : arred(banco - total);
  const marcadas = compras.filter((t) => t.conferido).length;
  // fatura sem nenhum lançamento: não há o que conferir
  const pronta = (banco !== null && Math.abs(dif) < 0.005 && marcadas === compras.length) || (!compras.length && Math.abs(total) < 0.005 && !banco);
  return { compras, total, banco, dif, marcadas, pronta };
}

// ---- contas: tudo o que entrou e saiu da conta no mês (como um extrato)
const ultimoDia = (mes) => { const [a, m] = mes.split('-').map(Number); return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10); };
export function itensDaConta(E, c, mes) {
  const db = E.db;
  const out = [];
  db.transacoes.forEach((t) => {
    if (mesDe(t.data) !== mes || !R.confirmado(t)) return;
    let sinal = 0;
    if (t.tipo === R.TIPO.fatura && t.conta === c.id) sinal = -1;
    else if (t.tipo === R.TIPO.transf) sinal = t.conta === c.id ? -1 : t.contaDestino === c.id ? 1 : 0;
    else if (t.conta === c.id && !t.cartao) sinal = t.tipo === R.TIPO.despesa ? -1 : 1;
    if (sinal) out.push({ k: 'trn', id: t.id, data: t.data, desc: t.desc || t.tipo, sub: R.ehAjuste(t) ? 'Ajuste de saldo' : t.tipo === R.TIPO.fatura ? 'Pagamento de fatura' : t.tipo === R.TIPO.transf ? (sinal < 0 ? 'Transferência para ' : 'Transferência de ') + ((R.porId(db.contas, sinal < 0 ? t.contaDestino : t.conta) || {}).nome || '') : (R.porId(db.categorias, t.categoria) || {}).nome || t.tipo, sinal, valor: t.valor, ok: !!t.conferido, pode: true });
  });
  const temRen = E.banco.temCampo('rendas', 'conferido'), temMov = E.banco.temCampo('movsInv', 'conferido');
  db.rendas.forEach((r) => {
    if (r.conta !== c.id || mesDe(r.data) !== mes) return;
    out.push({ k: 'ren', id: r.id, data: r.data, desc: r.desc || 'Renda', sub: 'Renda', sinal: 1, valor: r.valor, ok: temRen ? !!r.conferido : true, pode: temRen });
  });
  (db.movsInv || []).forEach((m) => {
    if (m.conta !== c.id || mesDe(m.data) !== mes || (m.tipo !== 'Aporte' && m.tipo !== 'Resgate')) return;
    const inv = R.porId(db.investimentos || [], m.investimento) || {};
    const liq = m.tipo === 'Resgate' && Number(m.liquido) > 0 ? Number(m.liquido) : Number(m.valor);
    out.push({ k: 'inv', id: m.id, data: m.data, desc: m.tipo + ' · ' + (inv.nome || 'investimento'), sub: 'Investimento', sinal: m.tipo === 'Aporte' ? -1 : 1, valor: liq, ok: temMov ? !!m.conferido : true, pode: temMov });
  });
  return out.sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : 0));
}
export function estadoConta(E, c, mes) {
  const db = E.db;
  const itens = itensDaConta(E, c, mes);
  const reg = (db.confContas || []).find((x) => x.conta === c.id && x.mes === mes);
  const hoje = hojeISO();
  const dataSaldo = ultimoDia(mes) < hoje ? ultimoDia(mes) : hoje;
  const app = R.saldoConta(db, c, dataSaldo);
  const k = c.id + ':' + mes;
  const dig = E.saldoBanco[k];
  const banco = dig !== undefined ? (dig === '' ? null : arred(lerValor(dig))) : reg && reg.saldoBanco !== '' && reg.saldoBanco !== undefined && reg.saldoBanco !== null ? Number(reg.saldoBanco) : null;
  const dif = banco === null ? null : arred(banco - app);
  const marcadas = itens.filter((x) => x.ok).length;
  const conferida = reg ? !!reg.conferida : !!E.contasOk[k];
  const pronta = banco !== null && Math.abs(dif) < 0.005 && marcadas === itens.length;
  return { itens, reg, dataSaldo, app, banco, dif, marcadas, conferida, pronta, chave: k };
}

export function telaConferencia(E) {
  const A = apoio(E);
  const db = E.db, mes = E.mes;
  const nomeM = nomeMesAno(mes).split(' ')[0].toLowerCase();
  const faturas = faturasDaConferencia(db, mes);
  const contas = db.contas.filter(R.ativo);
  const fSel = R.porId(faturas, E.confFatura) || null;
  const cSel = fSel ? null : R.porId(contas, E.confConta) || null;
  const confFat = faturas.filter((f) => f.conferida).length;
  const estados = {};
  contas.forEach((c) => (estados[c.id] = estadoConta(E, c, mes)));
  const confContas = contas.filter((c) => estados[c.id].conferida).length;
  // lançamentos a conferir: compras das faturas do mês + o que passou pelas contas no mês
  const vistos = {};
  faturas.forEach((f) => comprasDaFatura(db, f).forEach((t) => (vistos['trn:' + t.id] = !!t.conferido)));
  contas.forEach((c) => estados[c.id].itens.forEach((x) => (vistos[x.k + ':' + x.id] = x.ok)));
  const trnsTot = Object.keys(vistos).length;
  const trnsOk = Object.values(vistos).filter(Boolean).length;
  const barra = (n, d) => `<div class="barra" style="margin-top:6px"><span style="width:${d ? Math.round(n / d * 100) : 0}%"></span></div>`;

  const resumo = `<div class="cartao"><h2 style="font-size:15px;font-weight:800">Fechamento de ${esc(nomeM)}</h2>
    <div style="margin-top:12px"><div style="display:flex;justify-content:space-between;font-size:13.5px"><span>Faturas</span><strong>${confFat} de ${faturas.length}</strong></div>${barra(confFat, faturas.length)}</div>
    <div style="margin-top:12px"><div style="display:flex;justify-content:space-between;font-size:13.5px"><span>Contas</span><strong>${confContas} de ${contas.length}</strong></div>${barra(confContas, contas.length)}</div>
    <div style="margin-top:12px"><div style="display:flex;justify-content:space-between;font-size:13.5px"><span>Lançamentos conferidos</span><strong>${trnsOk} de ${trnsTot}</strong></div>${barra(trnsOk, trnsTot)}</div>
    <a class="link" href="#/acerto" style="display:inline-block;margin-top:12px">Ir para o acerto de ${esc(nomeM)}</a></div>`;

  const listaFaturas = `<div class="secao-titulo"><span>Faturas que contam em ${esc(nomeM)}</span></div>
    <div class="lista">${faturas.length ? faturas.map((f) => {
      const c = A.cartao(f.cartao);
      const st = estadoFatura(db, f);
      const pill = f.conferida ? '<span class="pill ok">Conferida</span>' : st.banco !== null ? '<span class="pill aviso">Conferindo</span>' : '<span class="pill neutra">A conferir</span>';
      return `<button class="item" data-a="abrirConfFatura" data-id="${f.id}" ${fSel && fSel.id === f.id ? 'style="background:#232832"' : ''}><span class="chip-cor" style="background:${corConta(c.cor)}">${esc(c.nome[0])}</span><span class="principal-txt"><span class="titulo">${esc(c.nome)}</span><span class="sub">vence ${dataCurta(f.vencimento)} · ${st.marcadas} de ${st.compras.length} compras · ${sens(brl(st.total))}</span></span>${pill}</button>`;
    }).join('') : `<div class="vazio">Nenhuma fatura conta em ${esc(nomeM)}.</div>`}</div>`;

  const listaContas = `<div class="secao-titulo"><span>Contas em ${esc(nomeM)}</span></div>
    <div class="lista">${contas.map((c) => {
      const st = estados[c.id];
      const pill = st.conferida ? '<span class="pill ok">Conferida</span>' : st.banco !== null || st.marcadas ? '<span class="pill aviso">Conferindo</span>' : '<span class="pill neutra">A conferir</span>';
      return `<button class="item" data-a="abrirConfConta" data-id="${c.id}" ${cSel && cSel.id === c.id ? 'style="background:#232832"' : ''}><span class="chip-cor" style="background:${corConta(c.cor)}">${esc((c.nome || '?')[0])}</span><span class="principal-txt"><span class="titulo">${esc(A.nomeConta(c.id))}</span><span class="sub">${st.marcadas} de ${st.itens.length} lançamentos · saldo ${sens(brlSinal(st.app))}</span></span>${pill}</button>`;
    }).join('')}</div>`;

  const painel = fSel ? painelFatura(E, A, fSel) : cSel ? painelConta(E, A, cSel, estados[cSel.id]) : `<div class="cartao so-pc" style="text-align:center;color:var(--muted);padding:40px 16px">${ic('faturas', 32)}<p style="margin-top:8px">Escolha uma fatura ou uma conta para conferir com o banco.</p></div>`;
  let corpo;
  if (fSel || cSel) corpo = `<div class="grade-conf"><div class="so-pc">${resumo}${listaFaturas}${listaContas}</div><div>${painel}</div></div>`;
  else corpo = `<div class="grade-conf"><div>${resumo}${listaFaturas}${listaContas}</div><div class="so-pc">${painel}</div></div>`;
  return casca(E, fSel || cSel ? `<span class="so-pc">Conferência</span><span class="so-cel-i">${fSel ? 'Conferir fatura' : 'Conferir conta'}</span>` : 'Conferência', corpo, { voltar: fSel || cSel ? null : 'mais', acoes: (fSel || cSel ? `<button class="icone-btn so-cel" data-a="fecharConfFatura" aria-label="Voltar para a lista">${ic('voltar', 22)}</button>` : '') + seletorMes(E) });
}

function painelConta(E, A, c, st) {
  const nomeM = nomeMesAno(E.mes).split(' ')[0].toLowerCase();
  const linhaItem = (x) => `<div class="item" style="padding:10px 16px">
      <button class="check ${x.ok ? 'on' : ''}" style="border:0;width:28px;height:28px;border-radius:14px${x.pode ? '' : ';opacity:.4'}" role="checkbox" aria-checked="${x.ok}" aria-label="Conferir ${esc(x.desc)}" data-a="confItem" data-k="${x.k}" data-id="${x.id}" ${x.pode ? '' : 'disabled title="Rode o script 1.15 para marcar"'}>${x.ok ? ic('ok', 14, 'stroke-width="3.2"') : ''}</button>
      <button class="principal-txt" style="border:0;background:none;text-align:left;color:var(--text);padding:0" data-a="abrirDetalhe" data-k="${x.k}" data-id="${x.id}"><span class="titulo">${esc(x.desc)}</span><span class="sub">${dataCurta(x.data)} · ${esc(x.sub)}</span></button>
      <span class="valor ${x.sinal > 0 ? 'rec' : ''}">${x.sinal > 0 ? '+ ' : '− '}${sens(brl(x.valor))}</span></div>`;
  const difTxt = st.dif === null ? '<span class="muted">—</span>' : Math.abs(st.dif) < 0.005 ? '<span class="rec">Bateu</span>' : `<span style="color:var(--aviso)">${brlSinal(st.dif)}</span>`;
  let dica = '';
  if (st.dif !== null && st.dif > 0.005) dica = `No banco tem ${brl(st.dif)} a mais: falta lançar uma entrada, ou uma saída foi lançada a mais ou com valor errado.`;
  else if (st.dif !== null && st.dif < -0.005) dica = `No app tem ${brl(-st.dif)} a mais: falta lançar uma saída (pix, boleto, tarifa…), ou uma entrada foi lançada a mais.`;
  const temTab = E.banco.temCampo('confContas', 'conta');
  const rodape = st.conferida
    ? `<div class="aviso-caixa" style="background:#18363A;color:#B8E9EC">${ic('ok', 18)}<span>Conta conferida em ${esc(nomeM)}. <button class="link" data-a="desconferirConta" data-id="${c.id}">Desfazer</button></span></div>`
    : `<button class="btn btn-pri btn-largo" data-a="concluirConta" data-id="${c.id}" ${st.pronta ? '' : 'aria-disabled="true"'}>${st.pronta ? 'Conta conferida' : st.banco === null ? 'Digite o saldo do banco' : Math.abs(st.dif) >= 0.005 ? 'Ainda há diferença' : 'Marque todos os lançamentos'}</button>`;
  return `<div class="cartao" style="padding:0;overflow:hidden">
    <div style="padding:16px">
      <div style="display:flex;align-items:center;gap:10px"><span class="chip-cor" style="background:${corConta(c.cor)}">${esc((c.nome || '?')[0])}</span><div style="flex:1"><div style="font-size:17px;font-weight:800">${esc(A.nomeConta(c.id))}</div><div class="muted" style="font-size:12.5px">saldo em ${dataBR(st.dataSaldo)}${st.dataSaldo === hojeISO() ? ' (hoje)' : ' (fim do mês)'}</div></div></div>
      ${temTab ? '' : '<div class="aviso-caixa" style="margin-top:10px">Rode o script da planilha versão 1.15 para a conferência das contas ficar salva na planilha (e valer para os dois).</div>'}
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-top:14px;align-items:end">
        <div><div class="muted" style="font-size:12px">No app</div><div style="font-size:17px;font-weight:800">${sens(brlSinal(st.app))}</div></div>
        <label><span class="muted" style="font-size:12px;display:block">No banco</span><input class="entrada" style="height:38px;font-size:15px;font-weight:800;text-align:right;padding:0 8px" inputmode="numeric" data-mascara="dinheiro" data-negativo="1" data-saldo-banco="${st.chave}" placeholder="0,00" value="${esc(E.saldoBanco[st.chave] !== undefined ? E.saldoBanco[st.chave] : st.banco === null ? '' : valorTxt(st.banco))}" ${st.conferida ? 'disabled' : ''}></label>
        <div style="text-align:right"><div class="muted" style="font-size:12px">Diferença</div><div style="font-size:17px;font-weight:800">${difTxt}</div></div>
      </div>
      ${dica ? `<div class="aviso-caixa" style="margin-top:12px">${ic('aviso', 18)}<span>${dica}</span></div>` : ''}
      ${st.conferida ? '' : `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px"><button class="btn btn-peq btn-sec" data-a="marcarTodosConta" data-id="${c.id}">Marcar todos</button><button class="btn btn-peq btn-borda" data-a="lancarNaConta" data-id="${c.id}">${ic('mais_', 16)}Lançar o que falta</button>${st.dif !== null && Math.abs(st.dif) >= 0.005 ? `<button class="btn btn-peq btn-borda" data-a="ajustarSaldo" data-id="${c.id}">Ajustar ${brlSinal(st.dif)}</button>` : ''}</div>`}
    </div>
    <div style="border-top:1px solid var(--line)">${st.itens.length ? st.itens.map(linhaItem).join('') : `<div class="vazio">Nada entrou nem saiu desta conta em ${esc(nomeM)}.</div>`}</div>
    <div style="padding:14px 16px;border-top:1px solid var(--line)"><div class="muted" style="font-size:12.5px;margin-bottom:10px">${st.marcadas} de ${st.itens.length} lançamentos conferidos · "Ajustar" lança a diferença como ajuste de saldo (não conta como gasto nem receita)</div>${rodape}</div>
  </div>`;
}

function painelFatura(E, A, f) {
  const db = E.db;
  const c = A.cartao(f.cartao);
  const st = estadoFatura(db, f);
  const linhaCompra = (t) => `<div class="item" style="padding:10px 16px">
      <button class="check ${t.conferido ? 'on' : ''}" style="border:0;width:28px;height:28px;border-radius:14px" role="checkbox" aria-checked="${!!t.conferido}" aria-label="Conferir ${esc(t.desc)}" data-a="confCompra" data-id="${t.id}">${t.conferido ? ic('ok', 14, 'stroke-width="3.2"') : ''}</button>
      <button class="principal-txt" style="border:0;background:none;text-align:left;color:var(--text);padding:0" data-a="abrirDetalhe" data-k="trn" data-id="${t.id}"><span class="titulo">${esc(t.desc)}${t.totalParcelas > 1 ? ' ' + t.parcela + '/' + t.totalParcelas : ''}</span><span class="sub">${dataCurta(t.data)} · ${esc(A.catCurta(t.categoria) || '')} · ${esc(A.nome(t.dono))}</span></button>
      <span class="valor ${t.tipo === R.TIPO.estorno ? 'rec' : ''}">${t.tipo === R.TIPO.estorno ? '− ' : ''}${sens(brl(t.valor))}</span></div>`;
  const difTxt = st.dif === null ? '<span class="muted">—</span>' : Math.abs(st.dif) < 0.005 ? '<span class="rec">Bateu</span>' : `<span style="color:var(--aviso)">${brlSinal(st.dif)}</span>`;
  let dica = '';
  if (st.dif !== null && st.dif > 0.005) dica = `No banco tem ${brl(st.dif)} a mais: provavelmente uma compra que não foi lançada (ou lançada em outra fatura).`;
  else if (st.dif !== null && st.dif < -0.005) dica = `No app tem ${brl(-st.dif)} a mais: confira se alguma compra foi lançada em dobro, com valor errado, ou se caiu na fatura seguinte.`;
  const rodape = f.conferida
    ? `<div class="aviso-caixa" style="background:#18363A;color:#B8E9EC">${ic('ok', 18)}<span>Fatura conferida. <button class="link" data-a="desconferirFatura" data-id="${f.id}">Desfazer</button></span></div>`
    : `<button class="btn btn-pri btn-largo" data-a="concluirFatura" data-id="${f.id}" ${st.pronta ? '' : 'aria-disabled="true"'}>${st.pronta ? 'Fatura conferida' : st.banco === null ? 'Digite o total do banco' : Math.abs(st.dif) >= 0.005 ? 'Ainda há diferença' : 'Marque todas as compras'}</button>`;
  return `<div class="cartao" style="padding:0;overflow:hidden">
    <div style="padding:16px">
      <div style="display:flex;align-items:center;gap:10px"><span class="chip-cor" style="background:${corConta(c.cor)}">${esc(c.nome[0])}</span><div style="flex:1"><div style="font-size:17px;font-weight:800">${esc(c.nome)}</div><div class="muted" style="font-size:12.5px">fecha ${dataBR(f.fechamento)} · vence ${dataBR(f.vencimento)}</div></div></div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-top:14px;align-items:end">
        <div><div class="muted" style="font-size:12px">No app</div><div style="font-size:17px;font-weight:800">${sens(brl(st.total))}</div></div>
        <label><span class="muted" style="font-size:12px;display:block">No banco</span><input class="entrada" style="height:38px;font-size:15px;font-weight:800;text-align:right;padding:0 8px" inputmode="numeric" data-mascara="dinheiro" data-total-banco="${f.id}" placeholder="0,00" value="${esc(st.banco === null ? '' : valorTxt(st.banco))}" ${f.conferida ? 'disabled' : ''}></label>
        <div style="text-align:right"><div class="muted" style="font-size:12px">Diferença</div><div style="font-size:17px;font-weight:800">${difTxt}</div></div>
      </div>
      ${dica ? `<div class="aviso-caixa" style="margin-top:12px">${ic('aviso', 18)}<span>${dica}</span></div>` : ''}
      ${f.conferida ? '' : `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px"><button class="btn btn-peq btn-sec" data-a="marcarTodasCompras" data-id="${f.id}">Marcar todas</button><button class="btn btn-peq btn-borda" data-a="lancarNaFatura" data-id="${f.id}">${ic('mais_', 16)}Lançar compra que falta</button></div>`}
    </div>
    <div style="border-top:1px solid var(--line)">${st.compras.length ? st.compras.map(linhaCompra).join('') : '<div class="vazio">Nenhuma compra lançada nesta fatura.</div>'}</div>
    <div style="padding:14px 16px;border-top:1px solid var(--line)"><div class="muted" style="font-size:12.5px;margin-bottom:10px">${st.marcadas} de ${st.compras.length} compras conferidas</div>${rodape}</div>
  </div>`;
}

// ========================================================== investimentos
export function calcInvest(E) {
  if (E._inv && E._inv.db === E.db && E._inv.rev === E.rev) return E._inv;
  const ind = I.prepararIndices(E.db.indices || []);
  const hoje = hojeISO();
  const ultimoDia = ind.dias[ind.dias.length - 1] || hoje;
  const res = {};
  (E.db.investimentos || []).forEach((inv) => {
    const movs = (E.db.movsInv || []).filter((m) => m.investimento === inv.id);
    res[inv.id] = I.calcular(inv, movs, ind, hoje);
    res[inv.id].movs = movs.slice().sort((a, b) => (a.data < b.data ? 1 : -1));
  });
  E._inv = { db: E.db, rev: E.rev, ind, res, ref: I.indicesDoDia(ind), ultimoDia };
  return E._inv;
}

const descTaxa = (inv) => {
  const t = Number(inv.taxa) || 0;
  if (inv.indexador === 'CDI') return pct(t, t % 1 ? 1 : 0) + ' do CDI';
  if (inv.indexador === 'Prefixado') return pct(t, 2) + ' ao ano';
  return inv.indexador + ' + ' + pct(t, 2);
};

// Data e hora de um número de série da planilha (fuso da planilha), "07/11 às 08:12"
function quando(serial) {
  const d = new Date(Date.UTC(1899, 11, 30) + Math.round(serial * 86400000));
  const p2 = (n) => String(n).padStart(2, '0');
  const dia = `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}`;
  const hora = `${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}`;
  return (dia === hojeISO() ? 'hoje' : 'em ' + dataBR(dia).slice(0, 5)) + ' às ' + hora;
}

// O robô da planilha roda todo dia entre 8h e 9h: busca os índices do Banco
// Central e recalcula os investimentos. Mostra quando ele rodou pela última vez
// e se faltam índices para as movimentações mais antigas.
export function statusRobo(E, C) {
  const db = E.db;
  const marcas = [...(db.indices || []).map((x) => Number(x.atualizadoEm) || 0), ...(db.investimentos || []).map((i) => Number(i.calculadoEm) || 0)];
  const ult = Math.max(0, ...marcas);
  const horas = ult ? (agoraSerial() - ult) * 24 : Infinity;
  const datas = (db.movsInv || []).map((m) => m.data).filter(Boolean).sort();
  const faltaDesde = datas.length && (!C.ind.dias.length || datas[0] < C.ind.dias[0]) ? datas[0] : '';
  const comoLigar = 'Na planilha: Extensões → Apps Script, escolha a função <strong>ligarAtualizacaoDiaria</strong> e clique em Executar (liga o robô todo dia entre 8h e 9h). Para atualizar agora, execute <strong>atualizarTudo</strong>.';
  let cls, titulo, txt;
  if (!ult) { cls = 'erro'; titulo = 'Robô nunca rodou'; txt = comoLigar; }
  else if (horas <= 30) { cls = 'ok'; titulo = 'Robô ativo'; txt = `Última atualização ${quando(ult)}.`; }
  else if (horas <= 72) { cls = 'aviso'; titulo = 'Robô atrasado'; txt = `Última atualização ${quando(ult)}. ${comoLigar}`; }
  else { cls = 'erro'; titulo = 'Robô parado'; txt = `Última atualização ${quando(ult)}. ${comoLigar}`; }
  const cor = { ok: 'var(--receita)', aviso: 'var(--aviso, #E8B44B)', erro: 'var(--despesa)' }[cls];
  const falta = faltaDesde ? `<div class="aviso-caixa" style="margin-top:10px">${ic('aviso', 18)}<span>Faltam os índices desde ${dataBR(faltaDesde)} (a movimentação mais antiga). Até o robô buscar, o rendimento antes de ${dataBR(C.ind.dias[0] || hojeISO())} não é contado e o valor fica abaixo do banco. O robô busca sozinho na próxima atualização; para buscar agora, execute <strong>atualizarTudo</strong> no Apps Script.</span></div>` : '';
  return `<div class="cartao" style="margin-top:12px;display:flex;gap:12px;align-items:flex-start"><span style="width:10px;height:10px;border-radius:50%;background:${cor};margin-top:6px;flex:none${cls === 'ok' ? ';box-shadow:0 0 0 4px color-mix(in srgb, ' + cor + ' 25%, transparent)' : ''}"></span><span style="flex:1"><span style="display:block;font-weight:800">${titulo}</span><span class="muted" style="font-size:13px">${txt}</span></span></div>${falta}`;
}

export function telaInvestimentos(E) {
  const A = apoio(E);
  const db = E.db;
  const C = calcInvest(E);
  const fam = A.fam;
  const ehFam = fam && E.perfil === fam.id;
  const todos = (db.investimentos || []).filter((i) => R.ativo(i));
  const meus = ehFam ? todos : todos.filter((i) => i.titular === E.perfil);
  const daFamilia = ehFam ? [] : todos.filter((i) => fam && i.titular === fam.id);
  const soma = (l, k) => arred(l.reduce((s, i) => s + (C.res[i.id] ? C.res[i.id][k] : 0), 0));
  const ref = C.ref;
  const indices = ref ? `<div class="kpis" style="margin-top:12px">
      <div class="kpi"><div class="r">CDI</div><div class="v">${pct(ref.cdiAno, 2)}</div><div class="s">ao ano</div></div>
      <div class="kpi"><div class="r">Selic</div><div class="v">${pct(ref.selicAno, 2)}</div><div class="s">ao ano</div></div>
      <div class="kpi"><div class="r">IPCA</div><div class="v">${pct(ref.ipca12, 2)}</div><div class="s">últimos ${ref.ipcaMeses} meses</div></div>
      <div class="kpi"><div class="r">Índices de</div><div class="v">${dataBR(ref.dia)}</div><div class="s">Banco Central, pelo robô da planilha</div></div>
    </div>` : `<div class="aviso-caixa" style="margin-top:12px">${ic('aviso', 18)}<span>A aba Índices está vazia. Na planilha, rode "Atualizar índices e investimentos" (ou espere o robô diário) para o app calcular os rendimentos.</span></div>`;
  const robo = statusRobo(E, C);
  const item = (inv) => {
    const r = C.res[inv.id] || { liquido: 0, rendimento: 0, aplicado: 0 };
    return `<button class="item" data-a="abrirInvest" data-id="${inv.id}"><span class="principal-txt"><span class="titulo">${esc(inv.nome)}</span><span class="sub">${esc(inv.tipo || '')} · ${esc(descTaxa(inv))}${inv.vencimento ? ' · vence ' + dataBR(inv.vencimento) : ''}</span></span>
      <span style="display:flex;flex-direction:column;align-items:flex-end;gap:2px"><span class="valor">${sens(brl(r.liquido))}</span><span class="rec" style="font-size:12.5px;font-weight:700">+ ${sens(brl(r.rendimento))}</span></span></button>`;
  };
  const porTitular = ehFam
    ? [...A.ps, fam].filter(Boolean).map((p) => [p, meus.filter((i) => i.titular === p.id)]).filter(([, l]) => l.length)
    : [[R.porId(db.pessoas, E.perfil), meus]];
  const listas = porTitular.map(([p, l]) => `<div class="secao-titulo"><span>${ehFam ? (p.tipo === 'Família' ? 'Da família' : (A.classe(p.id) === 'gio' ? 'Da ' : 'Do ') + esc(p.nome)) : 'Seus investimentos'}</span><span>${sens(brl(soma(l, 'liquido')))}</span></div><div class="lista">${l.length ? l.map(item).join('') : '<div class="vazio">Nenhum investimento ainda.</div>'}</div>`).join('');
  const famBloco = daFamilia.length ? `<div class="secao-titulo"><span>Da família (não entram no seu total)</span><span>${sens(brl(soma(daFamilia, 'liquido')))}</span></div><div class="lista">${daFamilia.map(item).join('')}</div>` : '';
  const encerrados = (db.investimentos || []).filter((i) => !R.ativo(i) && (ehFam || i.titular === E.perfil));
  const corpo = `<div class="cartao"><div class="muted" style="font-size:13px">${ehFam ? 'Total investido (líquido)' : 'Seu total investido (líquido)'}</div>
      <div class="resumo-grande">${sens(brl(soma(meus, 'liquido')))}</div>
      <div class="muted" style="font-size:13px;margin-top:2px">aplicado ${sens(brl(soma(meus, 'aplicado')))} · rendeu ${sens(brl(soma(meus, 'rendimento')))} · IR e IOF estimados ${sens(brl(soma(meus, 'ir') + soma(meus, 'iof')))}</div>
      <p class="muted" style="font-size:12px;margin-top:8px">Valor líquido = o que cairia na conta se resgatasse tudo hoje.</p></div>
    ${robo}${indices}
    <button class="btn btn-pri btn-largo" style="margin-top:12px" data-a="novoInvest">${ic('mais_', 18)}Novo investimento</button>
    <div class="grade"><div>${listas}</div>${famBloco ? `<div>${famBloco}</div>` : ''}</div>
    ${encerrados.length ? `<div class="secao-titulo"><span>Resgatados ou arquivados</span></div><div class="lista">${encerrados.map((i) => `<button class="item" style="opacity:.6" data-a="abrirInvest" data-id="${i.id}"><span class="principal-txt"><span class="titulo">${esc(i.nome)}</span><span class="sub">${esc(i.tipo || '')}</span></span></button>`).join('')}</div>` : ''}`;
  return casca(E, 'Investimentos', corpo, { voltar: 'mais' });
}

// ------------------------------------------------------------ modais
const veu = () => '<button class="veu" data-a="fecharModal" aria-label="Fechar"></button>';
const telaModal = (titulo, corpo, rodape = '', larga = false) => `${veu()}<div class="tela-cheia ${larga ? 'larga' : ''}" role="dialog" aria-label="${esc(titulo)}">
  <div style="display:flex;align-items:center;gap:4px;padding:calc(10px + env(safe-area-inset-top)) 12px 6px 16px"><h1 style="flex:1;font-size:18px;font-weight:800">${esc(titulo)}</h1><button class="icone-btn" data-a="fecharModal" aria-label="Fechar">${ic('fechar', 22)}</button></div>
  <div class="rolar" style="padding:0 16px 20px">${corpo}</div>${rodape ? `<div class="rodape-fixo">${rodape}</div>` : ''}</div>`;

export function modalInvest(E, A, m) {
  const db = E.db;
  const inv = R.porId(db.investimentos, m.id);
  if (!inv) return '';
  const C = calcInvest(E);
  const r = C.res[inv.id];
  const faixa = I.proximaFaixa(r.lotes, hojeISO());
  const linha = (a, b) => `<div style="display:flex;justify-content:space-between;gap:12px;padding:10px 0;border-top:1px solid var(--line);font-size:14px"><span class="muted">${a}</span><span style="text-align:right;font-weight:600">${b}</span></div>`;
  const isento = I.ehIsento(inv);
  const faixas = [[180, '22,5%'], [360, '20%'], [720, '17,5%'], [99999, '15%']];
  const atualIR = faixa ? faixa.atual : null;
  const tabelaIR = isento ? '<div class="pill ok" style="margin-top:8px">Isento de IR</div>' : `<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:10px">${faixas.map(([d, t], i) => `<div style="padding:8px;border-radius:10px;text-align:center;font-size:12px;${atualIR !== null && Math.abs(parseFloat(t.replace(',', '.')) - atualIR) < 0.01 ? 'background:var(--accent-soft);color:var(--accent-txt);font-weight:800' : 'background:var(--surf2);color:var(--muted)'}"><div>${t}</div><div>${i === 0 ? 'até 180 d' : i === 1 ? '181–360 d' : i === 2 ? '361–720 d' : 'mais de 720 d'}</div></div>`).join('')}</div>
    ${faixa && faixa.data ? `<p class="muted" style="font-size:12.5px;margin-top:8px">O aporte mais antigo cai para ${pct(faixa.proxima, faixa.proxima % 1 ? 1 : 0)} em ${dataBR(faixa.data)}.</p>` : ''}`;
  const movs = r.movs.map((x) => x.tipo === 'Ajuste'
    ? `<div class="item" style="padding:10px 0"><span class="principal-txt"><span class="titulo">Correção pelo banco</span><span class="sub">${dataBR(x.data)} · rendimento ${Number(x.valor) >= 0 ? 'a mais' : 'a menos'}${x.obs ? ' · ' + esc(x.obs) : ''}</span></span><span class="valor ${Number(x.valor) >= 0 ? 'rec' : ''}">${sens(brlSinal(Number(x.valor)))}</span><button class="icone-btn" data-a="excluirMov" data-id="${x.id}" aria-label="Excluir correção">${ic('lixo', 18)}</button></div>`
    : `<div class="item" style="padding:10px 0"><span class="principal-txt"><span class="titulo">${x.tipo === 'Aporte' ? 'Aporte' : 'Resgate'}</span><span class="sub">${dataBR(x.data)} · ${esc(A.nomeConta(x.conta) || '')}${x.tipo === 'Resgate' && x.liquido ? ' · caiu ' + brl(x.liquido) : ''}</span></span><span class="valor ${x.tipo === 'Aporte' ? '' : 'rec'}">${x.tipo === 'Aporte' ? '' : '− '}${sens(brl(x.valor))}</span><button class="icone-btn" data-a="editarMov" data-id="${x.id}" aria-label="Editar movimentação">${ic('lapis', 18)}</button><button class="icone-btn" data-a="excluirMov" data-id="${x.id}" aria-label="Excluir movimentação">${ic('lixo', 18)}</button></div>`).join('');
  // por depósito, como o banco mostra: valor atual, rendimento bruto e IR (inclusive o já pago em resgates)
  const deps = (r.depositos || []).filter((l) => l.original > 0);
  const porDeposito = deps.length > 1 || deps.some((l) => l.retirado > 0.005) ? `<h2 style="font-size:15px;font-weight:800;margin-top:18px">Por depósito</h2>
    <div style="overflow-x:auto"><table style="width:100%;font-size:13px;border-collapse:collapse;margin-top:6px;font-variant-numeric:tabular-nums"><thead><tr class="muted" style="text-align:right;font-size:12px"><th style="text-align:left;padding:6px 4px;font-weight:600">Depósito</th><th style="padding:6px 4px;font-weight:600">Atual</th><th style="padding:6px 4px;font-weight:600">Rendeu</th><th style="padding:6px 4px;font-weight:600">${isento ? 'IOF' : 'IR'}</th></tr></thead><tbody>
    ${deps.map((l) => `<tr style="border-top:1px solid var(--borda);text-align:right;white-space:nowrap"><td style="text-align:left;padding:8px 4px"><strong>${dataBR(l.dia).slice(0, 5)}</strong><div class="muted" style="font-size:11.5px">${sens(brl(l.original))}${l.retirado > 0.005 ? `<br>resgatou ${sens(brl(l.retirado + l.rendimento - (l.valor - l.principal)))}` : ''}</div></td><td style="padding:8px 4px">${sens(brl(l.valor))}</td><td style="padding:8px 4px" class="rec">${sens(brl(l.rendimento))}</td><td style="padding:8px 4px">${sens(brl(l.imposto))}</td></tr>`).join('')}
    </tbody></table></div><p class="muted" style="font-size:12px;margin-top:6px">Resgates saem ${{ novos: 'dos depósitos mais novos primeiro', antigos: 'dos depósitos mais antigos primeiro', proporcional: 'de todos os depósitos, na proporção' }[I.ordemDoResgate(inv.ordemResgate)]}. ${I.irDiario(inv) ? 'O IR é o que o banco já descontou dos rendimentos de cada dia.' : 'O IR inclui o que já foi retido nos resgates.'}</p>` : '';
  const irRetido = I.irDiario(inv) ? arred((r.depositos || []).reduce((t, l) => t + l.imposto, 0)) : 0;
  const robo = (inv.liquido !== '' && inv.liquido !== undefined && inv.calculadoEm ? `<p class="muted" style="font-size:12px;margin-top:6px">O robô da planilha calculou ${brl(inv.liquido)} líquido na última atualização.</p>` : '')
    + (inv.valorBanco !== '' && inv.valorBanco !== undefined && inv.valorBancoEm ? `<p class="muted" style="font-size:12px;margin-top:2px">No banco: ${brl(inv.valorBanco)} em ${dataBR(inv.valorBancoEm)} (informado por vocês).</p>` : '');
  const corpo = `<div class="pill ${A.classe(inv.titular)}">${esc(A.nome(inv.titular))}</div>
    <div class="muted" style="font-size:13px;margin-top:10px">Valor líquido hoje</div>
    <div class="resumo-grande">${sens(brl(r.liquido))}</div>
    <div class="muted" style="font-size:13px">${esc(inv.tipo || '')} · ${esc(descTaxa(inv))}</div>${robo}
    <div class="cartao" style="margin-top:14px;background:var(--bg)">
      ${linha('Valor bruto', sens(brl(r.bruto)))}${linha('Aplicado', sens(brl(r.aplicado)))}${linha(I.irDiario(inv) && !isento ? 'Rendimento (já sem IR)' : 'Rendimento bruto', '<span class="rec">+ ' + sens(brl(r.rendimento)) + '</span>')}
      ${linha('IOF', r.iof ? '− ' + sens(brl(r.iof)) : 'nenhum (mais de 30 dias)')}${linha(I.irDiario(inv) && !isento ? 'IR' : 'IR estimado', isento ? 'isento' : I.irDiario(inv) ? 'já descontado todo dia' + (irRetido ? ' (' + sens(brl(irRetido)) + ')' : '') : '− ' + sens(brl(r.ir)))}${linha('<strong>Líquido</strong>', '<strong>' + sens(brl(r.liquido)) + '</strong>')}
    </div>
    <button class="btn btn-borda btn-largo" style="margin-top:10px" data-a="ajusteInv" data-id="${inv.id}">${ic('lapis', 18)}O banco mostra outro valor? Corrigir</button>
    ${r.estimados && r.estimados.length && r.bruto >= 0.01 ? `<p class="muted" style="font-size:12px;margin-top:8px">Inclui ${r.estimados.length === 1 ? 'o rendimento de ' + dataBR(r.estimados[0]).slice(0, 5) : r.estimados.length + ' dias'} estimado com o último CDI (o Banco Central ainda não publicou). Quando o robô buscar, o valor é trocado pelo real.</p>` : ''}
    ${porDeposito}
    <h2 style="font-size:15px;font-weight:800;margin-top:18px">Imposto de renda</h2>${tabelaIR}
    <h2 style="font-size:15px;font-weight:800;margin-top:18px">Dados</h2>
    <div>${linha('Emissor', esc(inv.emissor || '—'))}${linha('Aplicado em', inv.dataAplic ? dataBR(inv.dataAplic) : '—')}${linha('Vencimento', inv.vencimento ? dataBR(inv.vencimento) : '—')}${linha('Liquidez', esc(inv.liquidez || '—'))}${linha('Resgate sai de', esc(inv.ordemResgate || 'Depósitos mais novos'))}${linha('IR cobrado', esc(inv.irModo || 'No resgate'))}${linha('Garantia', ['CDB', 'LCI', 'LCA', 'Poupança'].includes(inv.tipo) ? 'FGC até R$ 250 mil por instituição' : inv.tipo && inv.tipo.startsWith('Tesouro') ? 'Tesouro Nacional' : '—')}</div>
    <h2 style="font-size:15px;font-weight:800;margin-top:18px">Movimentações</h2>
    <div>${movs || '<div class="vazio">Nenhuma movimentação.</div>'}</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:16px"><button class="btn btn-borda" data-a="editarInvest" data-id="${inv.id}">${ic('lapis', 18)}Editar</button><button class="btn btn-borda" data-a="arquivarInvest" data-id="${inv.id}">${inv.status === 'Arquivado' ? 'Reativar' : 'Arquivar'}</button></div>`;
  const rodape = `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;width:100%"><button class="btn btn-sec" data-a="novoMov" data-v="Aporte">${ic('mais_', 18)}Aportar</button><button class="btn btn-pri" data-a="novoMov" data-v="Resgate" ${r.bruto > 0 ? '' : 'aria-disabled="true"'}>Resgatar</button></div>`;
  return telaModal(inv.nome, corpo, rodape, true);
}

const TIPOS_INV = ['CDB', 'LCI', 'LCA', 'Tesouro Selic', 'Tesouro IPCA+', 'Tesouro Prefixado', 'Poupança', 'Outro'];
export const indexadorFixo = (tipo) => ({ 'Tesouro Selic': 'Selic', 'Tesouro IPCA+': 'IPCA', 'Tesouro Prefixado': 'Prefixado', Poupança: 'Selic' }[tipo] || null);

export function modalInvestForm(E, A, m) {
  const f = m.form;
  const db = E.db;
  const C = calcInvest(E);
  const fixo = indexadorFixo(f.tipo);
  const contas = db.contas.filter(R.ativo);
  const donos = [...A.ps, A.fam].filter(Boolean);
  const valor = lerValor(f.valor);
  const sim = !m.editando && valor ? I.simularAno({ indexador: f.indexador, taxa: lerValor(f.taxa), tipo: f.tipo, isento: f.isento }, valor, C.ind) : null;
  const rotTaxa = { CDI: '% do CDI', Selic: 'Selic + % ao ano', IPCA: 'IPCA + % ao ano', Prefixado: '% ao ano' }[f.indexador];
  const corpo = `
    <label class="campo"><span>Nome</span><input class="entrada" data-campo="nome" value="${esc(f.nome)}" placeholder="Ex.: CDB Banco X 110% CDI 2028"></label>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      <label class="campo"><span>Tipo</span><select class="entrada" data-campo="tipo">${TIPOS_INV.map((x) => `<option ${f.tipo === x ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
      <label class="campo"><span>Emissor</span><input class="entrada" data-campo="emissor" value="${esc(f.emissor || '')}" placeholder="Banco ou Tesouro"></label>
    </div>
    <div class="campo"><span>De quem é</span><div class="donos" style="grid-template-columns:repeat(${donos.length},1fr)">${donos.map((p) => `<button role="radio" class="${A.classe(p.id)}" aria-checked="${f.titular === p.id}" data-a="investTitular" data-id="${p.id}">${esc(p.nome)}</button>`).join('')}</div></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      <label class="campo"><span>Rende por</span><select class="entrada" data-campo="indexador" ${fixo ? 'disabled' : ''}>${['CDI', 'Selic', 'IPCA', 'Prefixado'].map((x) => `<option ${f.indexador === x ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
      <label class="campo"><span>Taxa (${rotTaxa})</span><input class="entrada" inputmode="decimal" data-campo="taxa" value="${esc(f.taxa)}" placeholder="${f.indexador === 'CDI' ? '110' : '6,5'}"></label>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      <label class="campo"><span>Aplicado em</span><input type="date" class="entrada" data-campo="dataAplic" value="${esc(f.dataAplic)}"></label>
      <label class="campo"><span>Vencimento</span><input type="date" class="entrada" data-campo="vencimento" value="${esc(f.vencimento || '')}"></label>
    </div>
    <label class="campo"><span>Liquidez</span><select class="entrada" data-campo="liquidez">${['Diária', 'No vencimento', 'Após carência'].map((x) => `<option ${f.liquidez === x ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
    ${E.banco.temCampo('investimentos', 'ordemResgate') ? `<label class="campo"><span>Resgate sai de</span><select class="entrada" data-campo="ordemResgate">${I.ORDENS_RESGATE.map((x) => `<option ${(f.ordemResgate || I.ORDENS_RESGATE[0]) === x ? 'selected' : ''}>${x}</option>`).join('')}</select><span class="muted" style="font-size:12px;margin-top:4px;display:block">Como o banco escolhe de quais depósitos tirar um resgate. Nubank: mais novos primeiro.</span></label>` : ''}
    ${E.banco.temCampo('investimentos', 'irModo') ? `<label class="campo"><span>IR cobrado</span><select class="entrada" data-campo="irModo">${I.IR_MODOS.map((x) => `<option ${(f.irModo || I.IR_MODOS[0]) === x ? 'selected' : ''}>${x}</option>`).join('')}</select><span class="muted" style="font-size:12px;margin-top:4px;display:block">"No rendimento diário": o banco mostra o rendimento de cada dia já sem IR e o resgate cai inteiro na conta (ex.: Mercado Pago). Nubank: no resgate.</span></label>` : ''}
    <div class="campo" style="display:flex;align-items:center;gap:10px"><span style="flex:1;margin:0;color:var(--text);font-size:15px">Isento de IR ${['LCI', 'LCA', 'Poupança'].includes(f.tipo) ? '<span class="muted" style="font-size:12.5px">(automático para ' + esc(f.tipo) + ')</span>' : ''}</span><button class="chip" aria-pressed="${f.isento === 'Sim'}" data-a="investIsento" ${['LCI', 'LCA', 'Poupança'].includes(f.tipo) ? 'aria-disabled="true"' : ''}>${f.isento === 'Sim' ? 'Sim' : 'Não'}</button></div>
    ${m.editando ? '<p class="muted" style="font-size:12.5px;margin-top:12px">Para colocar ou tirar dinheiro, use Aportar ou Resgatar no detalhe do investimento.</p>' : `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      <label class="campo"><span>Valor aplicado (R$)</span><input class="entrada" inputmode="numeric" data-mascara="dinheiro" data-campo="valor" value="${esc(f.valor)}" placeholder="0,00"></label>
      <label class="campo"><span>Saiu da conta</span><select class="entrada" data-campo="conta"><option value="">— nenhuma —</option>${contas.map((c) => `<option value="${c.id}" ${f.conta === c.id ? 'selected' : ''}>${esc(A.nomeConta(c.id))} (${esc(A.nome(c.dono))})</option>`).join('')}</select></label>
    </div>
    ${valor ? blocoAcertoMov(E, A, { titular: f.titular }, { ...f, tipo: 'Aporte', data: f.dataAplic }, valor) : ''}
    ${sim ? `<div class="cartao" style="margin-top:14px;background:var(--bg)"><h2 style="font-size:14px;font-weight:800">Em 1 ano, com os índices de hoje</h2>
      <div style="display:flex;justify-content:space-between;margin-top:8px;font-size:14px"><span class="muted">Rende ao ano (bruto)</span><strong>${pct(sim.anual, 2)}</strong></div>
      <div style="display:flex;justify-content:space-between;margin-top:6px;font-size:14px"><span class="muted">Valor bruto</span><strong>${brl(sim.bruto)}</strong></div>
      <div style="display:flex;justify-content:space-between;margin-top:6px;font-size:14px"><span class="muted">IR</span><strong>${sim.ir ? '− ' + brl(sim.ir) : 'isento'}</strong></div>
      <div style="display:flex;justify-content:space-between;margin-top:6px;font-size:14px"><span class="muted">Líquido</span><strong class="rec">${brl(sim.liquido)}</strong></div>
      ${I.ehIsento({ tipo: f.tipo, isento: f.isento }) || f.tipo.startsWith('Tesouro') ? `<p class="muted" style="font-size:12.5px;margin-top:8px">Um CDB precisaria render ${pct(sim.cdbEquivalente, 0)} do CDI para dar o mesmo líquido.</p>` : ''}
    </div>` : ''}`}`;
  const rodape = `<button class="btn btn-pri" style="min-width:220px" data-a="salvarInvest" ${E.salvando ? 'aria-disabled="true"' : ''}>${E.salvando ? 'Salvando…' : m.editando ? 'Salvar alterações' : 'Salvar investimento'}</button>`;
  return telaModal(m.editando ? 'Editar investimento' : 'Novo investimento', corpo, rodape);
}

// Aporte/resgate entre a conta de um e o investimento de outro (ou da Família)
function blocoAcertoMov(E, A, inv, f, valor) {
  const c = R.porId(E.db.contas, f.conta);
  if (!c || !inv.titular || c.dono === inv.titular) return '';
  if (!R.envolveFamilia(E.db, c.dono, inv.titular)) {
    const txt = !f.foraAcerto ? `A conta é de ${esc(A.nome(c.dono))} e o investimento de ${esc(A.nome(inv.titular))}: entra no acerto do mês.` : 'Presente ou dinheiro dado: não mexe no acerto.';
    return `<div class="cartao" style="margin-top:14px;background:var(--bg);display:flex;gap:12px;align-items:center"><span style="flex:1"><span style="display:block;font-size:15px;font-weight:600">Entra no acerto</span><span class="muted" style="font-size:12.5px">${txt}</span></span><button class="chip" role="switch" aria-checked="${!f.foraAcerto}" data-a="movForaAcerto" aria-label="Entra no acerto">${!f.foraAcerto ? 'Sim' : 'Não'}</button></div>`;
  }
  const pessoa = A.fam && c.dono === A.fam.id ? inv.titular : c.dono;
  const outro = A.ps.find((p) => p.id !== pessoa);
  const ff = R.fracoesFamilia(E.db, (f.data || '').slice(0, 7));
  const parte = valor && outro ? ' <strong>' + brl(valor * (ff[outro.id] || 0)) + '</strong>' : '';
  const dl = (id) => (A.classe(id) === 'gio' ? 'dela' : 'dele');
  const so = A.classe(pessoa) === 'gio' ? 'sozinha' : 'sozinho';
  const paraFamilia = (f.tipo === 'Aporte') === (inv.titular === (A.fam || {}).id);
  const txt = !f.foraAcerto
    ? (paraFamilia ? `O dinheiro passa a ser dos dois: ${esc(A.nome(outro && outro.id))} fica devendo a ${esc(A.nome(pessoa))} a parte ${dl(outro && outro.id)}` : `${esc(A.nome(pessoa))} tirou dinheiro dos dois: fica devendo a ${esc(A.nome(outro && outro.id))} a parte ${dl(outro && outro.id)}`) + parte + '.'
    : (paraFamilia ? `Reserva que ${esc(A.nome(pessoa))} guarda ${so} para a família: não mexe no acerto.` : `${esc(A.nome(pessoa))} pegou de volta dinheiro que tinha guardado ${so}: não mexe no acerto.`);
  const aviso = E.banco.temCampo('movsInv', 'foraAcerto') ? '' : '<div class="aviso-caixa" style="margin-top:8px">Rode o script da planilha versão 1.11 para poder deixar fora do acerto. Por enquanto divide.</div>';
  return `<div class="cartao" style="margin-top:14px;background:var(--bg);display:flex;gap:12px;align-items:center"><span style="flex:1"><span style="display:block;font-size:15px;font-weight:600">Dividir no acerto</span><span class="muted" style="font-size:12.5px">${txt}</span></span><button class="chip" role="switch" aria-checked="${!f.foraAcerto}" data-a="movForaAcerto" aria-label="Dividir no acerto">${!f.foraAcerto ? 'Sim' : 'Não'}</button></div>${aviso}`;
}

// Corrigir o rendimento pelo valor que o banco mostra hoje
export function modalAjusteInv(E, A, m) {
  const f = m.form;
  const inv = R.porId(E.db.investimentos, f.investimento);
  const C = calcInvest(E);
  const r = C.res[inv.id];
  const base = f.base || 'liquido';
  const alvo = lerValor(f.valor);
  const hoje = hojeISO();
  const movs = (E.db.movsInv || []).filter((x) => x.investimento === inv.id);
  const ajuste = alvo > 0 ? I.ajusteParaBater(inv, movs, C.ind, hoje, alvo, base) : 0;
  const temCol = E.banco.temCampo('investimentos', 'valorBanco');
  const datas = movs.map((x) => x.data).filter(Boolean).sort();
  const faltaIdx = datas.length && (!C.ind.dias.length || datas[0] < C.ind.dias[0]);
  const sinal = (v) => (v >= 0 ? '+ ' + brl(v) : brlSinal(v));
  const prev = alvo > 0 ? `<div class="cartao" style="margin-top:14px;background:var(--bg);font-size:14px">
      <div style="display:flex;justify-content:space-between"><span class="muted">No app hoje (${base === 'liquido' ? 'líquido' : 'bruto'})</span><strong>${brl(r[base])}</strong></div>
      <div style="display:flex;justify-content:space-between;margin-top:6px"><span class="muted">No banco</span><strong>${brl(alvo)}</strong></div>
      <div style="display:flex;justify-content:space-between;margin-top:6px"><span class="muted">Correção de rendimento (bruto)</span><strong class="${ajuste >= 0 ? 'rec' : 'desp'}">${sinal(ajuste)}</strong></div>
      <p class="muted" style="font-size:12.5px;margin-top:8px">${Math.abs(ajuste) < 0.01 ? 'Já está igual ao banco.' : `O app lança uma correção de ${sinal(ajuste)} no rendimento com data de hoje. O valor aplicado não muda; o IR e o IOF são recalculados. A partir de amanhã o app volta a render pelos índices, já com a correção.`}</p></div>` : '';
  const corpo = `<p class="muted" style="margin:8px 4px 0;font-size:13.5px">${esc(inv.nome)} · no app hoje: líquido ${brl(r.liquido)} · bruto ${brl(r.bruto)}</p>
    ${temCol ? '' : '<div class="aviso-caixa" style="margin-top:10px">Rode o script da planilha versão 1.13 para poder corrigir pelo banco (o robô precisa saber tratar a correção).</div>'}
    ${faltaIdx ? `<div class="aviso-caixa" style="margin-top:10px">Ainda faltam os índices desde ${dataBR(datas[0])}. Espere o robô buscá-los (ou execute atualizarTudo no Apps Script) antes de corrigir: senão a correção cobre a falta dos índices e, quando eles chegarem, o valor passa do banco.</div>` : ''}
    <div class="campo"><span>O valor do banco é</span><div class="chips"><button class="chip" aria-pressed="${base === 'liquido'}" data-a="ajusteBase" data-v="liquido">Líquido (já sem IR)</button><button class="chip" aria-pressed="${base === 'bruto'}" data-a="ajusteBase" data-v="bruto">Bruto</button></div></div>
    <label class="campo"><span>Quanto o banco mostra hoje (R$)</span><input class="entrada" inputmode="numeric" data-mascara="dinheiro" data-campo="valor" value="${esc(f.valor)}" placeholder="0,00"></label>
    ${prev}
    <button class="btn btn-pri btn-largo" style="margin-top:18px" data-a="salvarAjusteInv" ${E.salvando || !temCol || faltaIdx ? 'aria-disabled="true"' : ''}>${E.salvando ? 'Salvando…' : 'Corrigir'}</button>`;
  return `<button class="veu" data-a="fecharModal" aria-label="Fechar"></button><div class="folha" role="dialog" aria-label="Corrigir pelo banco"><div class="alca"></div><h2>Corrigir pelo banco</h2>${corpo}</div>`;
}

export function modalMov(E, A, m) {
  const f = m.form;
  const inv = R.porId(E.db.investimentos, f.investimento);
  const C = calcInvest(E);
  const r = C.res[inv.id];
  const contas = E.db.contas.filter(R.ativo);
  const valor = lerValor(f.valor);
  const ed = m.editando ? R.porId(E.db.movsInv || [], m.editando) : null;
  let est = '';
  if (f.tipo === 'Resgate' && valor > 0 && f.data && (r.liquido > 0 || ed)) {
    // pela posição do dia do resgate (sem este, se estiver editando), como é gravado
    const outros = (E.db.movsInv || []).filter((x) => x.investimento === inv.id && (!ed || x.id !== ed.id));
    const res = I.brutoDoResgate(inv, outros, C.ind, f.data, valor);
    est = `<div class="cartao" style="margin-top:14px;background:var(--bg);font-size:14px">
      <div style="display:flex;justify-content:space-between"><span class="muted">Sai do investimento (bruto)</span><strong>${brl(res.bruto)}</strong></div>
      <div style="display:flex;justify-content:space-between;margin-top:6px"><span class="muted">IR + IOF desta parte</span><strong>− ${brl(Math.max(0, res.bruto - valor))}</strong></div>
      <div style="display:flex;justify-content:space-between;margin-top:6px"><span class="muted">Cai na conta</span><strong class="rec">${brl(valor)}</strong></div>
      ${res.total ? '<p class="muted" style="font-size:12.5px;margin-top:8px">Resgate total: o investimento fica zerado.</p>' : ''}</div>`;
  }
  const corpo = `<p class="muted" style="margin:8px 4px 0;font-size:13.5px">${esc(inv.nome)} · líquido hoje ${brl(r.liquido)}</p>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      <label class="campo"><span>${f.tipo === 'Resgate' ? 'Valor que cai na conta (R$)' : 'Valor do aporte (R$)'}</span><input class="entrada" inputmode="numeric" data-mascara="dinheiro" data-campo="valor" value="${esc(f.valor)}" placeholder="0,00"></label>
      <label class="campo"><span>Data</span><input type="date" class="entrada" data-campo="data" value="${esc(f.data)}"></label>
    </div>
    ${f.tipo === 'Resgate' && !ed ? `<button class="link" style="margin-top:8px" data-a="resgateTotal">Resgatar tudo (${brl(r.liquido)})</button>` : ''}
    <label class="campo"><span>${f.tipo === 'Resgate' ? 'Cai na conta' : 'Sai da conta'}</span><select class="entrada" data-campo="conta"><option value="">— nenhuma —</option>${contas.map((c) => `<option value="${c.id}" ${f.conta === c.id ? 'selected' : ''}>${esc(A.nomeConta(c.id))} (${esc(A.nome(c.dono))})</option>`).join('')}</select></label>
    ${est}${blocoAcertoMov(E, A, inv, f, valor)}
    <button class="btn btn-pri btn-largo" style="margin-top:18px" data-a="salvarMov" ${E.salvando ? 'aria-disabled="true"' : ''}>${E.salvando ? 'Salvando…' : ed ? 'Salvar alteração' : f.tipo === 'Resgate' ? 'Registrar resgate' : 'Registrar aporte'}</button>
    ${ed ? `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px">
      ${m.voltarInv ? '<span></span>' : `<button class="btn btn-borda" data-a="verInvest" data-id="${inv.id}">Ver investimento</button>`}
      <button class="btn btn-perigo" data-a="excluirMovEditando">${ic('lixo', 18)}Excluir</button></div>
      <p class="muted" style="font-size:12.5px;margin-top:10px">${f.tipo === 'Resgate' ? 'Digite o valor que caiu na conta: o app recalcula o bruto e o IR pela posição do dia.' : 'Mudar o aporte muda a posição do investimento.'} Os resgates depois deste são recalculados junto.</p>` : ''}`;
  return `<button class="veu" data-a="fecharModal" aria-label="Fechar"></button><div class="folha" role="dialog" aria-label="${f.tipo}"><div class="alca"></div><h2>${ed ? (f.tipo === 'Resgate' ? 'Editar resgate' : 'Editar aporte') : f.tipo === 'Resgate' ? 'Resgatar' : 'Novo aporte'}</h2>${corpo}</div>`;
}

export { valorTxt };

// ---------------------------------------------------------- planejamento
const corPct = (p) => (p >= 1 ? 'var(--despesa)' : p >= 0.8 ? 'var(--aviso)' : 'var(--accent)');
const nomeCat = (db, id) => { const c = R.porId(db.categorias, id); return c ? c.nome : 'Categoria'; };

export function telaPlanejamento(E) {
  const A = apoio(E);
  const db = E.db, mes = E.mes, p = E.perfil, fam = A.fam;
  const ehFam = fam && p === fam.id;
  const nomeM = nomeMesAno(mes).split(' ')[0].toLowerCase();
  const res = R.resumoDoMes(db, p, mes);
  const pl = R.planejadoDoMes(db, p, mes, res.metas);
  const temPlano = pl.renda || pl.gastos;
  const dif = arred(res.sobraPrev - pl.sobra);

  const hero = `<div class="cartao">
      <div class="muted" style="font-size:13px">Sobra prevista em ${esc(nomeM)}</div>
      <div style="font-size:30px;font-weight:800;letter-spacing:-0.5px;margin-top:2px;color:${res.sobraPrev < 0 ? 'var(--despesa)' : 'var(--text)'}">${sens(brlSinal(res.sobraPrev))}</div>
      <div class="muted" style="font-size:13px;margin-top:4px">${temPlano ? `Planejada ${sens(brlSinal(pl.sobra))} · ${Math.abs(dif) < 0.01 ? 'igual ao planejado' : sens(brl(Math.abs(dif))) + (dif > 0 ? ' acima' : ' abaixo') + ' do planejado'}` : 'Crie metas e contas fixas para ter um planejado do mês.'}</div>
    </div>`;

  const cel = (v, forte, cor) => `<span style="text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums;font-weight:${forte ? 800 : 600};${cor ? 'color:' + cor : ''}">${sens(brlSinal(v).replace(/R\$\s?/, ''))}</span>`;
  const lin = (n, nota, a, b, c, forte) => `<div class="ag4" style="display:grid;grid-template-columns:minmax(0,1.3fr) repeat(3,minmax(0,1fr));gap:8px;padding:10px 0;border-top:1px solid var(--line);align-items:center;font-size:13.5px"><span><span style="display:block;font-weight:${forte ? 800 : 600}">${n}</span>${nota ? `<span class="muted" style="font-size:11.5px">${nota}</span>` : ''}</span>${a}${b}${c}</div>`;
  const tabela = `<div class="cartao">
      <h2 style="font-size:15px;font-weight:800">Planejado × previsto × real <span class="muted" style="font-size:12px;font-weight:600">(R$)</span></h2>
      <div style="display:grid;grid-template-columns:minmax(0,1.3fr) repeat(3,minmax(0,1fr));gap:8px;margin-top:10px;font-size:11.5px;color:var(--muted);font-weight:700;text-align:right"><span></span><span>Planejado</span><span>Previsto</span><span>Real</span></div>
      ${lin('Entradas', 'fixas de renda', cel(pl.renda), cel(res.entradasPrev), cel(res.entradas, false, 'var(--receita)'))}
      ${lin('Gastos', 'metas + fixas', cel(-pl.gastos), cel(-res.gastosPrev), cel(-res.gastos))}
      ${lin('Sobra', '', cel(pl.sobra, true), cel(res.sobraPrev, true, res.sobraPrev < 0 ? 'var(--despesa)' : ''), cel(res.sobraReal, true), true)}
      <p class="muted" style="font-size:12px;margin-top:10px">Previsto = o que já foi lançado + contas fixas que ainda vão entrar ou sair + o que as metas ainda reservam. Real = só o que já foi lançado.</p>
    </div>`;

  // barra do mês: real, previstos, reservado nas metas e a marca do planejado
  const escala = Math.max(res.gastosPrev, pl.gastos, 1);
  const w = (v) => Math.max(0, Math.min(100, (v / escala) * 100)).toFixed(2) + '%';
  const hoje = hojeISO();
  const [a, mm] = mes.split('-').map(Number);
  const diasMes = new Date(Date.UTC(a, mm, 0)).getUTCDate();
  const diaHoje = mesDe(hoje) === mes ? Number(hoje.slice(8, 10)) : mes < mesDe(hoje) ? diasMes : 0;
  const barra = `<div class="cartao">
      <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px"><h2 style="font-size:15px;font-weight:800">Gastos do mês</h2><span class="muted" style="font-size:12.5px">${diaHoje && diaHoje < diasMes ? 'dia ' + diaHoje + ' de ' + diasMes : diaHoje ? 'mês encerrado' : 'mês ainda não começou'}</span></div>
      <div style="position:relative;margin-top:14px">
        <div style="display:flex;height:16px;border-radius:8px;overflow:hidden;background:var(--surf2)">
          <span style="width:${w(res.gastos)};background:var(--accent)"></span>
          <span style="width:${w(res.previstos)};background:repeating-linear-gradient(45deg,var(--aviso) 0 4px,transparent 4px 8px)"></span>
          <span style="width:${w(res.reserva)};background:var(--soft);opacity:.45"></span>
        </div>
        ${pl.gastos ? `<span title="Planejado" style="position:absolute;top:-4px;bottom:-4px;left:${w(pl.gastos)};width:2px;background:var(--text)"></span>` : ''}
        ${diaHoje && diaHoje < diasMes ? `<span title="Hoje" style="position:absolute;top:20px;left:${((diaHoje / diasMes) * 100).toFixed(1)}%;transform:translateX(-50%);font-size:10px;color:var(--muted)">▲ hoje</span>` : ''}
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:6px 14px;margin-top:${diaHoje && diaHoje < diasMes ? 24 : 12}px;font-size:12.5px">
        <span><span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:var(--accent);margin-right:5px"></span>Lançado ${sens(brl(res.gastos))}</span>
        <span><span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:repeating-linear-gradient(45deg,var(--aviso) 0 3px,transparent 3px 6px);margin-right:5px"></span>Contas fixas e futuros ${sens(brl(res.previstos))}</span>
        <span><span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:var(--soft);opacity:.45;margin-right:5px"></span>Reservado nas metas ${sens(brl(res.reserva))}</span>
        ${pl.gastos ? `<span><span style="display:inline-block;width:2px;height:10px;background:var(--text);margin-right:6px"></span>Planejado ${sens(brl(pl.gastos))}</span>` : ''}
      </div>
    </div>`;

  // metas do perfil: perfil Família vê as da Família; a pessoa vê as dela e as da Família
  const lista = res.metas.filter((x) => R.pesoNoPerfil(db, x.dono, p, mes) > 0)
    .sort((x, y) => (x.dono === p ? 0 : 1) - (y.dono === p ? 0 : 1) || nomeCat(db, x.meta.categoria).localeCompare(nomeCat(db, y.meta.categoria)));
  const ordem = [];
  lista.filter((x) => x.grupo || !lista.some((g) => g.grupo && g.dono === x.dono && g.meta.categoria === (R.porId(db.categorias, x.meta.categoria) || {}).grupo)).forEach((x) => {
    ordem.push([x, false]);
    if (x.grupo) lista.filter((y) => !y.grupo && y.dono === x.dono && (R.porId(db.categorias, y.meta.categoria) || {}).grupo === x.meta.categoria).forEach((y) => ordem.push([y, true]));
  });
  const itemMeta = ([x, sub]) => {
    const passou = arred(x.usado - x.valor);
    const peso = R.pesoNoPerfil(db, x.dono, p, mes);
    return `<button class="item" data-a="editarMeta" data-id="${x.meta.id}" style="flex-direction:column;align-items:stretch;gap:8px;${sub ? 'padding-left:28px' : ''}">
      <span style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;text-align:left"><span class="titulo" style="flex:1;min-width:120px">${sub ? '↳ ' : ''}${esc(nomeCat(db, x.meta.categoria))}${x.grupo ? ' <span class="muted" style="font-weight:600;font-size:12px">grupo</span>' : ''}</span>
        ${!ehFam ? `<span class="pill ${A.classe(x.dono)}">${esc(A.nome(x.dono))}</span>` : ''}${x.meta.mes !== 'Todo mês' ? '<span class="pill neutra">só este mês</span>' : ''}</span>
      <span style="display:flex;height:8px;border-radius:4px;overflow:hidden;background:var(--surf2)"><span style="width:${Math.min(100, x.pctReal * 100).toFixed(1)}%;background:${corPct(x.pct)}"></span><span style="width:${Math.max(0, Math.min(100, x.pct * 100) - Math.min(100, x.pctReal * 100)).toFixed(1)}%;background:repeating-linear-gradient(45deg,${corPct(x.pct)} 0 3px,transparent 3px 6px)"></span></span>
      <span style="display:flex;justify-content:space-between;gap:10px;align-items:baseline"><span class="muted" style="font-size:12.5px;text-align:left">${x.previsto ? sens(brl(x.real)) + ' lançados + ' + sens(brl(x.previsto)) + ' previstos · ' : ''}${passou > 0.005 ? `<strong style="color:var(--despesa)">passou ${sens(brl(passou))}</strong>` : `faltam ${sens(brl(arred(x.valor - x.usado)))}`}${peso < 1 && peso > 0 ? ' · sua parte ' + Math.round(peso * 100) + '%' : ''}</span>
        <span style="font-weight:800;font-size:14px;white-space:nowrap">${sens(brl(x.usado))} <span class="muted" style="font-weight:600">/ ${sens(brl(x.valor))}</span></span></span>
    </button>`;
  };
  const metas = `<div class="secao-titulo"><span>Metas de ${esc(nomeM)}</span><button class="link" data-a="novaMeta">${ic('mais_', 15, 'style="vertical-align:-2px"')} Nova meta</button></div>
    <div class="lista">${ordem.length ? ordem.map(itemMeta).join('') : `<div class="vazio">Nenhuma meta em ${esc(nomeM)}. <button class="link" data-a="novaMeta">Criar meta</button></div>`}</div>
    <p class="muted" style="font-size:12.5px;margin:8px 4px 0">A meta entra nos gastos previstos pelo que ainda falta. Cada lançamento ou conta fixa prevista na categoria toma o lugar dela, sem contar duas vezes. Meta de subcategoria fica dentro da meta do grupo.</p>`;

  // contas fixas do mês
  const prev = R.previstosDoMes(db, mes).filter((x) => !x.ehRenda && x.tipo !== R.TIPO.receita && R.pesoNoPerfil(db, x.dono, p, mes) > 0);
  const totPrev = arred(prev.reduce((s, x) => s + x.valor * R.pesoNoPerfil(db, x.dono, p, mes), 0));
  const fixas = `<div class="secao-titulo"><span>Contas fixas</span><a href="#/fixas">Ver todas</a></div>
    <div class="lista">${prev.length ? prev.slice(0, 6).map((x) => `<div class="item"><span class="principal-txt"><span class="titulo">${esc(x.desc)}</span><span class="sub">${dataCurta(x.data)} · ${esc(nomeCat(db, x.categoria))}</span></span><span class="valor">${sens(brl(x.valor))}</span></div>`).join('') + (prev.length > 6 ? `<a class="item" href="#/fixas"><span class="principal-txt"><span class="sub">e mais ${prev.length - 6}</span></span>${ic('seta', 16)}</a>` : '') : `<div class="vazio">Nenhuma conta fixa falta lançar em ${esc(nomeM)}.</div>`}</div>
    ${prev.length ? `<p class="muted" style="font-size:12.5px;margin:8px 4px 0">Faltam lançar ${prev.length} · ${sens(brl(totPrev))}${!ehFam ? ' (sua parte)' : ''}</p>` : ''}`;

  const corpo = `<div class="grade"><div>${hero}<div style="margin-top:12px">${barra}</div><div style="margin-top:12px">${tabela}</div></div><div>${metas}${fixas}</div></div>`;
  return casca(E, 'Planejamento', corpo, { acoes: seletorMes(E) });
}

export function modalMeta(E, A, m) {
  const db = E.db, f = m.form, mes = E.mes;
  const nomeM = nomeMesAno(mes).split(' ')[0].toLowerCase();
  const fam = A.fam;
  const donos = [...(fam ? [fam] : []), ...A.ps];
  const meta = m.editando ? R.porId(db.metas || [], m.editando) : null;
  const despesas = R.porOrdem(db, db.categorias.filter((c) => c.tipo !== 'Receita' && R.ativo(c)));
  const grupos = despesas.filter((c) => !c.grupo);
  const opcoes = grupos.map((g) => `<optgroup label="${esc(g.nome)}"><option value="${g.id}" ${f.categoria === g.id ? 'selected' : ''}>${esc(g.nome)} — grupo inteiro</option>${despesas.filter((c) => c.grupo === g.id).map((c) => `<option value="${c.id}" ${f.categoria === c.id ? 'selected' : ''}>${esc(c.nome)}</option>`).join('')}</optgroup>`).join('');
  let info = '';
  if (f.categoria && f.dono) {
    const media = R.mediaGasto(db, f.categoria, f.dono, mes);
    const u = R.usoCategorias(db, R.escopoMeta(db, f.categoria), f.dono, mes);
    info = `<div class="cartao" style="margin-top:12px;background:var(--bg);font-size:13.5px">
      <div style="display:flex;justify-content:space-between;gap:8px"><span class="muted">Média dos 3 meses anteriores</span><span><strong>${brl(media)}</strong>${media > 0 ? ` <button class="link" data-a="metaUsarMedia" data-v="${media}">usar</button>` : ''}</span></div>
      <div style="display:flex;justify-content:space-between;gap:8px;margin-top:6px"><span class="muted">Em ${esc(nomeM)} até agora</span><strong>${brl(u.real)}${u.previsto ? ' + ' + brl(u.previsto) + ' previstos' : ''}</strong></div></div>`;
  }
  const fixo = !!meta; // editando: categoria e dono ficam como estão
  const corpo = `
    <div class="campo"><span>De quem é</span>${fixo ? `<div><span class="pill ${A.classe(f.dono)}">${esc(A.nome(f.dono))}</span></div>` : `<div class="donos" role="radiogroup">${donos.map((p) => `<button role="radio" class="${A.classe(p.id)}" aria-checked="${f.dono === p.id}" data-a="metaDono" data-id="${p.id}">${esc(p.nome)}</button>`).join('')}</div>`}
      <span class="muted" style="font-size:12px;margin-top:4px">${f.dono && fam && f.dono === fam.id ? 'Gastos da casa, pagos por qualquer um.' : 'Só os gastos pessoais desta pessoa.'}</span></div>
    <label class="campo"><span>Categoria</span>${fixo ? `<strong>${esc(nomeCat(db, f.categoria))}${R.ehGrupo(db, f.categoria) ? ' (grupo inteiro)' : ''}</strong>` : `<select class="entrada" data-campo="categoria"><option value="">Escolha…</option>${opcoes}</select>`}</label>
    <label class="campo"><span>Limite no mês (R$)</span><input class="entrada" inputmode="numeric" data-mascara="dinheiro" data-campo="valor" value="${esc(f.valor)}" placeholder="0,00"></label>
    ${info}
    ${fixo ? `<p class="muted" style="font-size:12.5px;margin-top:12px">${meta.mes === 'Todo mês' ? 'Vale todo mês' + (meta.desde ? ' desde ' + nomeMesAno(meta.desde).toLowerCase() : '') + '. Ao salvar, você escolhe se a mudança vale só para ' + esc(nomeM) + ' ou daqui em diante.' : 'Vale só em ' + esc(nomeM) + '.'}</p>`
    : `<div class="campo"><span>Vale</span><div class="chips"><button class="chip" aria-pressed="${f.vale !== 'mes'}" data-a="metaVale" data-v="todo">Todo mês, a partir de ${esc(nomeM)}</button><button class="chip" aria-pressed="${f.vale === 'mes'}" data-a="metaVale" data-v="mes">Só em ${esc(nomeM)}</button></div></div>`}
    <button class="btn btn-pri btn-largo" style="margin-top:18px" data-a="salvarMeta" ${E.salvando ? 'aria-disabled="true"' : ''}>${E.salvando ? 'Salvando…' : fixo ? 'Salvar alteração' : 'Criar meta'}</button>
    ${fixo ? `<button class="btn btn-perigo btn-largo" style="margin-top:8px" data-a="excluirMeta">${ic('lixo', 18)}Excluir meta</button>` : ''}`;
  return `<button class="veu" data-a="fecharModal" aria-label="Fechar"></button><div class="folha" role="dialog" aria-label="Meta"><div class="alca"></div><h2>${fixo ? 'Editar meta' : 'Nova meta'}</h2>${corpo}</div>`;
}
