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
  let mesFecha = base ? mesDe(base.fechamento) : mesFechaPadrao(cartao, data);
  if (base && deslocamento === 0) return base;
  mesFecha = somaMes(mesFecha, deslocamento);
  const existente = lista.find((f) => mesDe(f.fechamento) === mesFecha);
  if (existente) return existente;
  return { id: null, cartao: cartao.id, status: 'Aberta', ...datasFatura(cartao, mesFecha) };
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

// Todas as entradas de uma pessoa no mês: rendas (entram na divisão) e
// outras receitas dela (reembolsos, vendas), que não entram na divisão.
export function entradasDoMes(db, mes, pessoaId) {
  let divisao = 0, outras = 0;
  db.rendas.forEach((r) => { if (r.status !== 'Previsto' && r.pessoa === pessoaId && mesDe(r.data) === mes) divisao += r.valor; });
  db.transacoes.forEach((t) => { if (t.tipo === TIPO.receita && !ehAjuste(t) && confirmado(t) && t.dono === pessoaId && mesDe(t.data) === mes) outras += t.valor; });
  return { divisao: arred(divisao), outras: arred(outras), total: arred(divisao + outras) };
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
  const regra = t.divisao || (familia(db) || {}).divisaoPadrao || 'Proporcional à renda';
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

// Saldo de cada pessoa no mês: positivo = tem a receber, negativo = deve.
export function acertoDoMes(db, mes) {
  const ps = pessoasReais(db);
  const fam = familia(db);
  const saldo = {};
  ps.forEach((p) => (saldo[p.id] = 0));
  const det = { famTotal: 0, pagoFam: {}, parteFam: {}, entre: [], receitas: [], transferencias: [], acertos: [] };
  ps.forEach((p) => { det.pagoFam[p.id] = 0; det.parteFam[p.id] = 0; });
  const add = (id, v) => { if (saldo[id] !== undefined) saldo[id] += v; };

  db.transacoes.forEach((t) => {
    if (!confirmado(t)) return;
    if (ehGasto(t)) {
      if (mesCompetencia(db, t) !== mes) return;
      const v = t.tipo === TIPO.estorno ? -t.valor : t.valor;
      if (fam && t.dono === fam.id) {
        const f = partesFamilia(db, t, mes);
        add(t.pagou, v);
        ps.forEach((p) => add(p.id, -v * (f[p.id] || 0)));
        det.famTotal += v;
        if (det.pagoFam[t.pagou] !== undefined) det.pagoFam[t.pagou] += v;
        ps.forEach((p) => (det.parteFam[p.id] += v * (f[p.id] || 0)));
      } else if (t.dono && t.pagou && t.dono !== t.pagou) {
        add(t.pagou, v); add(t.dono, -v);
        det.entre.push(t);
      }
      return;
    }
    if (mesDe(t.data) !== mes) return;
    if (t.tipo === TIPO.receita) {
      if (ehAjuste(t)) return;
      const recebeu = t.pagou || donoDaConta(db, t.conta);
      if (fam && t.dono === fam.id) {
        const f = partesFamilia(db, t, mes);
        add(recebeu, -t.valor);
        ps.forEach((p) => add(p.id, t.valor * (f[p.id] || 0)));
        det.receitas.push(t);
      } else if (t.dono && recebeu && t.dono !== recebeu) {
        add(recebeu, -t.valor); add(t.dono, t.valor);
        det.receitas.push(t);
      }
    } else if (t.tipo === TIPO.fatura) {
      const pagador = donoDaConta(db, t.conta);
      const cartao = porId(db.cartoes, t.cartao);
      if (cartao && pagador && cartao.dono !== pagador) { add(pagador, t.valor); add(cartao.dono, -t.valor); det.transferencias.push(t); }
    } else if (t.tipo === TIPO.transf) {
      if (/^ACE-/.test(t.grupoParc || '')) return; // transferência do acerto: já conta pela aba Acertos
      const de = donoDaConta(db, t.conta), para = donoDaConta(db, t.contaDestino);
      if (de && para && de !== para) { add(de, t.valor); add(para, -t.valor); det.transferencias.push(t); }
    }
  });
  db.rendas.forEach((r) => {
    // renda que caiu na conta do outro: quem recebeu deve repassar
    if (mesDe(r.data) !== mes) return;
    const recebeu = donoDaConta(db, r.conta);
    if (recebeu && r.pessoa && recebeu !== r.pessoa) { add(recebeu, -r.valor); add(r.pessoa, r.valor); }
  });
  db.acertos.forEach((a) => {
    if (a.mesRef !== mes) return;
    add(a.de, a.valor); add(a.para, -a.valor);
    det.acertos.push(a);
  });

  Object.keys(saldo).forEach((k) => (saldo[k] = arred(saldo[k])));
  det.famTotal = arred(det.famTotal);
  // Com duas pessoas: quem deve, para quem, quanto
  let resultado = null;
  if (ps.length === 2) {
    const [a, b] = ps;
    const v = saldo[a.id];
    if (Math.abs(v) >= 0.01) resultado = v < 0 ? { de: a.id, para: b.id, valor: arred(-v) } : { de: b.id, para: a.id, valor: arred(v) };
  }
  return { saldo, resultado, det, fracoes: fracoesRenda(db, mes) };
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
      const feito = ehRenda
        ? db.rendas.some((x) => x.recorrencia === r.id && mesDe(x.data) === m)
        : db.transacoes.some((x) => x.recorrencia === r.id && mesDe(x.data) === m);
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

// Cópia dos dados com os previstos do mês incluídos (para telas e somas de previsão)
export function comPrevistos(db, mes) {
  const p = previstosDoMes(db, mes);
  return { ...db, transacoes: [...db.transacoes, ...p.filter((x) => !x.ehRenda)], rendas: [...db.rendas, ...p.filter((x) => x.ehRenda)] };
}

export const tagsDe = (t) => String(t.tags || '').split(',').map((x) => x.trim()).filter(Boolean);
export function todasAsTags(db) {
  const s = new Set();
  [...db.transacoes, ...db.rendas, ...(db.recorrencias || [])].forEach((t) => tagsDe(t).forEach((x) => s.add(x)));
  return [...s].sort((a, b) => a.localeCompare(b, 'pt-BR'));
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
