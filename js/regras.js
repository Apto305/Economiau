// Regras de negócio do Economiau: faturas, mês de competência, divisão
// pela renda, saldos das contas e acerto do mês. Não mexe na tela nem na
// planilha: recebe os dados já lidos (db) e devolve números.
import { arred, mesDe, somaMes, dataNoMes } from './util.js';

export const TIPO = {
  despesa: 'Despesa', estorno: 'Estorno/Crédito', fatura: 'Pagamento de fatura',
  transf: 'Transferência entre contas', receita: 'Receita',
};

export const ativo = (x) => x.status !== 'Arquivado';
export const pessoasReais = (db) => db.pessoas.filter((p) => p.tipo === 'Pessoa' && ativo(p));
export const familia = (db) => db.pessoas.find((p) => p.tipo === 'Família');
export const porId = (lista, id) => lista.find((x) => x.id === id);
export const confirmado = (t) => t.status !== 'Previsto';

// ------------------------------------------------------------------ faturas

// Datas de fechamento e vencimento da fatura que fecha no mês "mesFecha"
export function datasFatura(cartao, mesFecha) {
  const fechamento = dataNoMes(mesFecha, cartao.fecha);
  const mesVence = cartao.vence > cartao.fecha ? mesFecha : somaMes(mesFecha, 1);
  const vencimento = dataNoMes(mesVence, cartao.vence);
  const mesRenda = cartao.rendaRef === 'Mesmo mês do vencimento' ? mesVence : somaMes(mesVence, -1);
  return { fechamento, vencimento, competencia: mesVence, mesRenda };
}

// Mês em que fecha a fatura que recebe uma compra feita em "data",
// pelo dia padrão do cartão (compras a partir do dia de fechamento vão
// para a próxima).
export function mesFechaPadrao(cartao, data) {
  const mes = mesDe(data);
  return data < dataNoMes(mes, cartao.fecha) ? mes : somaMes(mes, 1);
}

// Faturas do cartão em ordem de fechamento
export const faturasDoCartao = (db, cartaoId) =>
  db.faturas.filter((f) => f.cartao === cartaoId).sort((a, b) => (a.fechamento < b.fechamento ? -1 : 1));

// Primeiro dia de compras de uma fatura: o fechamento da fatura anterior,
// se ela for do mês anterior; senão, o dia de fechamento padrão do cartão
// no mês anterior (não deixa uma fatura "engolir" meses sem fatura criada).
export function inicioFatura(cartao, f, anterior) {
  const mesAnt = somaMes(mesDe(f.fechamento), -1);
  if (anterior && mesDe(anterior.fechamento) === mesAnt) return anterior.fechamento;
  return dataNoMes(mesAnt, cartao.fecha);
}

// Encontra a fatura existente em que a compra cai, respeitando datas de
// fechamento editadas fatura a fatura. Se não existir, devolve os dados
// de uma fatura nova (sem id) para ser criada.
export function faturaPara(db, cartao, data, deslocamento = 0) {
  const lista = faturasDoCartao(db, cartao.id);
  // 1) pelas faturas já existentes: a primeira cujo fechamento é depois da compra
  let base = null;
  for (let i = 0; i < lista.length; i++) {
    const f = lista[i];
    if (data < inicioFatura(cartao, f, lista[i - 1]) || data >= f.fechamento) continue;
    base = f; break;
  }
  if (base && deslocamento === 0) return base;
  // A fatura de um mês é achada pelo mês do vencimento (a data de fechamento
  // pode ter sido corrigida para o mês vizinho, ex.: fecha 01/11 em vez de 30/10)
  const mesVenc = (mf) => mesDe(datasFatura(cartao, mf).vencimento);
  const doMes = (mf) => lista.find((f) => mesDe(f.vencimento) === mesVenc(mf));
  let mesFecha = base ? mesDe(base.fechamento) : mesFechaPadrao(cartao, data);
  if (base) { const mv = mesDe(base.vencimento); while (mesVenc(mesFecha) < mv) mesFecha = somaMes(mesFecha, 1); while (mesVenc(mesFecha) > mv) mesFecha = somaMes(mesFecha, -1); }
  // a fatura desse mês já existe mas fecha antes da compra (data editada): vai para a próxima
  if (!base) { const ex = doMes(mesFecha); if (ex && data >= ex.fechamento) mesFecha = somaMes(mesFecha, 1); }
  mesFecha = somaMes(mesFecha, deslocamento);
  const existente = doMes(mesFecha);
  if (existente) return existente;
  return { id: null, cartao: cartao.id, status: 'Aberta', ...datasFatura(cartao, mesFecha) };
}

// Faturas repetidas: duas faturas do mesmo cartão vencendo no mesmo mês.
// Fica a que tem mais lançamentos (ou a conferida); os lançamentos da outra
// passam para ela e a outra é apagada.
export function faturasRepetidas(db) {
  const usos = (id) => db.transacoes.filter((t) => t.fatura === id).length;
  const grupos = {};
  db.faturas.forEach((f) => { if (f.cartao && f.vencimento) (grupos[f.cartao + '|' + mesDe(f.vencimento)] ||= []).push(f); });
  const mover = [], apagar = [], manter = [];
  Object.values(grupos).forEach((g) => {
    if (g.length < 2) return;
    const ord = [...g].sort((a, b) => (usos(b.id) - usos(a.id)) || ((b.conferida ? 1 : 0) - (a.conferida ? 1 : 0)) || (a.id < b.id ? -1 : 1));
    const fica = ord[0];
    manter.push(fica.id);
    ord.slice(1).forEach((f) => {
      db.transacoes.filter((t) => t.fatura === f.id).forEach((t) => mover.push({ id: t.id, fatura: fica.id }));
      apagar.push(f.id);
    });
  });
  return { mover, apagar, manter };
}

// Ao mudar o dia de fechamento/vencimento do cartão: faturas ainda não
// conferidas que seguiam o dia antigo passam a seguir o novo
export function faturasComDiaAntigo(db, antigo, novo) {
  if (!antigo || (antigo.fecha === novo.fecha && antigo.vence === novo.vence)) return [];
  const out = [];
  faturasDoCartao(db, antigo.id).forEach((f) => {
    if (f.conferida) return;
    const mes = mesDe(f.fechamento);
    const velho = datasFatura(antigo, mes), nova = datasFatura(novo, mes);
    const o = { id: f.id };
    if (f.fechamento === velho.fechamento && nova.fechamento !== f.fechamento) o.fechamento = nova.fechamento;
    if (f.vencimento === velho.vencimento && nova.vencimento !== f.vencimento) { o.vencimento = nova.vencimento; o.competencia = nova.competencia; }
    if (Object.keys(o).length > 1) out.push(o);
  });
  return out;
}

// Situação da fatura pela data de hoje e pelos pagamentos
export function situacaoFatura(db, f, hoje) {
  const total = totalFatura(db, f.id);
  const pago = db.transacoes.filter((t) => t.tipo === TIPO.fatura && t.fatura === f.id).reduce((s, t) => s + t.valor, 0);
  if (f.status === 'Paga' || (total > 0 && pago >= total - 0.005)) return 'Paga';
  if (hoje < f.fechamento) return 'Aberta';
  return 'Fechada';
}

export function totalFatura(db, faturaId) {
  return arred(db.transacoes.reduce((s, t) => {
    if (t.fatura !== faturaId) return s;
    if (t.tipo === TIPO.despesa) return s + t.valor;
    if (t.tipo === TIPO.estorno) return s - t.valor;
    return s;
  }, 0));
}

// Fatura "atual" do cartão: a aberta mais antiga ou, se todas fecharam, a
// mais recente ainda não paga.
export function faturaAtual(db, cartao, hoje) {
  const lista = faturasDoCartao(db, cartao.id);
  const naoPagas = lista.filter((f) => situacaoFatura(db, f, hoje) !== 'Paga');
  const fechada = naoPagas.find((f) => hoje >= f.fechamento);
  if (fechada) return fechada;
  return lista.find((f) => hoje < f.fechamento) || null;
}

// ------------------------------------------------------- mês de competência

// Mês em que um lançamento conta para divisão, metas e acerto:
// crédito → mês da fatura (Mês de referência da renda); demais → mês da data.
export function mesCompetencia(db, t) {
  if (t.mesComp) return t.mesComp; // previsto de conta fixa (ainda não lançado)
  if (t.fatura && (t.tipo === TIPO.despesa || t.tipo === TIPO.estorno)) {
    const f = porId(db.faturas, t.fatura);
    if (f && f.mesRenda) return f.mesRenda;
  }
  return mesDe(t.data);
}

// ---------------------------------------------------------------- divisão

export function rendaDoMes(db, mes) {
  const r = {};
  pessoasReais(db).forEach((p) => (r[p.id] = 0));
  db.rendas.forEach((x) => { if (x.status !== 'Previsto' && mesDe(x.data) === mes && r[x.pessoa] !== undefined) r[x.pessoa] += x.valor; });
  return r;
}

// Parte de uma pessoa numa receita (reembolso, rendimento, venda).
// Receita da Família: pela regra escolhida no lançamento (pela renda, meio a
// meio) ou, em "Não dividir", toda de quem recebeu; caindo na conta da
// Família sem dividir, fica só com a Família (não é entrada de ninguém).
export function parteNaReceita(db, t, pessoaId) {
  const fam = familia(db);
  if (!(fam && t.dono === fam.id)) return t.dono === pessoaId ? t.valor : 0;
  const regra = t.divisao || fam.divisaoPadrao || 'Proporcional à renda';
  const recebeu = t.pagou || donoDaConta(db, t.conta);
  if (regra === 'Individual') return recebeu === pessoaId ? t.valor : 0;
  return t.valor * (partesFamilia(db, { ...t, pagou: recebeu }, mesDe(t.data))[pessoaId] || 0);
}

const receitaDoMes = (t, mes) => t.tipo === TIPO.receita && !ehAjuste(t) && confirmado(t) && mesDe(t.data) === mes;

// Todas as entradas de uma pessoa no mês: rendas (entram na divisão), outras
// receitas dela (reembolsos, vendas, rendimentos) e a parte dela nas
// receitas da Família.
export function entradasDoMes(db, mes, pessoaId) {
  const fam = familia(db);
  let divisao = 0, outras = 0, daFamilia = 0;
  db.rendas.forEach((r) => { if (r.status !== 'Previsto' && r.pessoa === pessoaId && mesDe(r.data) === mes) divisao += r.valor; });
  db.transacoes.forEach((t) => {
    if (!receitaDoMes(t, mes)) return;
    if (fam && t.dono === fam.id) daFamilia += parteNaReceita(db, t, pessoaId);
    else if (t.dono === pessoaId) outras += t.valor;
  });
  return { divisao: arred(divisao), outras: arred(outras), familia: arred(daFamilia), total: arred(divisao + outras + daFamilia) };
}

// Receitas lançadas como da Família no mês (reembolsos, rendimentos...)
export function receitasDaFamilia(db, mes) {
  const fam = familia(db);
  if (!fam) return 0;
  return arred(db.transacoes.reduce((s, t) => (receitaDoMes(t, mes) && t.dono === fam.id ? s + t.valor : s), 0));
}

// Gastos de trabalho marcados como "Deduz da renda": saem da renda de quem
// é o gasto antes de calcular a divisão.
export function deducoesDoMes(db, mes) {
  const d = {};
  pessoasReais(db).forEach((p) => (d[p.id] = 0));
  db.transacoes.forEach((t) => {
    if (!t.deduz || !confirmado(t) || !ehGasto(t) || d[t.dono] === undefined) return;
    if (mesCompetencia(db, t) !== mes) return;
    d[t.dono] += t.tipo === TIPO.estorno ? -t.valor : t.valor;
  });
  return d;
}

// Renda que entra na divisão: renda do mês menos as deduções (nunca negativa)
export function rendaConsiderada(db, mes) {
  const r = rendaDoMes(db, mes), d = deducoesDoMes(db, mes), o = {};
  Object.keys(r).forEach((k) => (o[k] = Math.max(0, r[k] - (d[k] || 0))));
  return o;
}

// Frações da divisão pela renda no mês. Sem renda lançada no mês, usa o
// último mês com renda (até 12 meses atrás); sem nenhuma, meio a meio.
export function fracoesRenda(db, mes) {
  const ps = pessoasReais(db);
  for (let i = 0; i < 12; i++) {
    const r = rendaConsiderada(db, somaMes(mes, -i));
    const total = Object.values(r).reduce((a, b) => a + b, 0);
    if (total > 0) {
      const f = {};
      ps.forEach((p) => (f[p.id] = r[p.id] / total));
      return { fracoes: f, mesUsado: somaMes(mes, -i) };
    }
  }
  const f = {};
  ps.forEach((p) => (f[p.id] = 1 / ps.length));
  return { fracoes: f, mesUsado: null };
}

// Parte de cada pessoa num lançamento da Família
export function partesFamilia(db, t, mes) {
  const ps = pessoasReais(db);
  let regra = t.divisao || (familia(db) || {}).divisaoPadrao || 'Proporcional à renda';
  // pago pela conta da Família: não há "quem pagou" para Individual/Personalizada
  if ((regra === 'Individual' || regra === 'Personalizada') && !ps.some((p) => p.id === t.pagou)) regra = 'Proporcional à renda';
  const f = {};
  if (regra === '50/50') ps.forEach((p) => (f[p.id] = 1 / ps.length));
  else if (regra === 'Individual') ps.forEach((p) => (f[p.id] = p.id === t.pagou ? 1 : 0));
  else if (regra === 'Personalizada') {
    let pct = t.pctPagou;
    if (pct === '' || pct === null || pct === undefined || isNaN(pct)) {
      const pagador = porId(db.pessoas, t.pagou);
      pct = pagador && pagador.pctFixo !== '' ? Number(pagador.pctFixo) : 50;
    }
    ps.forEach((p) => (f[p.id] = p.id === t.pagou ? pct / 100 : (100 - pct) / 100 / Math.max(1, ps.length - 1)));
  } else Object.assign(f, fracoesRenda(db, mes).fracoes);
  return f;
}

// Quanto do lançamento é de cada pessoa (gastos com sinal: estorno negativo)
export function parteDe(db, t, pessoaId) {
  const ehFam = familia(db) && t.dono === familia(db).id;
  const sinal = t.tipo === TIPO.estorno ? -1 : 1;
  if (ehFam) return sinal * t.valor * (partesFamilia(db, t, mesCompetencia(db, t))[pessoaId] || 0);
  return t.dono === pessoaId ? sinal * t.valor : 0;
}

// Ajuste de saldo feito na conferência: mexe no saldo da conta, mas não é gasto nem receita
export const ehAjuste = (t) => t.grupoParc === 'AJUSTE';
export const ehGasto = (t) => (t.tipo === TIPO.despesa || t.tipo === TIPO.estorno) && !ehAjuste(t);

// Gastos do mês vistos por um perfil: pessoa = gastos dela + parte dela nos
// da família; Família = só os gastos da família.
export function gastosDoPerfil(db, perfilId, mes, incluirPrevistos = false) {
  const fam = familia(db);
  return arred(db.transacoes.reduce((s, t) => {
    if (!ehGasto(t) || mesCompetencia(db, t) !== mes) return s;
    if (!incluirPrevistos && !confirmado(t)) return s;
    if (fam && perfilId === fam.id) return t.dono === fam.id ? s + (t.tipo === TIPO.estorno ? -t.valor : t.valor) : s;
    return s + parteDe(db, t, perfilId);
  }, 0));
}

// Aportes (saídas) e resgates (entradas, pelo que caiu na conta) do mês nas
// contas do perfil. Contam nos totais de gastos e entradas do mês; não mexem
// na divisão da renda, nas metas nem no acerto (que trata à parte).
export function investimentosDoMes(db, perfilId, mes) {
  let aportes = 0, resgates = 0;
  (db.movsInv || []).forEach((m) => {
    if (!m.conta || mesDe(m.data) !== mes) return;
    if (perfilId && donoDaConta(db, m.conta) !== perfilId) return;
    if (m.tipo === 'Aporte') aportes += Number(m.valor) || 0;
    else if (m.tipo === 'Resgate') resgates += Number(m.liquido) > 0 ? Number(m.liquido) : Number(m.valor) || 0;
  });
  return { aportes: arred(aportes), resgates: arred(resgates) };
}

// Lançamentos que o perfil enxerga
export function visivelNoPerfil(db, t, perfilId) {
  const fam = familia(db);
  if (!perfilId) return true;
  if (fam && perfilId === fam.id) return t.dono === fam.id; // perfil Família: só o que é da família
  return t.dono === perfilId || t.pagou === perfilId || (fam && t.dono === fam.id) || t.destinoDono === perfilId;
}

// ------------------------------------------------------------------ saldos

export function donoDaConta(db, contaId) {
  const c = porId(db.contas, contaId);
  return c ? c.dono : '';
}

export function saldoConta(db, conta, ate = '9999-12-31', incluirPrevistos = false) {
  let s = conta.saldoInicial || 0;
  const desde = conta.dataSaldo || '0000-00-00';
  const conta_ = (t) => t.data >= desde && t.data <= ate && (incluirPrevistos || confirmado(t));
  db.transacoes.forEach((t) => {
    if (!conta_(t)) return;
    if (t.conta === conta.id && !t.cartao) {
      if (t.tipo === TIPO.despesa) s -= t.valor;
      else if (t.tipo === TIPO.estorno || t.tipo === TIPO.receita) s += t.valor;
      else if (t.tipo === TIPO.transf) s -= t.valor;
    }
    if (t.tipo === TIPO.fatura && t.conta === conta.id) s -= t.valor;
    if (t.tipo === TIPO.transf && t.contaDestino === conta.id) s += t.valor;
  });
  db.rendas.forEach((r) => { if (r.conta === conta.id && r.data >= desde && r.data <= ate) s += r.valor; });
  (db.movsInv || []).forEach((m) => {
    if (m.conta !== conta.id || m.data < desde || m.data > ate) return;
    if (m.tipo === 'Aporte') s -= m.valor;
    else if (m.tipo === 'Resgate') s += (m.liquido !== '' && m.liquido !== undefined && m.liquido !== null) ? Number(m.liquido) : m.valor;
  });
  return arred(s);
}

// ------------------------------------------------------------------ acerto

const ehPessoa = (db, id) => pessoasReais(db).some((p) => p.id === id);

// Quem paga a fatura de um cartão: sempre uma pessoa (nunca a Família).
// Sem "Paga por" preenchido (planilhas antigas): dono da conta de pagamento,
// senão o dono do cartão, senão a primeira pessoa.
export function pagaPorDe(db, cartao) {
  if (!cartao) return '';
  if (cartao.pagaPor && ehPessoa(db, cartao.pagaPor)) return cartao.pagaPor;
  const dc = donoDaConta(db, cartao.contaPag);
  if (ehPessoa(db, dc)) return dc;
  if (ehPessoa(db, cartao.dono)) return cartao.dono;
  return (pessoasReais(db)[0] || {}).id || '';
}

// Quem pagou um lançamento: no cartão, quem paga a fatura do cartão;
// nas contas, o dono da conta (pode ser a Família).
export function quemPagou(db, t) {
  if (t.cartao && (t.tipo === TIPO.despesa || t.tipo === TIPO.estorno)) return pagaPorDe(db, porId(db.cartoes, t.cartao)) || t.pagou;
  return t.pagou || donoDaConta(db, t.conta);
}

// De quem é o dinheiro da Família (contas e investimentos da Família): dos
// dois, pela divisão padrão da Família (proporcional à renda, 50/50 ou %
// fixo de cada um).
export function fracoesFamilia(db, mes) {
  const ps = pessoasReais(db);
  const regra = (familia(db) || {}).divisaoPadrao || 'Proporcional à renda';
  const f = {};
  if (regra === '50/50') { ps.forEach((p) => (f[p.id] = 1 / ps.length)); return f; }
  if (regra === 'Personalizada' && ps.every((p) => p.pctFixo !== '' && p.pctFixo !== undefined && !isNaN(p.pctFixo))) {
    const tot = ps.reduce((a, p) => a + Number(p.pctFixo), 0);
    if (tot > 0) { ps.forEach((p) => (f[p.id] = Number(p.pctFixo) / tot)); return f; }
  }
  return fracoesRenda(db, mes).fracoes;
}

// Cartões sem "Paga por" (criados antes da 1.11): preenche pela regra de pagaPorDe
export const cartoesSemPagaPor = (db) => db.cartoes
  .filter((c) => !(c.pagaPor && ehPessoa(db, c.pagaPor)))
  .map((c) => ({ id: c.id, pagaPor: pagaPorDe(db, c) }))
  .filter((x) => x.pagaPor);

// Compras e estornos no cartão cujo "Quem pagou" não é quem paga o cartão
export const pagadoresErrados = (db) => db.transacoes
  .filter((t) => t.cartao && (t.tipo === TIPO.despesa || t.tipo === TIPO.estorno))
  .map((t) => ({ id: t.id, de: t.pagou, pagou: pagaPorDe(db, porId(db.cartoes, t.cartao)) }))
  .filter((x) => x.pagou && x.pagou !== x.de)
  .map(({ id, pagou }) => ({ id, pagou }));

// Transferência ou aporte que mexe com a Família e pode ficar fora do acerto
// Transferência ou aporte entre donos diferentes (pessoas ou Família): pode ficar fora do acerto
export const donosDiferentes = (a, b) => !!a && !!b && a !== b;
export const entrePessoas = (db, a, b) => { const ps = pessoasReais(db).map((p) => p.id); return a !== b && ps.includes(a) && ps.includes(b); };
export const envolveFamilia = (db, a, b) => { const fam = familia(db); return !!fam && a !== b && (a === fam.id || b === fam.id); };

// Saldo de cada pessoa no mês: positivo = tem a receber, negativo = deve.
// A Família não é uma terceira pessoa: o que ela paga ou recebe é dos dois,
// na proporção de fracoesFamilia.
export function acertoDoMes(db, mes) {
  const ps = pessoasReais(db);
  const fam = familia(db);
  const famId = fam ? fam.id : null;
  const saldo = {};
  ps.forEach((p) => (saldo[p.id] = 0));
  const det = { famTotal: 0, pagoFam: {}, parteFam: {}, entre: [], receitas: [], transferencias: [], acertos: [], itens: [] };
  ps.forEach((p) => { det.pagoFam[p.id] = 0; det.parteFam[p.id] = 0; });
  let fFam = null;
  const fracFam = () => (fFam = fFam || fracoesFamilia(db, mes));
  // crédito para quem pagou (v > 0) ou débito para quem recebeu (v < 0)
  const add = (id, v) => {
    if (saldo[id] !== undefined) saldo[id] += v;
    else if (famId && id === famId) { const f = fracFam(); ps.forEach((p) => (saldo[p.id] += v * (f[p.id] || 0))); }
  };
  // registra o efeito de um lançamento no acerto, para mostrar na tela
  const item = (obj, tipo, fn) => {
    const antes = { ...saldo };
    fn();
    const efeito = {}; let mexeu = false;
    ps.forEach((p) => { efeito[p.id] = arred(saldo[p.id] - antes[p.id]); if (Math.abs(efeito[p.id]) >= 0.005) mexeu = true; });
    if (mexeu) det.itens.push({ obj, tipo, efeito });
    return mexeu;
  };

  db.transacoes.forEach((t) => {
    if (!confirmado(t)) return;
    if (ehGasto(t)) {
      if (mesCompetencia(db, t) !== mes) return;
      const v = t.tipo === TIPO.estorno ? -t.valor : t.valor;
      const pagou = quemPagou(db, t);
      if (famId && t.dono === famId) {
        const f = partesFamilia(db, { ...t, pagou }, mes);
        add(pagou, v);
        ps.forEach((p) => add(p.id, -v * (f[p.id] || 0)));
        det.famTotal += v;
        if (det.pagoFam[pagou] !== undefined) det.pagoFam[pagou] += v;
        else if (pagou === famId) { const ff = fracFam(); ps.forEach((p) => (det.pagoFam[p.id] += v * (ff[p.id] || 0))); }
        ps.forEach((p) => (det.parteFam[p.id] += v * (f[p.id] || 0)));
      } else if (t.dono && pagou && t.dono !== pagou) {
        if (item(t, 'entre', () => { add(pagou, v); add(t.dono, -v); })) det.entre.push(t);
      }
      return;
    }
    if (mesDe(t.data) !== mes) return;
    if (t.tipo === TIPO.receita) {
      if (ehAjuste(t)) return;
      const recebeu = t.pagou || donoDaConta(db, t.conta);
      if (famId && t.dono === famId) {
        if (recebeu === famId && t.divisao === 'Individual') return; // fica com a Família, sem dividir
        const f = partesFamilia(db, t, mes);
        if (item(t, 'receita', () => { add(recebeu, -t.valor); ps.forEach((p) => add(p.id, t.valor * (f[p.id] || 0))); })) det.receitas.push(t);
      } else if (t.dono && recebeu && t.dono !== recebeu) {
        if (item(t, 'receita', () => { add(recebeu, -t.valor); add(t.dono, t.valor); })) det.receitas.push(t);
      }
    } else if (t.tipo === TIPO.fatura) {
      const pagador = donoDaConta(db, t.conta);
      const deve = pagaPorDe(db, porId(db.cartoes, t.cartao));
      if (pagador && deve && pagador !== deve && item(t, 'fatura', () => { add(pagador, t.valor); add(deve, -t.valor); })) det.transferencias.push(t);
    } else if (t.tipo === TIPO.transf) {
      if (/^ACE-/.test(t.grupoParc || '')) return; // transferência do acerto: já conta pela aba Acertos
      const de = donoDaConta(db, t.conta), para = donoDaConta(db, t.contaDestino);
      if (!de || !para || de === para) return;
      if (t.foraAcerto) return; // presente, reserva de uma pessoa só etc.
      if (item(t, 'transf', () => { add(de, t.valor); add(para, -t.valor); })) det.transferencias.push(t);
    }
  });
  db.rendas.forEach((r) => {
    // renda que caiu na conta do outro (ou da Família): quem recebeu repassa
    if (mesDe(r.data) !== mes || r.status === 'Previsto') return;
    const recebeu = donoDaConta(db, r.conta);
    if (recebeu && r.pessoa && recebeu !== r.pessoa) item(r, 'renda', () => { add(recebeu, -r.valor); add(r.pessoa, r.valor); });
  });
  (db.movsInv || []).forEach((m) => {
    // aporte/resgate entre a conta de um e o investimento de outro (ou da Família)
    if (mesDe(m.data) !== mes || (m.tipo !== 'Aporte' && m.tipo !== 'Resgate')) return;
    const inv = porId(db.investimentos || [], m.investimento);
    const dc = donoDaConta(db, m.conta), di = inv ? inv.titular : '';
    if (!dc || !di || dc === di) return;
    if (m.foraAcerto) return;
    const liq = m.tipo === 'Resgate' && m.liquido !== '' && m.liquido !== undefined && m.liquido !== null ? Number(m.liquido) : m.valor;
    item({ ...m, desc: m.tipo + ' · ' + (inv.nome || '') }, 'invest', () => {
      if (m.tipo === 'Aporte') { add(dc, m.valor); add(di, -m.valor); } else { add(di, liq); add(dc, -liq); }
    });
  });
  db.acertos.forEach((a) => {
    if (a.mesRef !== mes) return;
    add(a.de, a.valor); add(a.para, -a.valor);
    det.acertos.push(a);
  });

  Object.keys(saldo).forEach((k) => (saldo[k] = arred(saldo[k])));
  Object.keys(det.pagoFam).forEach((k) => { det.pagoFam[k] = arred(det.pagoFam[k]); det.parteFam[k] = arred(det.parteFam[k]); });
  det.famTotal = arred(det.famTotal);
  // Com duas pessoas: quem deve, para quem, quanto
  let resultado = null;
  if (ps.length === 2) {
    const [a, b] = ps;
    const v = saldo[a.id];
    if (Math.abs(v) >= 0.01) resultado = v < 0 ? { de: a.id, para: b.id, valor: arred(-v) } : { de: b.id, para: a.id, valor: arred(v) };
  }
  return { saldo, resultado, det, fracoes: fracoesRenda(db, mes), fracoesFamilia: fFam };
}

// ------------------------------------------------------------- parcelas

// Divide o total em N parcelas; a diferença de centavos fica na primeira.
export function valoresParcelas(total, n) {
  const base = Math.floor((total / n) * 100) / 100;
  const resto = arred(total - base * n);
  return Array.from({ length: n }, (_, i) => arred(i === 0 ? base + resto : base));
}

// ------------------------------------------------- contas fixas (previstos)

export const recorrenciaAtiva = (r, mes) =>
  ativo(r) && (!r.inicio || mesDe(r.inicio) <= mes) && (!r.fim || mesDe(r.fim) >= mes);

// Lançamentos previstos das contas fixas que ainda não foram lançados de
// verdade. Não são gravados na planilha: aparecem como "Previsto" até
// alguém confirmar. Devolve só os que contam no mês pedido.
export function previstosDoMes(db, mes) {
  const lista = [];
  (db.recorrencias || []).forEach((r) => {
    for (let k = -2; k <= 0; k++) {
      const m = somaMes(mes, k);
      if (!recorrenciaAtiva(r, m)) continue;
      const data = dataNoMes(m, r.dia || 1);
      if (r.inicio && data < r.inicio) continue;
      if (String(r.pulados || '').split(',').map((x) => x.trim()).includes(m)) continue; // mês pulado
      const ehRenda = r.tipo === 'Renda';
      // "Mês da recorrência" diz de qual mês é o lançamento, mesmo pago em outro mês
      const doMes = (x) => x.recorrencia === r.id && (x.mesRec || mesDe(x.data)) === m;
      const feito = ehRenda ? db.rendas.some(doMes) : db.transacoes.some(doMes);
      if (feito) continue;
      let mesComp = m;
      let fatura = '';
      if (r.cartao && !ehRenda) {
        const c = porId(db.cartoes, r.cartao);
        if (c) { const f = faturaPara(db, c, data); mesComp = f.mesRenda; fatura = f.id || ''; }
      }
      if (mesComp !== mes) continue;
      const base = { id: 'VREC:' + r.id + ':' + m, virtual: true, recorrencia: r.id, data, desc: r.desc, valor: r.valor, status: 'Previsto', tags: r.tags || '', mesComp };
      if (ehRenda) lista.push({ ...base, ehRenda: true, tipo: TIPO.receita, pessoa: r.dono, dono: r.dono, conta: r.conta, pagou: r.pagou || r.dono });
      else lista.push({ ...base, tipo: r.tipo === 'Receita' ? TIPO.receita : TIPO.despesa, categoria: r.categoria, meio: r.cartao ? 'Crédito' : r.meio, cartao: r.cartao, conta: r.conta, fatura, dono: r.dono, pagou: r.pagou, divisao: r.divisao, deduz: r.deduz });
    }
  });
  return lista;
}

// Um previsto pelo id ("VREC:REC-0001:2026-11"), de qualquer mês
export function acharPrevisto(db, id) {
  const m = String(id).split(':')[2];
  if (!m) return null;
  for (let k = 0; k <= 3; k++) { const p = previstosDoMes(db, somaMes(m, k)).find((x) => x.id === id); if (p) return p; }
  return null;
}

// Previstos de um cartão entre dois meses (inclusive), cada um uma vez
export function previstosDoCartao(db, cartaoId, de, ate) {
  const out = [];
  for (let m = de; m <= ate; m = somaMes(m, 1)) previstosDoMes(db, m).forEach((p) => { if (p.cartao === cartaoId && !p.ehRenda) out.push(p); });
  return out;
}

// Cópia dos dados com os previstos do mês incluídos (para telas e somas de previsão)
export function comPrevistos(db, mes) {
  const p = previstosDoMes(db, mes);
  return { ...db, transacoes: [...db.transacoes, ...p.filter((x) => !x.ehRenda)], rendas: [...db.rendas, ...p.filter((x) => x.ehRenda)] };
}

// Categorias na ordem escolhida (coluna Ordem); sem ordem, na ordem da planilha.
// "rasc" = ordem provisória enquanto a pessoa reordena na tela.
export function porOrdem(db, lista, rasc) {
  const pos = new Map(db.categorias.map((c, i) => [c.id, i]));
  const ord = (c) => { const v = rasc && rasc[c.id] !== undefined ? rasc[c.id] : c.ordem; return v === '' || v === undefined || v === null || isNaN(v) ? Infinity : Number(v); };
  return [...lista].sort((a, b) => (ord(a) - ord(b)) || (pos.get(a.id) - pos.get(b.id)));
}

// Tags: sempre minúsculas, sem # e sem espaços sobrando (assim "Viagem" e
// "viagem " digitadas na planilha viram a mesma tag)
export const normTag = (x) => String(x || '').replace(/#/g, ' ').trim().replace(/\s+/g, ' ').toLowerCase();
export const tagsDe = (t) => [...new Set(String(t.tags || '').split(',').map(normTag).filter(Boolean))];
const comTags = (db) => [['transacoes', db.transacoes], ['rendas', db.rendas], ['recorrencias', db.recorrencias || []]];
export function todasAsTags(db) {
  return usoDasTags(db).map((x) => x.tag);
}
// Cada tag com quantos lançamentos (e contas fixas) a usam
export function usoDasTags(db) {
  const n = {};
  comTags(db).forEach(([, lista]) => lista.forEach((t) => tagsDe(t).forEach((x) => (n[x] = (n[x] || 0) + 1))));
  return Object.keys(n).sort((a, b) => a.localeCompare(b, 'pt-BR')).map((tag) => ({ tag, n: n[tag] }));
}
// Linhas a gravar para trocar a tag "de" por "para" (vazio = tirar a tag).
// Também regrava as linhas em que a tag estava escrita diferente na planilha.
export function trocarTag(db, de, para) {
  const a = normTag(de), b = normTag(para);
  const out = {};
  comTags(db).forEach(([aba, lista]) => {
    const linhas = [];
    lista.forEach((t) => {
      const atuais = tagsDe(t);
      if (!atuais.includes(a)) return;
      const novas = [...new Set(atuais.map((x) => (x === a ? b : x)).filter(Boolean))];
      linhas.push({ id: t.id, tags: novas.join(', ') });
    });
    if (linhas.length) out[aba] = linhas;
  });
  return out;
}

// Compras no cartão que ficaram numa fatura que não cobre a data da compra
// (erro da versão 1.0 a 1.4). Devolve [{ t, certa }] com a fatura certa
// (sem id quando ela ainda precisa ser criada). Parcelas acompanham a 1ª.
export function comprasNaFaturaErrada(db) {
  const out = [];
  const grupos = {};
  db.transacoes.forEach((t) => {
    if (!t.cartao || !t.fatura || !(t.tipo === TIPO.despesa || t.tipo === TIPO.estorno)) return;
    if (t.grupoParc && t.totalParcelas > 1) (grupos[t.grupoParc] = grupos[t.grupoParc] || []).push(t);
    else {
      const c = porId(db.cartoes, t.cartao);
      if (!c) return;
      const certa = faturaPara(db, c, t.data, 0);
      if (certa.id !== t.fatura) out.push({ t, certa, k: 0 });
    }
  });
  Object.values(grupos).forEach((lista) => {
    lista.sort((a, b) => a.parcela - b.parcela);
    const c = porId(db.cartoes, lista[0].cartao);
    if (!c) return;
    lista.forEach((t) => {
      const certa = faturaPara(db, c, t.data, (t.parcela || 1) - 1);
      if (certa.id !== t.fatura) out.push({ t, certa, k: (t.parcela || 1) - 1 });
    });
  });
  return out;
}

// Mês em que a fatura conta, sempre a partir do vencimento dela e da opção
// atual do cartão ("anterior ao vencimento" ou "do vencimento").
export function mesRendaDaFatura(db, f) {
  const c = porId(db.cartoes, f.cartao);
  const mv = mesDe(f.vencimento);
  if (!c || !mv) return f.mesRenda;
  return c.rendaRef === 'Mesmo mês do vencimento' ? mv : somaMes(mv, -1);
}
// Faturas cujo mês gravado não bate com a regra (gravadas antes de mudar a
// opção do cartão ou as datas). Devolve as correções a gravar.
export function faturasComMesErrado(db) {
  return db.faturas.map((f) => ({ f, mesRenda: mesRendaDaFatura(db, f), competencia: mesDe(f.vencimento) || f.competencia }))
    .filter((x) => x.mesRenda !== x.f.mesRenda || x.competencia !== x.f.competencia)
    .map((x) => ({ id: x.f.id, mesRenda: x.mesRenda, competencia: x.competencia }));
}
