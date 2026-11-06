// Telas do fechamento (conferência) e dos investimentos.
import { esc, brl, brlSinal, dataCurta, dataBR, nomeMesAno, mesDe, lerValor, arred, hojeISO } from './util.js';
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

export function telaConferencia(E) {
  const A = apoio(E);
  const db = E.db, mes = E.mes;
  const nomeM = nomeMesAno(mes).split(' ')[0].toLowerCase();
  const faturas = faturasDaConferencia(db, mes);
  const contas = db.contas.filter(R.ativo);
  const fSel = R.porId(faturas, E.confFatura) || null;
  const confFat = faturas.filter((f) => f.conferida).length;
  const confContas = contas.filter((c) => E.contasOk[c.id + ':' + mes]).length;
  const trnsMes = db.transacoes.filter((t) => !R.ehAjuste(t) && (R.ehGasto(t) ? R.mesCompetencia(db, t) : mesDe(t.data)) === mes && R.confirmado(t));
  const trnsOk = trnsMes.filter((t) => t.conferido).length;
  const barra = (n, d) => `<div class="barra" style="margin-top:6px"><span style="width:${d ? Math.round(n / d * 100) : 0}%"></span></div>`;

  const resumo = `<div class="cartao"><h2 style="font-size:15px;font-weight:800">Fechamento de ${esc(nomeM)}</h2>
    <div style="margin-top:12px"><div style="display:flex;justify-content:space-between;font-size:13.5px"><span>Faturas</span><strong>${confFat} de ${faturas.length}</strong></div>${barra(confFat, faturas.length)}</div>
    <div style="margin-top:12px"><div style="display:flex;justify-content:space-between;font-size:13.5px"><span>Saldos das contas</span><strong>${confContas} de ${contas.length}</strong></div>${barra(confContas, contas.length)}</div>
    <div style="margin-top:12px"><div style="display:flex;justify-content:space-between;font-size:13.5px"><span>Lançamentos conferidos</span><strong>${trnsOk} de ${trnsMes.length}</strong></div>${barra(trnsOk, trnsMes.length)}</div>
    <a class="link" href="#/acerto" style="display:inline-block;margin-top:12px">Ir para o acerto de ${esc(nomeM)}</a></div>`;

  const listaFaturas = `<div class="secao-titulo"><span>Faturas que contam em ${esc(nomeM)}</span></div>
    <div class="lista">${faturas.length ? faturas.map((f) => {
      const c = A.cartao(f.cartao);
      const st = estadoFatura(db, f);
      const pill = f.conferida ? '<span class="pill ok">Conferida</span>' : st.banco !== null ? '<span class="pill aviso">Conferindo</span>' : '<span class="pill neutra">A conferir</span>';
      return `<button class="item" data-a="abrirConfFatura" data-id="${f.id}" ${fSel && fSel.id === f.id ? 'style="background:#232832"' : ''}><span class="chip-cor" style="background:${corConta(c.cor)}">${esc(c.nome[0])}</span><span class="principal-txt"><span class="titulo">${esc(c.nome)}</span><span class="sub">vence ${dataCurta(f.vencimento)} · ${st.marcadas} de ${st.compras.length} compras · ${sens(brl(st.total))}</span></span>${pill}</button>`;
    }).join('') : `<div class="vazio">Nenhuma fatura conta em ${esc(nomeM)}.</div>`}</div>`;

  const listaContas = `<div class="secao-titulo"><span>Saldos das contas hoje</span></div>
    <div class="lista">${contas.map((c) => {
      const app = R.saldoConta(db, c);
      const k = c.id;
      const digitado = E.saldoBanco[k];
      const banco = digitado === undefined || digitado === '' ? null : arred(lerValor(digitado));
      const dif = banco === null ? null : arred(banco - app);
      const ok = E.contasOk[c.id + ':' + mes];
      let status = '';
      if (ok) status = '<span class="pill ok">Bate</span>';
      else if (dif !== null && Math.abs(dif) < 0.005) status = `<button class="btn btn-peq btn-sec" data-a="contaBate" data-id="${c.id}">Confirmar</button>`;
      else if (dif !== null) status = `<button class="btn btn-peq btn-pri" data-a="ajustarSaldo" data-id="${c.id}">Ajustar ${brlSinal(dif)}</button>`;
      return `<div class="item conf-conta"><span class="chip-cor" style="background:${corConta(c.cor)}">${esc(c.nome[0] || '?')}</span><span class="principal-txt"><span class="titulo">${esc(A.nomeConta(c.id))}</span><span class="sub">no app ${sens(brlSinal(app))}${dif !== null && Math.abs(dif) >= 0.005 ? ' · diferença ' + brlSinal(dif) : ''}</span></span>
        <span class="conf-conta-acoes"><input class="entrada" style="flex:1;min-width:0;max-width:150px;height:38px;font-size:15px;text-align:right" inputmode="numeric" data-mascara="dinheiro" data-negativo="1" data-saldo-banco="${k}" placeholder="saldo no banco" value="${esc(digitado || '')}" aria-label="Saldo de ${esc(c.nome)} no banco">${status}</span></div>`;
    }).join('')}</div>
    <p class="muted" style="font-size:12.5px;margin:8px 4px 0">Digite o saldo que o app do banco mostra agora. Se não bater, "Ajustar" lança a diferença como ajuste de saldo (não conta como gasto nem como receita).</p>`;

  const painel = fSel ? painelFatura(E, A, fSel) : `<div class="cartao so-pc" style="text-align:center;color:var(--muted);padding:40px 16px">${ic('faturas', 32)}<p style="margin-top:8px">Escolha uma fatura para conferir com o banco.</p></div>`;
  let corpo;
  if (fSel) corpo = `<div class="grade-conf"><div class="so-pc">${resumo}${listaFaturas}${listaContas}</div><div>${painel}</div></div>`;
  else corpo = `<div class="grade-conf"><div>${resumo}${listaFaturas}${listaContas}</div><div class="so-pc">${painel}</div></div>`;
  return casca(E, fSel ? `<span class="so-pc">Conferência</span><span class="so-cel-i">Conferir fatura</span>` : 'Conferência', corpo, { voltar: fSel ? null : 'mais', acoes: (fSel ? `<button class="icone-btn so-cel" data-a="fecharConfFatura" aria-label="Voltar para a lista">${ic('voltar', 22)}</button>` : '') + seletorMes(E) });
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
    ${indices}
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
  const movs = r.movs.map((x) => `<div class="item" style="padding:10px 0"><span class="principal-txt"><span class="titulo">${x.tipo === 'Aporte' ? 'Aporte' : 'Resgate'}</span><span class="sub">${dataBR(x.data)} · ${esc(A.nomeConta(x.conta) || '')}${x.tipo === 'Resgate' && x.liquido ? ' · caiu ' + brl(x.liquido) : ''}</span></span><span class="valor ${x.tipo === 'Aporte' ? '' : 'rec'}">${x.tipo === 'Aporte' ? '' : '− '}${sens(brl(x.valor))}</span><button class="icone-btn" data-a="excluirMov" data-id="${x.id}" aria-label="Excluir movimentação">${ic('lixo', 18)}</button></div>`).join('');
  const robo = inv.liquido !== '' && inv.liquido !== undefined && inv.calculadoEm ? `<p class="muted" style="font-size:12px;margin-top:6px">O robô da planilha calculou ${brl(inv.liquido)} líquido na última atualização.</p>` : '';
  const corpo = `<div class="pill ${A.classe(inv.titular)}">${esc(A.nome(inv.titular))}</div>
    <div class="muted" style="font-size:13px;margin-top:10px">Valor líquido hoje</div>
    <div class="resumo-grande">${sens(brl(r.liquido))}</div>
    <div class="muted" style="font-size:13px">${esc(inv.tipo || '')} · ${esc(descTaxa(inv))}</div>${robo}
    <div class="cartao" style="margin-top:14px;background:var(--bg)">
      ${linha('Valor bruto', sens(brl(r.bruto)))}${linha('Aplicado', sens(brl(r.aplicado)))}${linha('Rendimento bruto', '<span class="rec">+ ' + sens(brl(r.rendimento)) + '</span>')}
      ${linha('IOF', r.iof ? '− ' + sens(brl(r.iof)) : 'nenhum (mais de 30 dias)')}${linha('IR estimado', isento ? 'isento' : '− ' + sens(brl(r.ir)))}${linha('<strong>Líquido</strong>', '<strong>' + sens(brl(r.liquido)) + '</strong>')}
    </div>
    <h2 style="font-size:15px;font-weight:800;margin-top:18px">Imposto de renda</h2>${tabelaIR}
    <h2 style="font-size:15px;font-weight:800;margin-top:18px">Dados</h2>
    <div>${linha('Emissor', esc(inv.emissor || '—'))}${linha('Aplicado em', inv.dataAplic ? dataBR(inv.dataAplic) : '—')}${linha('Vencimento', inv.vencimento ? dataBR(inv.vencimento) : '—')}${linha('Liquidez', esc(inv.liquidez || '—'))}${linha('Garantia', ['CDB', 'LCI', 'LCA', 'Poupança'].includes(inv.tipo) ? 'FGC até R$ 250 mil por instituição' : inv.tipo && inv.tipo.startsWith('Tesouro') ? 'Tesouro Nacional' : '—')}</div>
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

export function modalMov(E, A, m) {
  const f = m.form;
  const inv = R.porId(E.db.investimentos, f.investimento);
  const C = calcInvest(E);
  const r = C.res[inv.id];
  const contas = E.db.contas.filter(R.ativo);
  const valor = lerValor(f.valor);
  let est = '';
  if (f.tipo === 'Resgate' && valor > 0 && r.liquido > 0) {
    const fr = Math.min(1, valor / r.liquido);
    est = `<div class="cartao" style="margin-top:14px;background:var(--bg);font-size:14px">
      <div style="display:flex;justify-content:space-between"><span class="muted">Sai do investimento (bruto)</span><strong>${brl(r.bruto * fr)}</strong></div>
      <div style="display:flex;justify-content:space-between;margin-top:6px"><span class="muted">IR + IOF desta parte</span><strong>− ${brl((r.ir + r.iof) * fr)}</strong></div>
      <div style="display:flex;justify-content:space-between;margin-top:6px"><span class="muted">Cai na conta</span><strong class="rec">${brl(valor)}</strong></div>
      ${fr >= 0.999 ? '<p class="muted" style="font-size:12.5px;margin-top:8px">Resgate total: o investimento fica zerado.</p>' : ''}</div>`;
  }
  const corpo = `<p class="muted" style="margin:8px 4px 0;font-size:13.5px">${esc(inv.nome)} · líquido hoje ${brl(r.liquido)}</p>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      <label class="campo"><span>${f.tipo === 'Resgate' ? 'Valor que cai na conta (R$)' : 'Valor do aporte (R$)'}</span><input class="entrada" inputmode="numeric" data-mascara="dinheiro" data-campo="valor" value="${esc(f.valor)}" placeholder="0,00"></label>
      <label class="campo"><span>Data</span><input type="date" class="entrada" data-campo="data" value="${esc(f.data)}"></label>
    </div>
    ${f.tipo === 'Resgate' ? `<button class="link" style="margin-top:8px" data-a="resgateTotal">Resgatar tudo (${brl(r.liquido)})</button>` : ''}
    <label class="campo"><span>${f.tipo === 'Resgate' ? 'Cai na conta' : 'Sai da conta'}</span><select class="entrada" data-campo="conta"><option value="">— nenhuma —</option>${contas.map((c) => `<option value="${c.id}" ${f.conta === c.id ? 'selected' : ''}>${esc(A.nomeConta(c.id))} (${esc(A.nome(c.dono))})</option>`).join('')}</select></label>
    ${est}${blocoAcertoMov(E, A, inv, f, valor)}
    <button class="btn btn-pri btn-largo" style="margin-top:18px" data-a="salvarMov" ${E.salvando ? 'aria-disabled="true"' : ''}>${E.salvando ? 'Salvando…' : f.tipo === 'Resgate' ? 'Registrar resgate' : 'Registrar aporte'}</button>`;
  return `<button class="veu" data-a="fecharModal" aria-label="Fechar"></button><div class="folha" role="dialog" aria-label="${f.tipo}"><div class="alca"></div><h2>${f.tipo === 'Resgate' ? 'Resgatar' : 'Novo aporte'}</h2>${corpo}</div>`;
}

export { valorTxt };
