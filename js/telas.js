// Telas do app (HTML gerado a partir do estado). As ações ficam em app.js:
// cada botão leva data-a="nomeDaAcao" e, se precisar, data-v / data-id.
import { esc, brl, brlSinal, dataCurta, dataBR, nomeMesAno, mesCurto, diaSemana, hojeISO, mesDe, somaMes, lerValor, arred } from './util.js';
import { ic } from './icones.js';
import * as R from './regras.js';
import * as T2 from './telas2.js';

const sens = (txt) => `<span class="valor-sens">${txt}</span>`;
const COR_CONTA = { Roxo: '#7C4DDB', Azul: '#3D7BE0', Verde: '#1E9E6E', Laranja: '#E8742A', Vermelho: '#D9485A', Preto: '#2A2F38', Cinza: '#6B7383' };
export const corConta = (c) => COR_CONTA[c] || '#6B7383';

// ---------------------------------------------------------------- apoio
export function apoio(E) {
  const db = E.db;
  const ps = R.pessoasReais(db).slice().sort((a, b) => (a.id < b.id ? -1 : 1));
  const fam = R.familia(db);
  const chave = (id) => (fam && id === fam.id ? 'familia' : ps[1] && id === ps[1].id ? 'giovanna' : 'demetrio');
  const gato = (id) => ({ familia: 'familia', giovanna: 'seringa', demetrio: 'davinci' }[chave(id)]);
  const classe = (id) => ({ familia: 'fam', giovanna: 'gio', demetrio: 'dem' }[chave(id)]);
  const nome = (id) => { const p = R.porId(db.pessoas, id); return p ? p.nome : '—'; };
  const avatar = (id, tam = 40) => {
    const g = gato(id);
    return `<img class="avatar" src="assets/${g}-rosto.webp" alt="" width="${g === 'familia' ? Math.round(tam * 1.5) : tam}" height="${tam}" style="height:${tam}px;width:${g === 'familia' ? Math.round(tam * 1.5) : tam}px">`;
  };
  const cat = (id) => {
    const c = R.porId(db.categorias, id);
    if (!c) return '';
    const g = c.grupo ? R.porId(db.categorias, c.grupo) : null;
    return g ? g.nome + ' › ' + c.nome : c.nome;
  };
  const catCurta = (id) => { const c = R.porId(db.categorias, id); return c ? c.nome : ''; };
  const conta = (id) => R.porId(db.contas, id);
  const cartao = (id) => R.porId(db.cartoes, id);
  const nomeConta = (id) => { const c = conta(id); if (!c) return ''; return ps.length > 1 && db.contas.filter((x) => x.nome === c.nome).length > 1 ? c.nome + ' · ' + nome(c.dono) : c.nome; };
  const origem = (t) => {
    if (t.tipo === R.TIPO.fatura) return nomeConta(t.conta) + ' → ' + ((cartao(t.cartao) || {}).nome || 'fatura');
    if (t.tipo === R.TIPO.transf) return nomeConta(t.conta) + ' → ' + nomeConta(t.contaDestino);
    if (t.cartao) return (cartao(t.cartao) || {}).nome || '';
    return nomeConta(t.conta) + (t.meio && t.meio !== 'Pix' ? ' · ' + t.meio : t.meio === 'Pix' ? ' · Pix' : '');
  };
  return { db, ps, fam, chave, gato, classe, nome, avatar, cat, catCurta, conta, cartao, nomeConta, origem, hoje: hojeISO() };
}

// Lista unificada do mês: transações + rendas + previstos das contas fixas
export function itensDoMes(E, A, mes) {
  const db = R.comPrevistos(E.db, mes);
  const itens = [];
  db.transacoes.forEach((t) => {
    const m = R.ehGasto(t) ? R.mesCompetencia(db, t) : (t.mesComp || mesDe(t.data));
    if (m === mes) itens.push({ k: t.virtual ? 'prev' : 'trn', t });
  });
  db.rendas.forEach((r) => {
    if ((r.mesComp || mesDe(r.data)) !== mes) return;
    const conta = A.conta(r.conta);
    itens.push({ k: r.virtual ? 'prev' : 'ren', t: { ...r, tipo: R.TIPO.receita, dono: r.pessoa, pagou: conta ? conta.dono : r.pessoa, ehRenda: true, status: r.virtual ? 'Previsto' : 'Confirmado' } });
  });
  itens.sort((a, b) => (a.t.data < b.t.data ? 1 : a.t.data > b.t.data ? -1 : (a.t.id < b.t.id ? 1 : -1)));
  return itens;
}

const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
export const FILTROS_PADRAO = { quem: 'tudo', tipo: 'todos', grupo: '', origem: '', tag: '', naoConf: false, busca: '' };
export const filtrosAtivos = (f) => ['grupo', 'origem', 'tag', 'busca'].filter((k) => f[k]).length + (f.naoConf ? 1 : 0);

function filtrar(E, A, itens, tudoNaFamilia = false) {
  const f = E.filtros || FILTROS_PADRAO;
  const p = E.perfil, fam = A.fam;
  const ehEntre = (t) => t.dono && t.pagou && t.dono !== t.pagou && !(fam && t.dono === fam.id);
  return itens.filter(({ t }) => {
    if (f.quem === 'entre') { if (!ehEntre(t)) return false; } else if (!R.visivelNoPerfil(E.db, t, p, tudoNaFamilia)) return false;
    if (f.quem === 'minhas' && t.dono !== p) return false;
    if (f.quem === 'familia' && !(fam && t.dono === fam.id)) return false;
    if (f.tipo === 'despesas' && !R.ehGasto(t)) return false;
    if (f.tipo === 'receitas' && t.tipo !== R.TIPO.receita) return false;
    if (f.tipo === 'transf' && t.tipo !== R.TIPO.fatura && t.tipo !== R.TIPO.transf) return false;
    if (f.grupo) { const c = R.porId(E.db.categorias, t.categoria); if (!c || (c.id !== f.grupo && c.grupo !== f.grupo)) return false; }
    if (f.origem && t.conta !== f.origem && t.cartao !== f.origem && t.contaDestino !== f.origem) return false;
    if (f.tag && !R.tagsDe(t).includes(R.normTag(f.tag))) return false;
    if (f.naoConf && (t.conferido || t.ehRenda || t.virtual)) return false;
    if (f.busca && !semAcento(t.desc + ' ' + (t.obs || '') + ' ' + (t.tags || '')).includes(semAcento(f.busca))) return false;
    return true;
  });
}

const sinalValor = (t) => (t.tipo === R.TIPO.receita || t.tipo === R.TIPO.estorno ? 1 : t.tipo === R.TIPO.despesa ? -1 : 0);
function valorItem(t) {
  const s = sinalValor(t);
  if (s > 0) return `<span class="valor rec">${sens('+ ' + brl(t.valor))}</span>`;
  if (s < 0) return `<span class="valor">${sens('− ' + brl(t.valor))}</span>`;
  return `<span class="valor soft">${sens(brl(t.valor))}</span>`;
}
const pillDono = (A, id) => (id ? `<span class="pill ${A.classe(id)}">${esc(A.nome(id))}</span>` : '');
const parcelaTxt = (t) => (t.totalParcelas > 1 ? ` ${t.parcela}/${t.totalParcelas}` : '');
const tagsTxt = (t) => R.tagsDe(t).map((x) => '#' + esc(x)).join(' ');

// Lista agrupada por dia, mais recente primeiro (cabeçalho "Sexta, 30/10")
function porDia(A, itens, E) {
  const grupos = [];
  [...itens].sort((a, b) => (a.t.data < b.t.data ? 1 : a.t.data > b.t.data ? -1 : 0)).forEach((x) => {
    const g = grupos[grupos.length - 1];
    if (g && g.data === x.t.data) g.itens.push(x); else grupos.push({ data: x.t.data, itens: [x] });
  });
  return grupos.map((g) => `<div class="secao-titulo" style="margin-top:12px"><span>${g.data === A.hoje ? 'Hoje' : diaSemana(g.data).replace(/^./, (c) => c.toUpperCase())}, ${dataCurta(g.data)}</span></div><div class="lista">${g.itens.map((x) => itemTransacao(E, A, x)).join('')}</div>`).join('');
}

function itemTransacao(E, A, { k, t }) {
  const sub = [t.virtual ? 'Previsto · conta fixa' : '', A.cat(t.categoria) || (t.ehRenda ? 'Renda' : t.tipo === R.TIPO.fatura ? 'Pagamento de fatura' : t.tipo === R.TIPO.transf ? 'Transferência' : ''), A.origem(t), tagsTxt(t)].filter(Boolean).join(' · ');
  const prev = t.status === 'Previsto' ? ' style="opacity:.6"' : '';
  return `<button class="item" data-a="abrirDetalhe" data-id="${esc(t.id)}" data-k="${k}"${prev}>
    <span class="principal-txt"><span class="titulo">${esc(t.desc || t.tipo)}${parcelaTxt(t)}${t.deduz ? ' <span class="pill neutra" style="height:18px;font-size:11px">deduz da renda</span>' : ''}</span><span class="sub">${sub}</span></span>
    <span style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">${valorItem(t)}${pillDono(A, t.dono)}</span>
  </button>`;
}

// ------------------------------------------------------------ entrada
export function telaEntrar(E) {
  return `<div class="carregando" style="gap:10px">
    <div class="gatos"><img src="assets/davinci-corpo.webp" alt="Davinci"><img src="assets/seringa-corpo.webp" alt="Seringa"></div>
    <h1 style="font-size:30px;font-weight:800;color:var(--text);letter-spacing:-0.6px;margin-top:8px">Economiau</h1>
    <p style="max-width:320px">As finanças da família, divididas do jeito certo.</p>
    ${E.erro ? `<div class="aviso-caixa" style="max-width:360px;margin-top:8px">${ic('aviso', 18)}<span>${esc(E.erro)}</span></div>` : ''}
    <button class="btn btn-pri" style="margin-top:18px;min-width:260px;background:#E9ECF1" data-a="entrar">
      <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.2l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.7 6c4.5-4.2 7-10.3 7-17.7z"/><path fill="#FBBC05" d="M10.6 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.9-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.8l8-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.7-6c-2.1 1.4-4.9 2.3-8.2 2.3-6.2 0-11.5-4.1-13.4-9.8l-8 6.1C6.6 42.6 14.6 48 24 48z"/></svg>
      Entrar com Google</button>
    <button class="link" style="margin-top:14px" data-a="entrarDemo">Experimentar com dados de exemplo</button>
    <p style="font-size:12px;max-width:320px;margin-top:20px">Os dados ficam só na planilha de vocês, no Google Drive.</p>
  </div>`;
}

export function telaConectar(E) {
  return `<div class="carregando" style="gap:12px">
    ${ic('planilha', 40)}
    <h1 style="font-size:22px;color:var(--text)">Conectar a planilha</h1>
    <p style="max-width:360px">Escolha a planilha do Economiau no seu Google Drive. O app só vai enxergar essa planilha, mais nada do seu Drive.</p>
    ${E.erro ? `<div class="aviso-caixa" style="max-width:380px">${ic('aviso', 18)}<span>${esc(E.erro)}</span></div>` : ''}
    <button class="btn btn-pri" style="min-width:260px;margin-top:8px" data-a="escolherPlanilha">Escolher a planilha</button>
    <button class="link" data-a="sair">Entrar com outra conta</button>
  </div>`;
}

export function telaNegado(E) {
  return `<div class="carregando" style="gap:12px">
    <img src="assets/familia-despesa.webp" alt="" style="height:160px">
    <h1 style="font-size:22px;color:var(--text)">Este e-mail não tem acesso</h1>
    <p style="max-width:360px"><strong>${esc(E.email)}</strong> não está na aba Pessoas da planilha. Peça para incluir o e-mail na coluna E-mail, ou entre com a conta certa.</p>
    <button class="btn btn-pri" style="min-width:240px" data-a="sair">Entrar com outra conta</button>
    <button class="link" data-a="trocarPlanilha">Escolher outra planilha</button>
  </div>`;
}

export const telaCarregando = (E) => `<div class="carregando"><div class="girando"></div><div>${esc(E.msgCarregando || 'Carregando…')}</div></div>`;
export const telaErro = (E) => `<div class="carregando" style="gap:12px">${ic('aviso', 36)}<h1 style="font-size:20px;color:var(--text)">Algo deu errado</h1><p style="max-width:380px">${esc(E.erro)}</p><button class="btn btn-pri" data-a="recarregar">Tentar de novo</button><button class="link" data-a="trocarPlanilha">Escolher outra planilha</button></div>`;

export function telaPerfis(E) {
  const A = apoio(E);
  const ops = [...A.ps, A.fam].filter(Boolean);
  return `<div style="min-height:100vh;min-height:100dvh;display:flex;align-items:center;justify-content:center;padding:calc(24px + env(safe-area-inset-top)) 16px 24px">
   <div style="width:100%;max-width:460px">
    <div class="gatos" style="height:200px"><img src="assets/davinci-corpo.webp" alt=""><img src="assets/seringa-corpo.webp" alt=""></div>
    <h1 style="font-size:24px;font-weight:800;text-align:center;margin-top:8px">Quem está usando?</h1>
    <p class="muted" style="text-align:center;margin-top:4px">Cada perfil mostra os próprios números. Dá para trocar a qualquer hora.</p>
    <div class="perfis">${ops.map((p) => `<button class="perfil-btn" data-a="escolherPerfil" data-id="${p.id}">${A.avatar(p.id, 56)}<span style="flex:1"><span style="display:block;font-size:17px;font-weight:800">${esc(p.nome)}</span><span class="muted" style="font-size:13px">${p.tipo === 'Família' ? 'Gastos da casa e o acerto entre vocês' : 'Gastos pessoais e a parte na família'}</span></span>${ic('seta', 18)}</button>`).join('')}</div>
   </div>
  </div>`;
}

// ------------------------------------------------------------- casca
const MENU = [
  ['', [['inicio', 'Início', 'inicio'], ['transacoes', 'Transações', 'transacoes']]],
  ['Fechamento do mês', [['conferencia', 'Conferência', 'ok'], ['faturas', 'Faturas', 'faturas'], ['acerto', 'Acerto', 'acerto']]],
  ['Patrimônio', [['investimentos', 'Investimentos', 'investir']]],
  ['Cadastros', [['contas', 'Contas e cartões', 'contas'], ['fixas', 'Contas fixas', 'repetir'], ['categorias', 'Categorias', 'etiqueta'], ['tags', 'Tags', 'etiqueta'], ['rendas', 'Rendas e divisão', 'rendas']]],
  ['', [['mais', 'Configurações', 'config']]],
];

export function casca(E, titulo, corpo, opcoes = {}) {
  const A = apoio(E);
  const rota = E.rota;
  const lateral = `<aside class="lateral">
    <div class="marca">Economiau</div>
    <button class="perfil-atual" data-a="ir" data-v="perfis">${A.avatar(E.perfil, 40)}<span style="flex:1;min-width:0"><span style="display:block;font-size:15px;font-weight:800">${esc(A.nome(E.perfil))}</span><span class="muted" style="font-size:12px">Trocar perfil</span></span>${ic('trocar', 16)}</button>
    <button class="btn btn-pri novo" data-a="novoLancamento">${ic('mais_', 18)}Novo lançamento</button>
    <nav aria-label="Navegação principal">${MENU.map(([t, itens]) => `<div>${t ? `<div class="grupo-t">${t}</div>` : ''}${itens.map(([id, n, i]) => `<a href="#/${id}" ${rota === id ? 'aria-current="page"' : ''}>${ic(i, 19)}<span>${n}</span>${id === 'acerto' && opcoes.acertoTxt ? `<span class="extra">${opcoes.acertoTxt}</span>` : ''}</a>`).join('')}</div>`).join('')}</nav>
    <div class="status"><span style="width:8px;height:8px;border-radius:4px;background:${E.banco && E.banco.demo ? 'var(--aviso)' : 'var(--receita)'}"></span>${E.banco && E.banco.demo ? 'Modo demonstração' : 'Planilha conectada'}<span style="margin-left:auto">v${E.versao}</span></div>
  </aside>`;
  const nav = `<nav class="nav-baixo" aria-label="Navegação">
    <a href="#/inicio" ${rota === 'inicio' ? 'aria-current="page"' : ''}>${ic('inicio', 22)}Início</a>
    <a href="#/transacoes" ${rota === 'transacoes' ? 'aria-current="page"' : ''}>${ic('transacoes', 22)}Transações</a>
    <button class="mais-btn" data-a="menuLancar" aria-label="Novo lançamento">${ic('mais_', 26)}</button>
    <a href="#/acerto" ${rota === 'acerto' ? 'aria-current="page"' : ''}>${ic('acerto', 22)}Acerto</a>
    <a href="#/mais" ${['mais', 'contas', 'rendas', 'faturas', 'fixas', 'conferencia', 'investimentos', 'categorias', 'tags'].includes(rota) ? 'aria-current="page"' : ''}>${ic('mais', 22)}Mais</a>
  </nav>`;
  const voltar = opcoes.voltar ? `<a class="icone-btn so-cel" href="#/${opcoes.voltar}" aria-label="Voltar">${ic('voltar', 22)}</a>` : '';
  let banner = E.sessaoExpirada ? `<div class="banner">${ic('aviso', 18)}<span>A sessão do Google expirou.</span><button class="btn btn-peq btn-sec" data-a="renovar">Continuar</button></div>` : '';
  if (E.banco && !E.banco.demo && !E.banco.temCampo('transacoes', 'tags')) banner += `<div class="banner">${ic('aviso', 18)}<span>Atualize a planilha para a versão 1.8 (rode o script de montagem) para usar tags, contas fixas e "deduz da renda".</span></div>`;
  return `<div class="casca ${E.ocultar ? 'oculto' : ''}">${lateral}
    <div class="principal">
      <header class="topo">${voltar}<h1>${titulo}</h1>${opcoes.acoes || ''}</header>
      ${banner}
      <main class="conteudo">${corpo}</main>
    </div>${nav}</div>`;
}

function seletorMes(E, acao = 'mudarMes') {
  return `<div style="display:flex;align-items:center;gap:2px;height:40px;padding:0 4px;border-radius:12px;background:var(--surf)">
    <button class="icone-btn" style="width:34px;height:34px" data-a="${acao}" data-v="-1" aria-label="Mês anterior">${ic('esq', 16)}</button>
    <span style="font-size:14px;font-weight:700;padding:0 4px;white-space:nowrap"><span class="so-largo">${nomeMesAno(E.mes)}</span><span class="so-curto">${mesCurto(E.mes)} ${E.mes.slice(0, 4)}</span></span>
    <button class="icone-btn" style="width:34px;height:34px" data-a="${acao}" data-v="1" aria-label="Próximo mês">${ic('seta', 16)}</button>
  </div>`;
}
const botaoOlho = (E) => `<button class="icone-btn" data-a="alternarOcultar" aria-label="${E.ocultar ? 'Mostrar valores' : 'Esconder valores'}">${ic(E.ocultar ? 'olhoFechado' : 'olho', 20)}</button>`;

// --------------------------------------------------------------- início
export function telaInicio(E) {
  const A = apoio(E);
  const db = E.db, mes = E.mes, p = E.perfil, fam = A.fam;
  const ehFam = fam && p === fam.id;
  const nomeM = nomeMesAno(mes).split(' ')[0].toLowerCase();
  const dbp = R.comPrevistos(db, mes);
  const gastos = R.gastosDoPerfil(db, p, mes);
  const previstos = R.gastosDoPerfil(dbp, p, mes, true);
  const ac = R.acertoDoMes(db, mes);
  const renda = R.rendaDoMes(db, mes);
  const ent = ehFam ? null : R.entradasDoMes(db, mes, p);
  const rendaPerfil = ehFam ? Object.values(renda).reduce((a, b) => a + b, 0) : ent.total;
  const contas = db.contas.filter((c) => R.ativo(c) && (ehFam || c.dono === p));
  const saldoTotal = contas.reduce((s, c) => s + R.saldoConta(db, c), 0);
  const cartoes = db.cartoes.filter((c) => R.ativo(c) && (ehFam || c.dono === p || R.pagaPorDe(db, c) === p));
  const itens = filtrar({ ...E, filtros: FILTROS_PADRAO }, A, itensDoMes(E, A, mes)).filter((x) => !x.t.virtual).slice(0, 6);
  const fr = R.fracoesRenda(db, mes).fracoes;
  const sobra = rendaPerfil - previstos;

  const kpis = `<div class="kpis">
    <div class="kpi"><div class="r">${ehFam ? 'Gastos da família' : 'Seus gastos'}</div><div class="v">${sens(brl(gastos))}</div><div class="s">${previstos > gastos ? 'com previstos ' + sens(brl(previstos)) : ehFam ? 'no mês' : 'pessoais + sua parte na família'}</div></div>
    <div class="kpi"><div class="r">${ehFam ? 'Renda da família' : 'Suas entradas'}</div><div class="v rec">${sens(brl(rendaPerfil))}</div><div class="s">${rendaPerfil ? (ehFam ? 'só o que entra na divisão · ' + A.ps.map((x) => A.nome(x.id) + ' ' + Math.round((fr[x.id] || 0) * 100) + '%').join(' · ') : (ent.outras ? sens(brl(ent.divisao)) + ' na divisão (' + Math.round((fr[p] || 0) * 100) + '%) + ' + sens(brl(ent.outras)) + ' de outras entradas' : 'divisão ' + Math.round((fr[p] || 0) * 100) + '%')) : 'nenhuma entrada lançada em ' + nomeM}</div></div>
    <div class="kpi"><div class="r">${ehFam ? 'Em todas as contas' : 'Nas suas contas'}</div><div class="v">${sens(brl(saldoTotal))}</div><div class="s">${contas.length} conta${contas.length === 1 ? '' : 's'}</div></div>
    <div class="kpi"><div class="r">Sobra do mês</div><div class="v ${sobra < 0 ? 'desp' : ''}">${sens(brlSinal(arred(sobra)))}</div><div class="s">${rendaPerfil ? 'renda ' + sens(brl(rendaPerfil)) + ' − gastos ' + sens(brl(previstos)) : (ehFam ? 'lance a renda de ' : 'lance as entradas de ') + nomeM + ' para calcular'}</div></div>
  </div>`;

  const acertoCard = (() => {
    const r = ac.resultado;
    if (!r) return `<a class="acerto-hero zerado" href="#/acerto">${ic('ok', 22)}<span style="flex:1"><strong>Acerto de ${esc(nomeM)} zerado</strong><span style="display:block;font-size:13px;color:#B8E9EC">Ninguém deve nada por enquanto.</span></span>${ic('seta', 18)}</a>`;
    return `<a class="acerto-hero" href="#/acerto">${A.avatar(r.de, 40)}${ic('acerto', 20, 'style="color:var(--f)"')}${A.avatar(r.para, 40)}<span style="flex:1;min-width:0"><span style="display:block;font-size:12.5px;color:#E8C9A6">Acerto do mês até agora</span><strong style="font-size:15px">${esc(A.nome(r.de))} transfere ${sens(brl(r.valor))} para ${esc(A.nome(r.para))}</strong></span>${ic('seta', 18)}</a>`;
  })();

  const contasCard = `<div class="bloco"><div class="secao-titulo"><span>Contas</span><a href="#/contas">Ver todas</a></div>
    <div class="lista">${contas.length ? contas.map((c) => `<a class="item" href="#/contas"><span class="chip-cor" style="background:${corConta(c.cor)}">${esc(c.nome[0] || '?')}</span><span class="principal-txt"><span class="titulo">${esc(A.nomeConta(c.id))}</span><span class="sub">${esc(c.tipo || '')}</span></span><span class="valor">${sens(brl(R.saldoConta(db, c)))}</span></a>`).join('') : `<div class="vazio">Nenhuma conta cadastrada. <button class="link" data-a="ir" data-v="contas">Cadastrar</button></div>`}</div></div>`;

  const faturasCard = cartoes.length ? `<div class="bloco"><div class="secao-titulo"><span>Faturas</span><a href="#/faturas">Ver faturas</a></div>
    <div class="lista">${cartoes.map((c) => {
      const f = R.faturaAtual(db, c, A.hoje);
      const total = f ? R.totalFatura(db, f.id) : 0;
      const sit = f ? R.situacaoFatura(db, f, A.hoje) : '';
      return `<a class="item" href="#/faturas"><span class="chip-cor" style="background:${corConta(c.cor)}">${esc(c.nome[0])}</span><span class="principal-txt"><span class="titulo">${esc(c.nome)}</span><span class="sub">${f ? sit + ' · vence ' + dataCurta(f.vencimento) : 'Sem fatura aberta'}</span></span><span class="valor">${sens(brl(total))}</span></a>`;
    }).join('')}</div></div>` : '';

  const prev = itensDoMes(E, A, mes).filter((x) => x.t.virtual && R.visivelNoPerfil(db, x.t, p)).sort((a, b) => (a.t.data < b.t.data ? -1 : 1));
  const fixasCard = prev.length ? `<div class="bloco"><div class="secao-titulo"><span>Contas fixas ainda não lançadas</span><a href="#/fixas">Ver todas</a></div>
    <div class="lista">${prev.slice(0, 5).map((x) => itemTransacao(E, A, x)).join('')}</div></div>` : '';

  const ultimos = `<div class="bloco larga"><div class="secao-titulo"><span>Últimos lançamentos</span><a href="#/transacoes">Ver todos</a></div>
    <div class="lista">${itens.length ? itens.map((x) => itemTransacao(E, A, x)).join('') : `<div class="vazio">Nada lançado em ${esc(nomeM)} ainda.</div>`}</div></div>`;

  const acoes = `${seletorMes(E)}${botaoOlho(E)}`;
  const corpo = `${kpis}<div style="margin-top:12px">${acertoCard}</div><div class="grade">${ultimos}${fixasCard}${contasCard}${faturasCard}</div>`;
  const titulo = `<button class="so-cel icone-btn" style="display:inline-flex;vertical-align:middle;margin:-6px 6px -6px -6px;width:auto;padding:0 4px" data-a="ir" data-v="perfis" aria-label="Trocar perfil">${A.avatar(p, 34)}</button>${ehFam ? 'Família' : 'Olá, ' + esc(A.nome(p))}`;
  return casca(E, titulo, corpo, { acoes, acertoTxt: ac.resultado ? brl(ac.resultado.valor).replace(',00', '') : '' });
}

// ---------------------------------------------------------- transações
export function telaTransacoes(E) {
  const A = apoio(E);
  const f = E.filtros || FILTROS_PADRAO;
  const todos = itensDoMes(E, A, E.mes);
  const itens = filtrar(E, A, todos, true);
  const ehFam = A.fam && E.perfil === A.fam.id;
  const QUEM = [['tudo', 'Tudo'], ['minhas', 'Só minhas'], ['familia', 'Da família'], ['entre', 'Entre vocês']].filter(([id]) => !(ehFam && (id === 'minhas' || id === 'familia')));
  const TIPOS = [['todos', 'Todos os tipos'], ['despesas', 'Despesas'], ['receitas', 'Receitas'], ['transf', 'Transferências']];
  const reais = itens.filter((x) => !x.t.virtual);
  const gastos = reais.filter(({ t }) => sinalValor(t) < 0).reduce((s, { t }) => s + t.valor, 0);
  const receitas = reais.filter(({ t }) => t.tipo === R.TIPO.receita).reduce((s, { t }) => s + t.valor, 0);
  const grupos = [];
  itens.forEach((x) => { const g = grupos[grupos.length - 1]; if (g && g.data === x.t.data) g.itens.push(x); else grupos.push({ data: x.t.data, itens: [x] }); });
  const cel = `<div class="lista-trans">${grupos.length ? grupos.map((g) => `<div class="secao-titulo"><span>${g.data === A.hoje ? 'Hoje' : diaSemana(g.data).replace(/^./, (c) => c.toUpperCase())}, ${dataCurta(g.data)}</span></div><div class="lista">${g.itens.map((x) => itemTransacao(E, A, x)).join('')}</div>`).join('') : '<div class="vazio">Nenhum lançamento com esses filtros.</div>'}</div>`;
  const parte = (t) => {
    if (!R.ehGasto(t) || ehFam) return '';
    const v = R.parteDe(E.db, t, E.perfil);
    return v ? sens(brl(Math.abs(v))) : '<span class="muted">não é sua</span>';
  };
  const pc = `<div class="tabela" role="table" aria-label="Transações">
    <div class="lin cab" role="row"><span>Data</span><span>Descrição</span><span>Categoria</span><span>Conta ou cartão</span><span>De quem</span><span>Pago por</span><span class="dir">Valor</span><span class="dir">${ehFam ? '' : 'Sua parte'}</span></div>
    ${itens.length ? itens.map(({ k, t }) => `<button class="lin" role="row" data-a="abrirDetalhe" data-id="${esc(t.id)}" data-k="${k}" ${t.status === 'Previsto' ? 'style="opacity:.6"' : ''}>
      <span class="muted">${dataCurta(t.data)}</span><span class="corta"><strong>${esc(t.desc || t.tipo)}${parcelaTxt(t)}</strong>${R.tagsDe(t).length ? ' <span class="muted" style="font-size:12px">' + tagsTxt(t) + '</span>' : ''}${t.virtual ? ' <span class="pill neutra" style="height:18px;font-size:11px">previsto</span>' : ''}</span><span class="corta soft">${esc(A.catCurta(t.categoria) || (t.ehRenda ? 'Renda' : ''))}</span><span class="corta soft">${esc(A.origem(t))}</span><span>${pillDono(A, t.dono)}</span><span class="soft">${esc(t.pagou ? A.nome(t.pagou) : '')}</span><span class="dir">${valorItem(t)}</span><span class="dir soft">${parte(t)}</span></button>`).join('') : '<div class="vazio">Nenhum lançamento com esses filtros.</div>'}
  </div>`;
  const n = filtrosAtivos(f);
  const corpo = `<div class="chips rolavel" role="group" aria-label="De quem" style="margin-bottom:8px">${QUEM.map(([id, nm]) => `<button class="chip" aria-pressed="${f.quem === id}" data-a="filtro" data-c="quem" data-v="${id}">${nm}</button>`).join('')}</div>
    <div class="chips rolavel" role="group" aria-label="Tipo" style="margin-bottom:10px">${TIPOS.map(([id, nm]) => `<button class="chip" aria-pressed="${f.tipo === id}" data-a="filtro" data-c="tipo" data-v="${id}">${nm}</button>`).join('')}
      <button class="chip" aria-pressed="${n > 0}" data-a="abrirFiltros">${ic('camadas', 16, 'style="vertical-align:-3px;margin-right:4px"')}Filtros${n ? ' (' + n + ')' : ''}</button>
      ${n ? '<button class="link" style="margin-left:4px" data-a="limparFiltros">Limpar</button>' : ''}</div>
    <div class="info-caixa" style="display:flex;gap:18px;flex-wrap:wrap;background:var(--surf)"><span><span class="muted">Gastos </span><strong>${sens(brl(gastos))}</strong></span><span><span class="muted">Entradas </span><strong class="rec">${sens(brl(receitas))}</strong></span><span class="muted">${reais.length} lançamento${reais.length === 1 ? '' : 's'}${itens.length > reais.length ? ' + ' + (itens.length - reais.length) + ' previsto' + (itens.length - reais.length === 1 ? '' : 's') : ''}</span></div>
    <div style="margin-top:8px">${cel}${pc}</div>`;
  return casca(E, 'Transações', corpo, { acoes: seletorMes(E) });
}

// ---------------------------------------------------------------- acerto
export function telaAcerto(E) {
  const A = apoio(E);
  const db = E.db, mes = E.mes;
  const ac = R.acertoDoMes(db, mes);
  const r = ac.resultado;
  const nomeM = nomeMesAno(mes).split(' ')[0].toLowerCase();
  const fr = ac.fracoes;
  const [p1, p2] = A.ps;
  if (!p1 || !p2) return casca(E, 'Acerto', '<div class="vazio">O acerto precisa de duas pessoas na aba Pessoas.</div>');
  const hero = r
    ? `<div class="acerto-hero" style="flex-wrap:wrap">${A.avatar(r.de, 56)}${ic('acerto', 24, 'style="color:var(--f)"')}${A.avatar(r.para, 56)}<div style="flex:1;min-width:220px"><div style="font-size:13px;color:#E8C9A6">Para fechar ${nomeM}</div><div style="font-size:22px;font-weight:800;letter-spacing:-0.4px">${esc(A.nome(r.de))} transfere ${sens(brl(r.valor))} para ${esc(A.nome(r.para))}</div></div>
       <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-pri" style="background:var(--f)" data-a="registrarAcerto">Marcar como acertado</button></div></div>`
    : `<div class="acerto-hero zerado">${ic('ok', 26)}<div><div style="font-size:18px;font-weight:800">${ac.det.acertos.length ? 'Mês acertado' : 'Ninguém deve nada'}</div><div style="font-size:13px;color:#B8E9EC">${ac.det.acertos.length ? 'O acerto de ' + nomeM + ' já foi registrado.' : 'Até agora os gastos de ' + nomeM + ' estão equilibrados.'}</div></div></div>`;
  const parte1 = ac.det.parteFam[p1.id] || 0, parte2 = ac.det.parteFam[p2.id] || 0;
  const pago1 = ac.det.pagoFam[p1.id] || 0, pago2 = ac.det.pagoFam[p2.id] || 0;
  const linha = (n, nota, a, b, forte) => `<div class="ag" style="padding:11px 0;border-top:1px solid var(--line);align-items:center"><span><span style="display:block;font-weight:${forte ? 800 : 600}">${n}</span><span class="muted" style="font-size:12.5px">${nota}</span></span><span style="text-align:right;font-weight:${forte ? 800 : 600}">${a}</span><span style="text-align:right;font-weight:${forte ? 800 : 600}">${b}</span></div>`;
  const pct = (id) => Math.round((fr.fracoes[id] || 0) * 100) + '%';
  const fx = (v) => (Math.abs(v) < 0.005 ? '—' : sens(brlSinal(arred(v))));
  const rotulo = (it) => {
    const o = it.obj;
    if (it.tipo === 'entre') return [esc(o.desc || 'Gasto') + ' de ' + esc(A.nome(o.dono)) + ' pago ' + (A.fam && R.quemPagou(db, o) === A.fam.id ? 'pela conta da Família' : 'por ' + esc(A.nome(R.quemPagou(db, o)))), dataCurta(o.data) + ' · ' + esc(A.origem(o))];
    if (it.tipo === 'fatura') return ['Fatura ' + esc((A.cartao(o.cartao) || {}).nome || '') + ' paga por outra conta', dataCurta(o.data) + ' · ' + esc(A.origem(o))];
    if (it.tipo === 'renda') return ['Renda de ' + esc(A.nome(o.pessoa)) + ' caiu em ' + esc(A.nomeConta(o.conta)), dataCurta(o.data)];
    if (it.tipo === 'invest') return [esc(o.desc), dataCurta(o.data) + ' · ' + esc(A.nomeConta(o.conta))];
    return [esc(o.desc || o.tipo), dataCurta(o.data) + ' · ' + esc(A.origem(o))];
  };
  const outros = ac.det.itens.map((it) => { const [n, nota] = rotulo(it); return linha(n, nota, fx(it.efeito[p1.id]), fx(it.efeito[p2.id])); }).join('');
  const entre = '';
  const acertos = ac.det.acertos.map((a) => linha('Acerto registrado', dataCurta(a.data) + ' · ' + esc(A.nome(a.de)) + ' → ' + esc(A.nome(a.para)), a.de === p1.id ? '+ ' + sens(brl(a.valor)) : '− ' + sens(brl(a.valor)), a.de === p2.id ? '+ ' + sens(brl(a.valor)) : '− ' + sens(brl(a.valor)))).join('');
  const tabelaFam = ac.det.famTotal || pago1 || pago2 ? linha('Parte de cada um', pct(p1.id) + ' e ' + pct(p2.id) + ' dos gastos da família', sens(brl(parte1)), sens(brl(parte2)))
    + linha('Quanto cada um pagou', 'contas, cartões e pix' + (ac.fracoesFamilia ? ' (o que saiu da conta da Família conta para os dois)' : ''), sens(brl(pago1)), sens(brl(pago2)))
    + linha('Diferença', 'positivo = pagou a mais', sens(brlSinal(arred(pago1 - parte1))), sens(brlSinal(arred(pago2 - parte2)))) : '';
  const conta = `<div class="cartao"><h2 style="font-size:16px;font-weight:800">Como chegamos nesse valor</h2>
    <div class="muted" style="font-size:13px;margin-top:2px">Gastos da família em ${nomeM}: ${sens(brl(ac.det.famTotal))}, divididos ${fr.mesUsado ? 'pela renda' + (fr.mesUsado !== mes ? ' de ' + nomeMesAno(fr.mesUsado).split(' ')[0] : '') : 'meio a meio (sem renda lançada)'} (${pct(p1.id)} e ${pct(p2.id)})</div>
    <div class="ag" style="margin-top:14px;font-size:12.5px;color:var(--muted);font-weight:600"><span></span><span style="text-align:right;color:var(--d-txt)">${esc(p1.nome)}</span><span style="text-align:right;color:var(--g-txt)">${esc(p2.nome)}</span></div>
    ${tabelaFam}
    ${outros ? `<div class="muted" style="font-size:12.5px;margin-top:14px">Outros lançamentos que mexem no acerto (positivo = tem a receber)</div>${outros}` : ''}${acertos}
    ${linha('Resultado', r ? esc(A.nome(r.de)) + ' transfere para ' + esc(A.nome(r.para)) : 'sem pendências', r ? (r.de === p1.id ? 'paga ' : 'recebe ') + sens(brl(r.valor)) : '—', r ? (r.de === p2.id ? 'paga ' : 'recebe ') + sens(brl(r.valor)) : '—', true)}
  </div>`;
  const corpo = `${hero}<div class="grade" style="margin-top:12px"><div class="larga">${conta}</div>
    <div class="cartao"><h2 style="font-size:15px;font-weight:800">Divisão pela renda</h2>
      <div style="display:flex;height:12px;margin-top:12px;border-radius:6px;overflow:hidden;gap:2px"><span style="width:${pct(p1.id)};background:#5B8AF0"></span><span style="flex:1;background:#2AAE78"></span></div>
      <div style="display:flex;justify-content:space-between;margin-top:8px;font-size:13.5px"><strong style="color:var(--d-txt)">${esc(p1.nome)} ${pct(p1.id)}</strong><strong style="color:var(--g-txt)">${esc(p2.nome)} ${pct(p2.id)}</strong></div>
      <a class="link" href="#/rendas" style="display:inline-block;margin-top:10px">Ver rendas e divisão</a></div></div>`;
  return casca(E, 'Acerto', corpo, { acoes: seletorMes(E) });
}

// ----------------------------------------------------- contas e cartões
export function telaContas(E) {
  const A = apoio(E);
  const db = E.db;
  const grupo = (p) => {
    const cs = db.contas.filter((c) => c.dono === p.id && R.ativo(c));
    const ks = db.cartoes.filter((c) => c.dono === p.id && R.ativo(c));
    return `<div class="secao-titulo"><span style="color:var(--${{ gio: 'g', dem: 'd', fam: 'f' }[A.classe(p.id)]}-txt)">${p.tipo === 'Família' ? 'Da família' : (A.classe(p.id) === 'gio' ? 'Da ' : 'Do ') + esc(p.nome)}</span></div>
      <div class="lista">${cs.map((c) => `<button class="item" data-a="editarConta" data-id="${c.id}"><span class="chip-cor" style="background:${corConta(c.cor)}">${esc(c.nome[0] || '?')}</span><span class="principal-txt"><span class="titulo">${esc(c.nome)}</span><span class="sub">${esc(c.tipo || 'Conta')}</span></span><span class="valor">${sens(brl(R.saldoConta(db, c)))}</span></button>`).join('')}
      ${ks.map((c) => `<button class="item" data-a="editarCartao" data-id="${c.id}"><span class="chip-cor" style="background:${corConta(c.cor)}">${ic('cartao', 18)}</span><span class="principal-txt"><span class="titulo">${esc(c.nome)}</span><span class="sub">Fecha dia ${c.fecha} · vence dia ${c.vence}${R.pagaPorDe(db, c) !== c.dono ? ' · paga: ' + esc(A.nome(R.pagaPorDe(db, c))) : ''}${c.limite ? ' · limite ' + sens(brl(c.limite)) : ''}</span></span>${ic('seta', 18, 'style="color:var(--muted)"')}</button>`).join('')}
      ${!cs.length && !ks.length ? '<div class="vazio">Nada cadastrado.</div>' : ''}</div>`;
  };
  const arquivados = [...db.contas, ...db.cartoes].filter((c) => !R.ativo(c));
  const corpo = `<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-pri btn-peq" data-a="novaConta">${ic('mais_', 16)}Nova conta</button><button class="btn btn-sec btn-peq" data-a="novoCartao">${ic('mais_', 16)}Novo cartão</button></div>
    <div class="grade" style="margin-top:4px">${[...A.ps, A.fam].filter(Boolean).filter((p) => p.tipo === 'Pessoa' || db.contas.some((c) => c.dono === p.id) || db.cartoes.some((c) => c.dono === p.id)).map((p) => `<div>${grupo(p)}</div>`).join('')}</div>
    ${arquivados.length ? `<div class="secao-titulo"><span>Arquivados</span></div><div class="lista">${arquivados.map((c) => `<button class="item" data-a="${c.fecha ? 'editarCartao' : 'editarConta'}" data-id="${c.id}" style="opacity:.6"><span class="principal-txt"><span class="titulo">${esc(c.nome)}</span><span class="sub">${esc(A.nome(c.dono))}</span></span></button>`).join('')}</div>` : ''}`;
  return casca(E, 'Contas e cartões', corpo, { voltar: 'mais' });
}

// ------------------------------------------------------------- faturas
export function telaFaturas(E) {
  const A = apoio(E);
  const db = E.db;
  const cartoes = db.cartoes.filter(R.ativo);
  if (!cartoes.length) return casca(E, 'Faturas', `<div class="vazio">Nenhum cartão cadastrado. <button class="link" data-a="novoCartao">Cadastrar cartão</button></div>`, { voltar: 'mais' });
  // primeiro a pessoa (de quem é o cartão), depois os cartões dela
  const donos = [...A.ps, A.fam].filter((p) => p && cartoes.some((c) => c.dono === p.id));
  const cartaoAntes = R.porId(cartoes, E.cartaoSel);
  const dono = R.porId(donos, E.faturasDono) || (cartaoAntes && R.porId(donos, cartaoAntes.dono)) || R.porId(donos, E.perfil) || donos[0];
  const meus = dono ? cartoes.filter((c) => c.dono === dono.id) : cartoes;
  const sel = R.porId(meus, E.cartaoSel) || meus[0];
  const lista = R.faturasDoCartao(db, sel.id);
  const atual = R.faturaAtual(db, sel, A.hoje);
  const fSel = R.porId(lista, E.faturaSel) || atual || lista[lista.length - 1];
  const tabsDono = donos.length > 1 ? `<div class="donos" role="tablist" style="grid-template-columns:repeat(${donos.length},1fr);margin-bottom:12px">${donos.map((p) => `<button role="tab" class="${A.classe(p.id)}" aria-checked="${p.id === dono.id}" data-a="selDonoFatura" data-id="${p.id}">${esc(p.nome)}</button>`).join('')}</div>` : '';
  const tabsCartao = `${tabsDono}<div class="chips" role="tablist" style="margin-bottom:10px">${meus.map((c) => `<button class="chip" role="tab" aria-pressed="${c.id === sel.id}" data-a="selCartao" data-id="${c.id}">${esc(c.nome)}</button>`).join('')}</div>`;
  if (!fSel) return casca(E, 'Faturas', tabsCartao + '<div class="vazio">Este cartão ainda não tem compras.</div>', { voltar: 'mais' });
  const i = lista.indexOf(fSel);
  const ant = lista[i - 1], prox = lista[i + 1];
  const compras = db.transacoes.filter((t) => t.fatura === fSel.id && R.ehGasto(t)).sort((a, b) => (a.data < b.data ? 1 : -1));
  const total = R.totalFatura(db, fSel.id);
  const sit = R.situacaoFatura(db, fSel, A.hoje);
  const famT = compras.filter((t) => A.fam && t.dono === A.fam.id).reduce((s, t) => s + (t.tipo === R.TIPO.estorno ? -t.valor : t.valor), 0);
  const pagos = db.transacoes.filter((t) => t.tipo === R.TIPO.fatura && t.fatura === fSel.id).reduce((s, t) => s + t.valor, 0);
  const corpo = `${tabsCartao}
    <div class="cartao">
      <div style="display:flex;align-items:center;gap:8px">
        <button class="icone-btn" data-a="selFatura" data-id="${ant ? ant.id : ''}" ${ant ? '' : 'disabled style="opacity:.3"'} aria-label="Fatura anterior">${ic('esq', 18)}</button>
        <div style="flex:1;text-align:center"><div style="font-weight:800">Fatura de ${dataBR(fSel.vencimento)}</div><div class="muted" style="font-size:12.5px">conta como gasto de ${nomeMesAno(fSel.mesRenda).toLowerCase()}</div></div>
        <button class="icone-btn" data-a="selFatura" data-id="${prox ? prox.id : ''}" ${prox ? '' : 'disabled style="opacity:.3"'} aria-label="Próxima fatura">${ic('seta', 18)}</button>
      </div>
      <div style="display:flex;align-items:flex-end;gap:12px;margin-top:14px"><div style="flex:1"><div class="muted" style="font-size:13px">${sit === 'Aberta' ? 'Valor até agora' : 'Valor da fatura'}</div><div class="resumo-grande">${sens(brl(total))}</div></div><span class="pill ${sit === 'Paga' ? 'ok' : sit === 'Fechada' ? 'aviso' : 'neutra'}">${sit}</span></div>
      <div class="muted" style="font-size:13px;margin-top:6px">Fecha ${dataBR(fSel.fechamento)} · vence ${dataBR(fSel.vencimento)} <button class="link" data-a="alterarFechamento" data-id="${fSel.id}">alterar</button></div>
      <div class="chips" style="margin-top:10px"><span class="pill fam">Família ${sens(brl(famT))}</span><span class="pill neutra">Pessoal ${sens(brl(total - famT))}</span>${pagos ? `<span class="pill ok">Pago ${sens(brl(pagos))}</span>` : ''}</div>
      ${sit !== 'Paga' && total > 0 ? `<button class="btn btn-pri btn-largo" style="margin-top:14px" data-a="pagarFatura" data-id="${fSel.id}">Pagar fatura</button>` : ''}
    </div>
    <div class="secao-titulo"><span>${compras.length} compra${compras.length === 1 ? '' : 's'}</span></div>
    ${compras.length ? porDia(A, compras.map((t) => ({ k: 'trn', t })), E) : '<div class="lista"><div class="vazio">Nenhuma compra nesta fatura.</div></div>'}`;
  return casca(E, 'Faturas', corpo, { voltar: 'mais' });
}

// -------------------------------------------------------------- rendas
export function telaRendas(E) {
  const A = apoio(E);
  const db = E.db, mes = E.mes;
  const fam = A.fam;
  const fr = R.fracoesRenda(db, mes);
  const renda = R.rendaDoMes(db, mes);
  const ded = R.deducoesDoMes(db, mes);
  const temDed = Object.values(ded).some((v) => v > 0);
  const [p1, p2] = A.ps;
  const pct = (id) => Math.round((fr.fracoes[id] || 0) * 100);
  const regra = (fam && fam.divisaoPadrao) || 'Proporcional à renda';
  const lista = (p) => {
    const rs = db.rendas.filter((r) => r.pessoa === p.id && mesDe(r.data) === mes);
    return `<div class="secao-titulo"><span style="display:flex;align-items:center;gap:8px">${A.avatar(p.id, 26)}${esc(p.nome)}</span><strong style="color:var(--text)">${sens(brl(renda[p.id] || 0))}</strong></div>
      <div class="lista">${rs.length ? rs.map((r) => `<button class="item" data-a="abrirDetalhe" data-k="ren" data-id="${r.id}"><span class="principal-txt"><span class="titulo">${esc(r.desc || 'Renda')}</span><span class="sub">${dataCurta(r.data)} · ${esc(A.nomeConta(r.conta) || '')}</span></span><span class="valor rec">${sens(brl(r.valor))}</span></button>`).join('') : '<div class="vazio">Nenhuma renda lançada neste mês.</div>'}</div>`;
  };
  const corpo = `<div class="cartao">
      <div class="muted" style="font-size:13px">Divide todos os gastos da família de ${nomeMesAno(mes).split(' ')[0].toLowerCase()}</div>
      ${p1 && p2 ? `<div style="display:flex;justify-content:space-between;align-items:baseline;margin-top:8px"><span style="font-size:26px;font-weight:800;color:var(--d)">${pct(p1.id)}%</span><span style="font-size:26px;font-weight:800;color:var(--g)">${pct(p2.id)}%</span></div>
      <div style="display:flex;gap:3px;height:12px;margin-top:8px"><span style="width:${pct(p1.id)}%;border-radius:6px 2px 2px 6px;background:var(--d)"></span><span style="flex:1;border-radius:2px 6px 6px 2px;background:var(--g)"></span></div>
      <div style="display:flex;justify-content:space-between;margin-top:8px;font-size:13px"><span><strong>${esc(p1.nome)}</strong> <span class="muted">${sens(brl(renda[p1.id] || 0))}</span></span><span><span class="muted">${sens(brl(renda[p2.id] || 0))}</span> <strong>${esc(p2.nome)}</strong></span></div>` : ''}
      ${temDed ? `<div class="info-caixa" style="margin-top:12px">${A.ps.filter((p) => ded[p.id] > 0).map((p) => `${esc(p.nome)}: renda ${sens(brl(renda[p.id] || 0))} − gastos de trabalho ${sens(brl(ded[p.id]))} = <strong>${sens(brl(Math.max(0, (renda[p.id] || 0) - ded[p.id])))}</strong> na divisão`).join('<br>')}</div>` : ''}
      ${fr.mesUsado && fr.mesUsado !== mes ? `<div class="aviso-caixa" style="margin-top:12px">${ic('aviso', 18)}<span>Sem renda lançada neste mês: usando a de ${nomeMesAno(fr.mesUsado).toLowerCase()} até lançarem.</span></div>` : ''}
      <div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--line)"><div class="muted" style="font-size:12.5px;margin-bottom:8px">Regra da divisão (vale para os gastos novos)</div>
        <div class="chips">${['Proporcional à renda', '50/50', 'Personalizada'].map((x) => `<button class="chip" aria-pressed="${regra === x}" data-a="mudarRegra" data-v="${x}">${x === 'Proporcional à renda' ? 'Pela renda' : x === '50/50' ? 'Meio a meio' : 'Personalizada'}</button>`).join('')}</div>
        ${regra === 'Personalizada' ? `<div class="muted" style="font-size:12.5px;margin-top:8px">O percentual fixo de cada um fica na coluna "% fixo na divisão" da aba Pessoas.</div>` : ''}
      </div>
    </div>
    <button class="btn btn-sec btn-largo" style="margin-top:12px" data-a="novaRenda">${ic('mais_', 18)}Lançar renda</button>
    <div class="grade">${A.ps.map((p) => `<div>${lista(p)}</div>`).join('')}</div>`;
  return casca(E, 'Rendas e divisão', corpo, { voltar: 'mais', acoes: seletorMes(E) });
}

// ---------------------------------------------------------------- mais
export function telaMais(E) {
  const A = apoio(E);
  const link = (rota, icone, n, sub) => `<a class="item" href="#/${rota}">${ic(icone, 22, 'style="color:var(--muted)"')}<span class="principal-txt"><span class="titulo">${n}</span>${sub ? `<span class="sub">${sub}</span>` : ''}</span>${ic('seta', 18)}</a>`;
  const corpo = `<div class="lista">
      <button class="item" data-a="ir" data-v="perfis">${A.avatar(E.perfil, 36)}<span class="principal-txt"><span class="titulo">${esc(A.nome(E.perfil))}</span><span class="sub">Trocar perfil</span></span>${ic('trocar', 18)}</button>
    </div>
    <div class="secao-titulo"><span>Fechamento do mês</span></div>
    <div class="lista">${link('conferencia', 'ok', 'Conferência', 'Faturas e saldos × banco')}${link('faturas', 'faturas', 'Faturas', 'Compras por fatura, pagar e alterar fechamento')}${link('acerto', 'acerto', 'Acerto', 'Quem deve quanto no mês')}</div>
    <div class="secao-titulo"><span>Patrimônio</span></div>
    <div class="lista">${link('investimentos', 'investir', 'Investimentos', 'Valor líquido, IR e índices do dia')}</div>
    <div class="secao-titulo"><span>Cadastros</span></div>
    <div class="lista">${link('contas', 'contas', 'Contas e cartões')}${link('fixas', 'repetir', 'Contas fixas', 'Aluguel, internet, assinaturas, salário')}${link('categorias', 'etiqueta', 'Categorias', 'Criar, renomear, mover e arquivar')}${link('tags', 'etiqueta', 'Tags', 'Renomear, juntar e excluir')}${link('rendas', 'rendas', 'Rendas e divisão')}</div>
    <div class="secao-titulo"><span>App</span></div>
    <div class="lista">
      <button class="item" data-a="alternarOcultar">${ic(E.ocultar ? 'olhoFechado' : 'olho', 22, 'style="color:var(--muted)"')}<span class="principal-txt"><span class="titulo">${E.ocultar ? 'Mostrar valores' : 'Esconder valores'}</span></span></button>
      <button class="item" data-a="recarregar">${ic('repetir', 22, 'style="color:var(--muted)"')}<span class="principal-txt"><span class="titulo">Atualizar dados da planilha</span><span class="sub">${esc(E.banco ? E.banco.titulo : '')}</span></span></button>
      ${E.banco && !E.banco.demo ? `<a class="item" href="https://docs.google.com/spreadsheets/d/${esc(E.banco.id)}" target="_blank" rel="noopener">${ic('planilha', 22, 'style="color:var(--muted)"')}<span class="principal-txt"><span class="titulo">Abrir a planilha</span></span></a>` : ''}
      <button class="item" data-a="trocarPlanilha">${ic('planilha', 22, 'style="color:var(--muted)"')}<span class="principal-txt"><span class="titulo">${E.banco && E.banco.demo ? 'Sair da demonstração' : 'Trocar de planilha'}</span></span></button>
      <button class="item" data-a="sair">${ic('sair', 22, 'style="color:var(--despesa)"')}<span class="principal-txt"><span class="titulo">Sair</span><span class="sub">${esc(E.email || '')}</span></span></button>
    </div>
    <p class="muted" style="text-align:center;font-size:12px;margin-top:20px">Economiau ${E.versao}</p>`;
  return casca(E, 'Mais', corpo);
}

// --------------------------------------------------------- contas fixas
export function telaFixas(E) {
  const A = apoio(E);
  const db = E.db;
  const v18 = E.banco.temCampo('recorrencias', 'tipo');
  const lista = (db.recorrencias || []).slice().sort((a, b) => a.dia - b.dia);
  const ativas = lista.filter((r) => R.recorrenciaAtiva(r, E.mes));
  const outras = lista.filter((r) => !R.recorrenciaAtiva(r, E.mes));
  const prev = R.previstosDoMes(db, E.mes);
  const item = (r) => {
    const origem = r.cartao ? (A.cartao(r.cartao) || {}).nome : A.nomeConta(r.conta);
    const pend = prev.some((p) => p.recorrencia === r.id);
    const ehEntrada = r.tipo === 'Renda' || r.tipo === 'Receita';
    return `<button class="item" data-a="editarFixa" data-id="${r.id}" ${R.ativo(r) ? '' : 'style="opacity:.55"'}><span class="principal-txt"><span class="titulo">${esc(r.desc)}</span><span class="sub">Todo dia ${r.dia}${r.fim ? ' até ' + mesCurto(mesDe(r.fim)) + '/' + r.fim.slice(0, 4) : ''} · ${esc(origem || '')} · ${esc(A.nome(r.dono))}${r.tipo === 'Renda' ? ' · renda' : ''}</span></span>
      <span style="display:flex;flex-direction:column;align-items:flex-end;gap:4px"><span class="valor ${ehEntrada ? 'rec' : ''}">${sens((ehEntrada ? '+ ' : '− ') + brl(r.valor))}</span>${R.ativo(r) ? `<span class="pill ${pend ? 'aviso' : 'ok'}">${pend ? 'falta lançar' : 'lançada'}</span>` : '<span class="pill neutra">encerrada</span>'}</span></button>`;
  };
  const corpo = `${v18 ? '' : '<div class="aviso-caixa" style="margin-bottom:12px">Rode o script da planilha versão 1.8 para criar contas fixas.</div>'}
    <p class="muted" style="font-size:13.5px">Para criar uma conta fixa, faça um lançamento normal e ligue "Repetir todo mês". Ela aparece como prevista nos meses seguintes até alguém confirmar.</p>
    <div class="secao-titulo"><span>Em ${esc(nomeMesAno(E.mes).split(' ')[0].toLowerCase())}</span><span>${prev.length} falta${prev.length === 1 ? '' : 'm'} lançar</span></div>
    <div class="lista">${ativas.length ? ativas.map(item).join('') : '<div class="vazio">Nenhuma conta fixa ainda.</div>'}</div>
    ${outras.length ? `<div class="secao-titulo"><span>Encerradas ou ainda não começaram</span></div><div class="lista">${outras.map(item).join('')}</div>` : ''}`;
  return casca(E, 'Contas fixas', corpo, { voltar: 'mais', acoes: seletorMes(E) });
}

// ----------------------------------------------------------- categorias
export function usoCategoria(db, id) {
  const n = db.transacoes.filter((t) => t.categoria === id).length + (db.recorrencias || []).filter((r) => r.categoria === id).length;
  return n;
}
export function telaCategorias(E) {
  const db = E.db;
  const tipo = E.catTipo || 'Despesa';
  const grupos = db.categorias.filter((c) => c.tipo === tipo && !c.grupo).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  const ativos = grupos.filter(R.ativo), arquivados = db.categorias.filter((c) => c.tipo === tipo && !R.ativo(c));
  const usoTxt = (id) => { const n = usoCategoria(db, id); return n ? n + ' lançamento' + (n === 1 ? '' : 's') : 'sem uso'; };
  const bloco = (g) => {
    const subs = db.categorias.filter((c) => c.grupo === g.id && R.ativo(c)).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    return `<div class="bloco"><div class="lista">
      <button class="item" data-a="editarCategoria" data-id="${g.id}"><span class="principal-txt"><span class="titulo" style="font-weight:800">${esc(g.nome)}</span><span class="sub">${tipo === 'Despesa' && subs.length ? subs.length + ' subcategoria' + (subs.length === 1 ? '' : 's') + ' · ' + (() => { const n = usoCategoria(db, g.id) + subs.reduce((t, c) => t + usoCategoria(db, c.id), 0); return n ? n + ' lançamento' + (n === 1 ? '' : 's') + ' no grupo' : 'sem uso'; })() : usoTxt(g.id)}</span></span>${ic('lapis', 18, 'style="color:var(--muted)"')}</button>
      ${subs.map((c) => `<button class="item" style="padding-left:32px" data-a="editarCategoria" data-id="${c.id}"><span class="principal-txt"><span class="titulo">${esc(c.nome)}</span><span class="sub">${usoTxt(c.id)}</span></span>${ic('lapis', 16, 'style="color:var(--muted)"')}</button>`).join('')}
      ${tipo === 'Despesa' ? `<button class="item" style="padding-left:32px;color:var(--accent);font-weight:700" data-a="novaCategoria" data-id="${g.id}">${ic('mais_', 16)}<span style="font-size:14px">Subcategoria em ${esc(g.nome)}</span></button>` : ''}
    </div></div>`;
  };
  const corpo = `<div class="abas" role="tablist" style="max-width:420px">${['Despesa', 'Receita'].map((t) => `<button role="tab" aria-selected="${tipo === t}" data-a="catTipo" data-v="${t}">${t === 'Despesa' ? 'Despesas' : 'Receitas'}</button>`).join('')}</div>
    <button class="btn btn-pri btn-peq" style="margin-top:12px" data-a="novaCategoria" data-id="">${ic('mais_', 16)}${tipo === 'Despesa' ? 'Novo grupo' : 'Nova categoria'}</button>
    <p class="muted" style="font-size:13px;margin-top:10px">${tipo === 'Despesa' ? 'Os grupos (Moradia, Alimentação…) são usados nas metas e nos relatórios; as subcategorias detalham o gasto.' : 'Receitas não têm grupos.'} Toque para renomear, mover ou arquivar.</p>
    <div class="grade" style="margin-top:4px">${ativos.map(bloco).join('') || '<div class="vazio">Nenhuma categoria.</div>'}</div>
    ${arquivados.length ? `<div class="secao-titulo"><span>Arquivadas</span></div><div class="lista">${arquivados.map((c) => `<button class="item" style="opacity:.6" data-a="editarCategoria" data-id="${c.id}"><span class="principal-txt"><span class="titulo">${esc(c.nome)}</span><span class="sub">${c.grupo ? 'em ' + esc((R.porId(db.categorias, c.grupo) || {}).nome || '') : 'grupo'} · ${usoTxt(c.id)}</span></span></button>`).join('')}</div>` : ''}`;
  return casca(E, 'Categorias', corpo, { voltar: 'mais' });
}

export function telaTags(E) {
  const uso = R.usoDasTags(E.db);
  const corpo = `<p class="muted" style="font-size:13px">As tags são criadas nos lançamentos. Aqui dá para renomear (vale para todos os lançamentos que usam a tag), juntar duas tags dando o mesmo nome e excluir.</p>
    <div class="lista" style="margin-top:12px">${uso.length ? uso.map((x) => `<button class="item" data-a="editarTag" data-v="${esc(x.tag)}"><span class="principal-txt"><span class="titulo">#${esc(x.tag)}</span><span class="sub">${x.n} lançamento${x.n === 1 ? '' : 's'}</span></span>${ic('lapis', 18, 'style="color:var(--muted)"')}</button>`).join('') : '<div class="vazio">Nenhuma tag ainda. Elas aparecem aqui depois que você usar uma num lançamento.</div>'}</div>`;
  return casca(E, 'Tags', corpo, { voltar: 'mais' });
}

function modalTag(E, A, m) {
  const f = m.form;
  const novo = R.normTag(f.nome);
  const uso = R.usoDasTags(E.db);
  const n = (uso.find((x) => x.tag === f.tag) || {}).n || 0;
  const outra = novo && novo !== f.tag ? uso.find((x) => x.tag === novo) : null;
  const aviso = !novo ? '<div class="aviso-caixa" style="margin-top:10px">Digite um nome.</div>'
    : outra ? `<div class="info-caixa" style="margin-top:10px">Já existe #${esc(novo)} (${outra.n} lançamento${outra.n === 1 ? '' : 's'}). Ao salvar, as duas viram uma só.</div>`
    : novo !== f.tag ? `<div class="muted" style="font-size:13px;margin-top:8px">Vai mudar em ${n} lançamento${n === 1 ? '' : 's'}.</div>` : '';
  const corpo = `<label class="campo"><span>Nome</span><input class="entrada" data-campo="nome" value="${esc(f.nome)}" autocomplete="off"></label>
    ${aviso}
    <button class="btn btn-pri btn-largo" style="margin-top:18px" data-a="salvarTag" ${E.salvando ? 'aria-disabled="true"' : ''}>${E.salvando ? 'Salvando…' : outra ? 'Juntar as tags' : 'Renomear'}</button>
    <button class="btn btn-perigo btn-largo" style="margin-top:10px" data-a="excluirTag" ${E.salvando ? 'aria-disabled="true"' : ''}>Excluir a tag de ${n} lançamento${n === 1 ? '' : 's'}</button>`;
  return folha('#' + esc(f.tag), corpo);
}

function modalCategoria(E, A, m) {
  const f = m.form;
  const db = E.db;
  const original = f.id ? R.porId(db.categorias, f.id) : null;
  const temSubs = f.id && db.categorias.some((c) => c.grupo === f.id);
  const grupos = db.categorias.filter((c) => c.tipo === f.tipo && !c.grupo && R.ativo(c) && c.id !== f.id);
  const uso = f.id ? usoCategoria(db, f.id) : 0;
  const mudouGrupo = original && (original.grupo || '') !== (f.grupo || '');
  const podeSerSub = f.tipo === 'Despesa' && !temSubs;
  const corpo = `
    <label class="campo"><span>Nome</span><input class="entrada" data-campo="nome" value="${esc(f.nome)}" placeholder="Ex.: Feira"></label>
    ${podeSerSub ? `<label class="campo"><span>Grupo</span><select class="entrada" data-campo="grupo"><option value="">— é um grupo —</option>${grupos.map((g) => `<option value="${g.id}" ${f.grupo === g.id ? 'selected' : ''}>${esc(g.nome)}</option>`).join('')}</select></label>` : temSubs ? `<p class="muted" style="font-size:12.5px;margin-top:10px">É um grupo com subcategorias, por isso não pode virar subcategoria.</p>` : ''}
    ${mudouGrupo && uso ? `<div class="aviso-caixa" style="margin-top:12px">${ic('aviso', 18)}<span>Os ${uso} lançamentos antigos desta categoria passam a contar no novo grupo (nas metas e relatórios também).</span></div>` : ''}
    <button class="btn btn-pri btn-largo" style="margin-top:18px" data-a="salvarCategoria" ${E.salvando ? 'aria-disabled="true"' : ''}>${E.salvando ? 'Salvando…' : 'Salvar'}</button>
    ${f.id ? (uso || temSubs
      ? `<button class="btn btn-borda btn-largo" style="margin-top:8px" data-a="arquivarCategoria">${f.status === 'Arquivado' ? 'Reativar' : 'Arquivar'}</button><p class="muted" style="font-size:12.5px;margin-top:8px">${f.status === 'Arquivado' ? '' : 'Arquivada, ela some da escolha de categoria, mas os lançamentos antigos continuam com ela.' + (temSubs ? ' As subcategorias são arquivadas junto.' : '')}</p>`
      : `<button class="btn btn-perigo btn-largo" style="margin-top:8px" data-a="excluirCategoria">Excluir (sem lançamentos)</button>`) : ''}`;
  return folha(f.id ? 'Editar categoria' : f.grupo ? 'Nova subcategoria' : f.tipo === 'Despesa' ? 'Novo grupo' : 'Nova categoria', corpo);
}

// --------------------------------------------------------- primeiro uso
export function telaPrimeiro(E) {
  const A = apoio(E);
  const db = E.db;
  const temContas = db.contas.some(R.ativo);
  const temRenda = db.rendas.some((r) => mesDe(r.data) === mesDe(A.hoje));
  const passo = (ok, n, txt, sub, acao, rot) => `<div class="item" style="padding:14px 16px">${ok ? `<span class="check on">${ic('ok', 13, 'stroke-width="3.2"')}</span>` : `<span class="check" style="color:var(--muted);font-size:13px;font-weight:800">${n}</span>`}<span class="principal-txt"><span class="titulo">${txt}</span><span class="sub" style="white-space:normal">${sub}</span></span>${acao ? `<button class="btn btn-peq ${ok ? 'btn-sec' : 'btn-pri'}" data-a="${acao}">${rot}</button>` : ''}</div>`;
  const corpo = `<p class="muted">Faltam alguns cadastros para o app funcionar. Dá para completar depois em Mais › Contas e cartões.</p>
    <div class="lista" style="margin-top:14px">
      ${passo(true, 1, 'Planilha conectada', esc(E.banco.titulo), '', '')}
      ${passo(temContas, 2, 'Contas', temContas ? db.contas.filter(R.ativo).map((c) => esc(A.nomeConta(c.id))).join(', ') : 'Cadastre as contas de cada um com o saldo de hoje.', 'novaConta', temContas ? 'Mais uma' : 'Cadastrar')}
      ${passo(db.cartoes.some(R.ativo), 3, 'Cartões de crédito', db.cartoes.some(R.ativo) ? db.cartoes.filter(R.ativo).map((c) => esc(c.nome)).join(', ') : 'Com os dias reais de fechamento e vencimento.', 'novoCartao', db.cartoes.some(R.ativo) ? 'Mais um' : 'Cadastrar')}
      ${passo(temRenda, 4, 'Renda do mês', temRenda ? 'Lançada.' : 'Define a divisão dos gastos da família. Pode lançar quando o salário cair.', 'novaRenda', temRenda ? 'Mais uma' : 'Lançar')}
    </div>
    <button class="btn btn-pri btn-largo" style="margin-top:18px" data-a="concluirPrimeiro" ${temContas ? '' : 'aria-disabled="true"'}>Começar a usar</button>`;
  return casca(E, 'Primeiro acesso', corpo);
}

// ---------------------------------------------------------------- modais
export function modal(E) {
  const m = E.modal;
  if (!m) return '';
  const A = apoio(E);
  const fn = { lancar: modalLancar, detalhe: modalDetalhe, seletor: modalSeletor, conta: modalConta, cartao: modalCartao, renda: modalRenda, confirmar: modalConfirmar, fechamento: modalFechamento, menu: modalMenu, filtros: modalFiltros, fixa: modalFixa, categoria: modalCategoria, tag: modalTag, invest: T2.modalInvest, investForm: T2.modalInvestForm, mov: T2.modalMov }[m.tipo];
  return fn ? fn(E, A, m) : '';
}

const veu = (acao = 'fecharModal') => `<button class="veu" data-a="${acao}" aria-label="Fechar"></button>`;
const folha = (titulo, corpo, acao) => `${veu(acao)}<div class="folha" role="dialog" aria-label="${esc(titulo)}"><div class="alca"></div><h2>${esc(titulo)}</h2>${corpo}</div>`;
const marcado = (on) => `<span class="check">${on ? ic('ok', 13, 'stroke-width="3.2"') : ''}</span>`;

const dl = (A, id) => (A.classe(id) === 'gio' ? 'dela' : 'dele');
const sozinho = (A, id) => (A.classe(id) === 'gio' ? 'sozinha' : 'sozinho');
// Nome curto da regra de divisão de um gasto da família
export const nomeRegra = (r) => ({ '50/50': 'meio a meio', 'Proporcional à renda': 'pela renda', Personalizada: '% fixo', Individual: 'individual' }[r] || 'pela renda');
const TIPOS_LANC = [['despesa', 'Despesa'], ['receita', 'Receita'], ['cartao', 'Cartão'], ['transferencia', 'Transferir']];

function modalLancar(E, A, m) {
  const f = m.form;
  const db = E.db;
  const fam = A.fam;
  const valor = lerValor(f.valor);
  const estorno = f.tipo === 'cartao' && f.estorno;
  const cor = f.tipo === 'receita' || estorno ? 'var(--receita)' : f.tipo === 'transferencia' ? 'var(--text)' : 'var(--accent)';
  const arte = f.tipo === 'transferencia' ? '' : `<img class="lanc-arte" src="assets/${A.gato(f.dono)}-${f.tipo === 'receita' || estorno ? 'receita' : 'despesa'}.webp" alt="">`;
  const linha = (icone, conteudo, extra = '') => `<div class="linha-form" ${extra}>${ic(icone, 22)}${conteudo}</div>`;
  const escolha = (rot, val, acao, v) => `<button class="escolha" data-a="${acao}" data-v="${v || ''}"><span style="flex:1;min-width:0"><span class="rot">${rot}</span><span class="val">${val}</span></span>${ic('seta', 18, 'style="color:var(--muted)"')}</button>`;
  const contaTxt = (id) => { const c = A.conta(id); return c ? `${esc(A.nomeConta(id))} <span class="pill ${A.classe(c.dono)}" style="margin-left:6px">${esc(A.nome(c.dono))}</span>` : '<span class="muted">Escolher</span>'; };
  const cartaoTxt = (id) => { const c = A.cartao(id); return c ? `${esc(c.nome)} <span class="pill ${A.classe(c.dono)}" style="margin-left:6px">${esc(A.nome(c.dono))}</span>` : '<span class="muted">Escolher</span>'; };
  const interruptor = (on, acao, rotulo) => `<button class="chip" role="switch" aria-checked="${!!on}" aria-pressed="${!!on}" data-a="${acao}" aria-label="${rotulo}">${on ? 'Sim' : 'Não'}</button>`;
  const v18 = E.banco.temCampo('transacoes', 'tags');
  const ehPessoa = f.dono && !(fam && f.dono === fam.id);
  const parcelado = f.grupo && f.parcelas > 1;

  const datas = `<div class="chips">${[['hoje', 'Hoje'], ['ontem', 'Ontem'], ['outra', 'Outra data']].map(([id, n]) => `<button class="chip" aria-pressed="${f.dataModo === id}" data-a="lancData" data-v="${id}">${n}</button>`).join('')}</div>${f.dataModo === 'outra' ? `<input type="date" class="entrada" style="width:auto;height:36px" data-campo="data" value="${esc(f.data)}" ${parcelado ? 'disabled' : ''}>` : ''}`;
  const pagador = (() => {
    if (f.tipo === 'cartao') { const c = A.cartao(f.cartao); return c ? R.pagaPorDe(db, c) : ''; }
    const c = A.conta(f.conta); return c ? c.dono : '';
  })();

  // tags: escolhidas + sugestões + nova
  const minhas = f.tags || [];
  const todas = R.todasAsTags(db).filter((x) => !minhas.includes(x));
  const blocoTags = v18 ? `<div class="linha-form" style="align-items:flex-start">${ic('etiqueta', 22)}<div style="flex:1;min-width:0">
      <div class="chips" style="align-items:center">${minhas.map((x) => `<button class="chip" aria-pressed="true" data-a="tagTirar" data-v="${esc(x)}" aria-label="Tirar a tag ${esc(x)}">#${esc(x)} ✕</button>`).join('')}
        <input class="entrada-limpa" style="flex:1;min-width:120px;font-size:15px" placeholder="${minhas.length ? 'Outra tag' : 'Tags (opcional)'}" data-campo="tagNova" value="${esc(f.tagNova || '')}" autocomplete="off" enterkeyhint="done">
        ${f.tagNova ? `<button class="btn btn-peq btn-sec" data-a="tagAdicionar">Adicionar</button>` : ''}</div>
      ${todas.length ? `<div class="chips" style="margin-top:6px">${todas.slice(0, 12).map((x) => `<button class="chip" style="height:30px;font-size:12.5px" aria-pressed="false" data-a="tagPor" data-v="${esc(x)}">#${esc(x)}</button>`).join('')}</div>` : ''}
    </div></div>` : '';
  const blocoObs = linha('texto', `<textarea class="entrada-limpa auto-altura" rows="1" placeholder="Observação (opcional)" data-campo="obs" style="resize:none;font-family:inherit;line-height:1.4">${esc(f.obs || '')}</textarea>`, 'style="align-items:flex-start"');

  let corpo = '';
  if (f.recorrencia && !m.editando) corpo += `<div class="info-caixa" style="margin:12px 16px 4px">${ic('repetir', 16, 'style="vertical-align:-3px;margin-right:6px"')}Confirmando a conta fixa de ${esc(nomeMesAno(mesDe(f.data)).toLowerCase())}. Ajuste o valor se veio diferente.</div>`;
  if (f.tipo !== 'transferencia') {
    corpo += linha('calendario', datas, 'style="flex-wrap:wrap"');
    corpo += linha('texto', `<input class="entrada-limpa" placeholder="Descrição (ex.: Mercado do bairro)" data-campo="desc" value="${esc(f.desc)}" autocomplete="off">`);
    corpo += linha('etiqueta', escolha('Categoria', f.categoria ? esc(A.cat(f.categoria)) : '<span class="muted">Escolher categoria</span>', 'abrirSeletor', 'categoria'));
    if (f.tipo === 'cartao') {
      if (!m.editando) corpo = `<div style="padding:12px 16px 4px"><div class="abas">${[[false, 'Compra'], [true, 'Estorno / crédito']].map(([v, n]) => `<button aria-selected="${!!f.estorno === v}" data-a="lancEstorno" data-v="${v ? 1 : 0}">${n}</button>`).join('')}</div></div>` + corpo;
      const c = A.cartao(f.cartao);
      let sub = '';
      if (c) { const fat = R.faturaPara(db, c, f.data); sub = `<span class="rot" style="margin-top:2px">Fatura de ${dataCurta(fat.vencimento)} · conta em ${nomeMesAno(fat.mesRenda).split(' ')[0].toLowerCase()}</span>`; }
      corpo += linha('cartao', parcelado ? `<span style="flex:1"><span class="rot" style="display:block;font-size:12px;color:var(--muted)">Cartão</span><span class="val" style="font-weight:700">${cartaoTxt(f.cartao)}</span></span>` : `<button class="escolha" data-a="abrirSeletor" data-v="cartao"><span style="flex:1;min-width:0"><span class="rot">Cartão</span><span class="val">${cartaoTxt(f.cartao)}</span>${sub}</span>${ic('seta', 18, 'style="color:var(--muted)"')}</button>`);
      if (estorno) corpo += `<div class="muted" style="font-size:12.5px;padding:8px 16px 8px 52px">O valor volta como crédito na fatura da data do estorno e abate dos gastos do mês dela, pela mesma divisão.</div>`;
      else if (!m.editando) {
        corpo += linha('camadas', `<span style="flex:1;font-size:15px">Parcelas</span><span class="passo"><button data-a="parcelas" data-v="-1" aria-label="Menos parcelas">−</button><span class="v">${f.parcelas > 1 ? f.parcelas + 'x' : 'À vista'}</span><button data-a="parcelas" data-v="1" aria-label="Mais parcelas">+</button></span>`);
        if (f.parcelas > 1 && valor) corpo += `<div class="muted" style="font-size:12.5px;padding:0 16px 8px 52px">${f.parcelas}x de ${brl(R.valoresParcelas(valor, f.parcelas)[1] || valor)} · uma em cada fatura</div>`;
      } else if (parcelado) corpo += `<div class="muted" style="font-size:12.5px;padding:8px 16px">Parcela de uma compra parcelada. Ao salvar, você escolhe se a mudança vale só para esta parcela ou também para as próximas ainda não conferidas. Para mudar o cartão ou a data, exclua e lance de novo.</div>`;
    } else {
      corpo += linha('banco', escolha(f.tipo === 'receita' ? 'Caiu na conta' : 'Saiu da conta', contaTxt(f.conta), 'abrirSeletor', 'conta'));
      if (f.tipo === 'despesa') corpo += linha('cartao', `<div class="chips">${['Pix', 'Débito', 'Boleto', 'Débito automático', 'Dinheiro'].map((x) => `<button class="chip" aria-pressed="${f.meio === x}" data-a="lancMeio" data-v="${x}">${x}</button>`).join('')}</div>`);
    }
    // dono
    const ops = [fam, ...A.ps].filter(Boolean);
    let divTxt = '';
    if (valor && pagador) {
      if (fam && f.dono === fam.id) {
        const regraLanc = f.divisao || fam.divisaoPadrao || 'Proporcional à renda';
        const parts = R.partesFamilia(db, { divisao: regraLanc, pagou: pagador, valor }, f.tipo === 'cartao' && A.cartao(f.cartao) ? R.faturaPara(db, A.cartao(f.cartao), f.data).mesRenda : mesDe(f.data));
        const outro = A.ps.find((p) => p.id !== pagador);
        if (pagador === fam.id) divTxt = f.tipo === 'receita' ? 'Receita da família na conta da Família: nada a repassar.' : 'Gasto da família pago com o dinheiro da família: ninguém deve nada.';
        else if (f.tipo === 'receita') divTxt = outro ? `${esc(A.nome(pagador))} recebeu; a parte de ${esc(A.nome(outro.id))} é ${brl(valor * (parts[outro.id] || 0))}` : '';
        else if (estorno) divTxt = outro ? `O crédito caiu no cartão de ${esc(A.nome(pagador))}: abate <strong>${brl(valor * (parts[outro.id] || 0))}</strong> do que ${esc(A.nome(outro.id))} deve.` : '';
        else divTxt = outro ? `${esc(A.nome(outro.id))} deve a ${esc(A.nome(pagador))} a parte que lhe cabe: <strong>${brl(valor * (parts[outro.id] || 0))}</strong>` : '';
        if (pagador !== fam.id) {
          const regras = [['Proporcional à renda', 'Pela renda'], ['50/50', 'Meio a meio']];
          if (!regras.some(([v]) => v === regraLanc)) regras.push([regraLanc, nomeRegra(regraLanc).replace(/^./, (c) => c.toUpperCase())]);
          divTxt += `<div class="muted" style="font-size:12px;margin-top:4px">Da família · ${A.ps.map((p) => Math.round((parts[p.id] || 0) * 100)).join(' / ')} ${nomeRegra(regraLanc)}</div>
            <div class="chips" style="margin-top:8px">${regras.map(([v, n]) => `<button class="chip" aria-pressed="${regraLanc === v}" data-a="lancDivisao" data-v="${v}">${n}</button>`).join('')}</div>`;
        }
      } else if (fam && pagador === fam.id) {
        const outro = A.ps.find((p) => p.id !== f.dono);
        const ff = R.fracoesFamilia(db, mesDe(f.data));
        const parte = outro ? brl(valor * (ff[outro.id] || 0)) : '';
        divTxt = !outro ? '' : f.tipo === 'receita'
          ? `Caiu na conta da Família: ${esc(A.nome(outro.id))} fica devendo a ${esc(A.nome(f.dono))} a parte ${dl(A, outro.id)} nesse dinheiro: <strong>${parte}</strong>`
          : `Saiu da conta da Família: ${esc(A.nome(f.dono))} deve a ${esc(A.nome(outro.id))} a parte ${dl(A, outro.id)} nesse dinheiro: <strong>${parte}</strong>`;
        divTxt += `<div class="muted" style="font-size:12px;margin-top:4px">O dinheiro da conta da Família é dos dois · ${A.ps.map((p) => Math.round((ff[p.id] || 0) * 100)).join(' / ')}</div>`;
      } else if (f.dono === pagador) divTxt = f.tipo === 'receita' ? 'Caiu na conta de quem recebe: nada a repassar.' : estorno ? 'Crédito de quem gastou: nada a acertar.' : 'Pago por quem gastou: ninguém deve nada.';
      else divTxt = f.tipo === 'receita' ? `${esc(A.nome(pagador))} repassa <strong>${brl(valor)}</strong> para ${esc(A.nome(f.dono))}` : estorno ? `Abate <strong>${brl(valor)}</strong> do que ${esc(A.nome(f.dono))} deve a ${esc(A.nome(pagador))}` : `${esc(A.nome(f.dono))} deve <strong>${brl(valor)}</strong> a ${esc(A.nome(pagador))}`;
    }
    corpo += `<div class="linha-form" style="align-items:flex-start;flex-direction:column;gap:0">
      <span class="muted" style="font-size:12.5px">${f.tipo === 'receita' ? 'De quem é a receita' : estorno ? 'De quem era a compra' : 'De quem é a despesa'}</span>
      <div class="donos" role="radiogroup" style="width:100%">${ops.map((p) => `<button role="radio" class="${A.classe(p.id)}" aria-checked="${f.dono === p.id}" data-a="lancDono" data-id="${p.id}">${esc(p.nome)}</button>`).join('')}</div>
      ${divTxt ? `<div class="info-caixa" style="width:100%;margin-top:10px">${divTxt}</div>` : ''}
    </div>`;
    if (f.tipo === 'receita' && ehPessoa) {
      corpo += linha('rendas', `<span style="flex:1"><span style="display:block;font-size:15px">Conta como renda na divisão</span><span class="muted" style="font-size:12.5px">Salário, freelance. Desligue para reembolsos e vendas.</span></span>${interruptor(f.renda, 'lancRenda', 'Conta como renda na divisão')}`);
    }
    if ((f.tipo === 'despesa' || f.tipo === 'cartao') && !estorno && ehPessoa && v18) {
      corpo += linha('rendas', `<span style="flex:1"><span style="display:block;font-size:15px">Gasto de trabalho: deduz da renda</span><span class="muted" style="font-size:12.5px">O valor sai da renda de ${esc(A.nome(f.dono))} antes de calcular a divisão (ex.: luz do escritório em casa).</span></span>${interruptor(f.deduz, 'lancDeduz', 'Deduz da renda')}`);
    }
    if (!m.editando && !f.recorrencia && v18 && !estorno && !(f.tipo === 'cartao' && f.parcelas > 1)) {
      const meses = Number(f.repetirMeses) || 0;
      const ultimo = meses ? nomeMesAno(somaMes(mesDe(f.data), meses - 1)).toLowerCase() : '';
      corpo += linha('repetir', `<span style="flex:1"><span style="display:block;font-size:15px">Repetir todo mês</span><span class="muted" style="font-size:12.5px">${f.repetir ? 'Vira uma conta fixa: aparece como prevista todo dia ' + Number(f.data.slice(8, 10)) + (meses ? ' até ' + ultimo : '') + ', até alguém confirmar cada mês.' : 'Aluguel, internet, assinaturas, salário.'}</span></span>${interruptor(f.repetir, 'lancRepetir', 'Repetir todo mês')}`);
      if (f.repetir) corpo += `<div class="linha-form" style="flex-wrap:wrap;gap:10px;padding-left:52px"><div class="chips"><button class="chip" aria-pressed="${!meses}" data-a="repetirPor" data-v="0">Para sempre</button><button class="chip" aria-pressed="${!!meses}" data-a="repetirPor" data-v="${meses || 12}">Por um tempo</button></div>${meses ? `<span class="passo"><button data-a="repetirMeses" data-v="-1" aria-label="Um mês a menos">−</button><span class="v">${meses} ${meses === 1 ? 'mês' : 'meses'}</span><button data-a="repetirMeses" data-v="1" aria-label="Um mês a mais">+</button></span>` : ''}</div>`;
    }
    corpo += blocoTags + blocoObs;
  } else {
    corpo += `<div style="padding:12px 16px 0"><div class="abas">${[['fatura', 'Pagar fatura'], ['conta', 'Para outra conta']].map(([id, n]) => `<button aria-selected="${f.transf === id}" data-a="lancTransf" data-v="${id}" ${m.editando ? 'disabled' : ''}>${n}</button>`).join('')}</div></div>`;
    corpo += linha('calendario', datas, 'style="flex-wrap:wrap"');
    corpo += linha('banco', escolha('Sai da conta', contaTxt(f.conta), 'abrirSeletor', 'conta'));
    if (f.transf === 'fatura') {
      const c = A.cartao(f.cartao);
      let sub = '';
      if (c) { const fat = R.faturaAtual(db, c, A.hoje); sub = fat ? `<span class="rot" style="margin-top:2px">Fatura de ${dataCurta(fat.vencimento)} · ${brl(R.totalFatura(db, fat.id))}</span>` : '<span class="rot">Sem fatura em aberto</span>'; }
      corpo += linha('cartao', `<button class="escolha" data-a="abrirSeletor" data-v="cartao"><span style="flex:1;min-width:0"><span class="rot">Fatura do cartão</span><span class="val">${cartaoTxt(f.cartao)}</span>${sub}</span>${ic('seta', 18, 'style="color:var(--muted)"')}</button>`);
      const cc = A.conta(f.conta);
      const deve = c ? R.pagaPorDe(db, c) : '';
      if (c && cc && fam && cc.dono === fam.id) { const outro = A.ps.find((p) => p.id !== deve); const ff = R.fracoesFamilia(db, mesDe(f.data)); corpo += `<div class="info-caixa" style="margin:10px 16px">A fatura de ${esc(A.nome(deve))} está saindo da conta da Família: ${esc(A.nome(deve))} fica devendo a ${esc(A.nome(outro && outro.id))} a parte ${dl(A, outro && outro.id)}${valor && outro ? ': <strong>' + brl(valor * (ff[outro.id] || 0)) + '</strong>' : ''}.</div>`; }
      else if (c && cc && deve !== cc.dono) corpo += `<div class="info-caixa" style="margin:10px 16px">${esc(A.nome(cc.dono))} está pagando a fatura de ${esc(A.nome(deve))}: entra no acerto como crédito para ${esc(A.nome(cc.dono))}.</div>`;
      else corpo += `<div class="muted" style="font-size:12.5px;padding:10px 16px">O pagamento da fatura não conta de novo como despesa: as compras já foram lançadas.</div>`;
    } else {
      corpo += linha('banco', escolha('Entra na conta', contaTxt(f.contaDestino), 'abrirSeletor', 'contaDestino'));
      const a = A.conta(f.conta), b = A.conta(f.contaDestino);
      if (a && b && a.dono !== b.dono && fam && (a.dono === fam.id || b.dono === fam.id)) {
        const pessoa = a.dono === fam.id ? b.dono : a.dono;
        const outro = A.ps.find((p) => p.id !== pessoa);
        const ff = R.fracoesFamilia(db, mesDe(f.data));
        const parte = valor && outro ? ' <strong>' + brl(valor * (ff[outro.id] || 0)) + '</strong>' : '';
        const entra = b.dono === fam.id;
        if (!E.banco.temCampo('transacoes', 'foraAcerto')) corpo += `<div class="aviso-caixa" style="margin:10px 16px">Rode o script da planilha versão 1.11 para escolher se esta transferência divide ou não. Por enquanto ela divide.</div>`;
        corpo += linha('acerto', `<span style="flex:1"><span style="display:block;font-size:15px">Dividir no acerto</span><span class="muted" style="font-size:12.5px">${!f.foraAcerto
          ? (entra ? `O dinheiro passa a ser dos dois: ${esc(A.nome(outro && outro.id))} fica devendo a ${esc(A.nome(pessoa))} a parte ${dl(A, outro && outro.id)}` : `${esc(A.nome(pessoa))} tirou dinheiro dos dois: fica devendo a ${esc(A.nome(outro && outro.id))} a parte ${dl(A, outro && outro.id)}`) + parte + '.'
          : (entra ? `Reserva que ${esc(A.nome(pessoa))} guarda ${sozinho(A, pessoa)} para a família: não mexe no acerto.` : `${esc(A.nome(pessoa))} pegou de volta dinheiro que tinha guardado ${sozinho(A, pessoa)}: não mexe no acerto.`)}</span></span>${interruptor(!f.foraAcerto, 'lancForaAcerto', 'Dividir no acerto')}`);
      } else if (a && b && a.dono !== b.dono) corpo += `<div class="info-caixa" style="margin:10px 16px">Transferência entre vocês: entra no acerto do mês.</div>`;
    }
    corpo += linha('texto', `<input class="entrada-limpa" placeholder="Descrição (opcional)" data-campo="desc" value="${esc(f.desc)}" autocomplete="off">`);
    corpo += blocoTags + blocoObs;
  }

  const titulo = m.editando ? 'Editar lançamento' : f.recorrencia ? 'Confirmar conta fixa' : 'Novo lançamento';
  const botao = m.editando ? 'Salvar alteração' : { despesa: 'Salvar despesa', cartao: estorno ? 'Salvar estorno' : 'Salvar compra', receita: f.renda && ehPessoa ? 'Salvar renda' : 'Salvar receita', transferencia: f.transf === 'fatura' ? 'Registrar pagamento' : 'Salvar transferência' }[f.tipo];
  return `${veu()}<div class="tela-cheia" role="dialog" aria-label="${titulo}" style="--cor-valor:${cor}">
    <div style="display:flex;align-items:center;gap:4px;padding:calc(10px + env(safe-area-inset-top)) 12px 0 16px"><h1 style="flex:1;font-size:18px;font-weight:800">${titulo}</h1><button class="icone-btn" data-a="fecharModal" aria-label="Fechar">${ic('fechar', 22)}</button></div>
    ${m.editando || f.recorrencia ? '' : `<div style="padding:10px 16px 0;position:relative;z-index:2"><div class="abas" role="tablist">${TIPOS_LANC.map(([id, n]) => `<button role="tab" aria-selected="${f.tipo === id}" data-a="lancTipo" data-v="${id}">${n}</button>`).join('')}</div></div>`}
    <div class="rolar">
      <div class="lanc-valor">${arte}<label for="valor">${f.tipo === 'cartao' && f.parcelas > 1 && !m.editando ? 'Valor total da compra' : parcelado ? 'Valor desta parcela' : 'Valor'}</label><div class="linha"><span class="moeda">R$</span><input id="valor" inputmode="numeric" placeholder="0,00" data-campo="valor" data-mascara="dinheiro" value="${esc(f.valor)}" autocomplete="off"></div></div>
      <div class="lanc-folha">${corpo}</div>
    </div>
    <div class="rodape-fixo"><button class="btn btn-pri" style="min-width:220px;background:${cor === 'var(--text)' ? 'var(--text)' : cor}" data-a="salvarLancamento" ${E.salvando ? 'aria-disabled="true"' : ''}>${E.salvando ? 'Salvando…' : botao}</button></div>
  </div>`;
}

function modalMenu(E, A) {
  const op = (tipo, icone, nome, sub, cor) => `<button class="opcao" style="padding:14px" data-a="lancarTipo" data-v="${tipo}"><span class="chip-cor" style="background:${cor};color:#15181E">${ic(icone, 20, 'stroke-width="2.4"')}</span><span style="flex:1"><span style="display:block;font-weight:800;font-size:15.5px">${nome}</span><span class="muted" style="font-size:12.5px">${sub}</span></span>${ic('seta', 18)}</button>`;
  return folha('O que você quer lançar?', `<div style="margin-top:10px">
    ${op('despesa', 'banco', 'Despesa', 'Pix, débito, boleto ou dinheiro', 'var(--despesa)')}
    ${op('cartao', 'cartao', 'Compra no cartão', 'À vista ou parcelada, cai na fatura', 'var(--accent)')}
    ${op('receita', 'rendas', 'Receita', 'Salário, freelance, reembolso', 'var(--receita)')}
    ${op('transferencia', 'acerto', 'Transferência', 'Pagar fatura ou mandar para outra conta', 'var(--soft)')}
  </div>`);
}

function modalFiltros(E, A) {
  const f = E.filtros;
  const db = E.db;
  const grupos = db.categorias.filter((c) => !c.grupo && R.ativo(c));
  const origens = [...db.contas.filter(R.ativo).map((c) => [c.id, A.nomeConta(c.id)]), ...db.cartoes.filter(R.ativo).map((c) => [c.id, c.nome + ' (cartão)'])];
  const tags = R.todasAsTags(db);
  const corpo = `
    <label class="campo"><span>Buscar na descrição</span><input class="entrada" data-filtro="busca" value="${esc(f.busca)}" placeholder="Ex.: mercado" autocomplete="off"></label>
    <label class="campo"><span>Categoria</span><select class="entrada" data-filtro="grupo"><option value="">Todas</option>${grupos.map((g) => `<option value="${g.id}" ${f.grupo === g.id ? 'selected' : ''}>${esc(g.nome)}</option>`).join('')}</select></label>
    <label class="campo"><span>Conta ou cartão</span><select class="entrada" data-filtro="origem"><option value="">Todos</option>${origens.map(([id, n]) => `<option value="${id}" ${f.origem === id ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>
    <div class="campo"><span>Tag</span>${tags.length ? `<div class="chips">${tags.map((x) => `<button class="chip" aria-pressed="${f.tag === x}" data-a="filtroTag" data-v="${esc(x)}">#${esc(x)}</button>`).join('')}</div>` : '<div class="muted" style="font-size:13px">Nenhuma tag criada ainda. Elas aparecem aqui depois que você usar uma num lançamento.</div>'}</div>
    <div class="campo" style="display:flex;align-items:center;gap:10px"><span style="flex:1;margin:0;font-size:15px;color:var(--text)">Só os não conferidos</span><button class="chip" aria-pressed="${f.naoConf}" data-a="filtroNaoConf">${f.naoConf ? 'Sim' : 'Não'}</button></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:18px"><button class="btn btn-borda" data-a="limparFiltros">Limpar</button><button class="btn btn-pri" data-a="fecharModal">Ver resultados</button></div>`;
  return folha('Filtros', corpo);
}

function modalFixa(E, A, m) {
  const f = m.form;
  const origem = f.cartao ? (A.cartao(f.cartao) || {}).nome : A.nomeConta(f.conta);
  const corpo = `<p class="muted" style="margin:6px 4px 0;font-size:13px">${esc(f.tipo || 'Despesa')} · ${esc(origem || '')} · ${esc(A.nome(f.dono))}</p>
    <label class="campo"><span>Descrição</span><input class="entrada" data-campo="desc" value="${esc(f.desc)}"></label>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      <label class="campo"><span>Valor previsto (R$)</span><input class="entrada" inputmode="numeric" data-campo="valor" data-mascara="dinheiro" value="${esc(f.valor)}"></label>
      <div class="campo"><span>Todo dia</span><div class="passo"><button data-a="fixaDia" data-v="-1" aria-label="Um dia antes">−</button><span class="v">${f.dia}</span><button data-a="fixaDia" data-v="1" aria-label="Um dia depois">+</button></div></div>
    </div>
    <p class="muted" style="font-size:12.5px;margin-top:10px">Mudanças valem para os próximos previstos. O que já foi lançado não muda.</p>
    <button class="btn btn-pri btn-largo" style="margin-top:16px" data-a="salvarFixa" ${E.salvando ? 'aria-disabled="true"' : ''}>${E.salvando ? 'Salvando…' : 'Salvar'}</button>
    <button class="btn ${f.status === 'Arquivado' ? 'btn-borda' : 'btn-perigo'} btn-largo" style="margin-top:8px" data-a="encerrarFixa">${f.status === 'Arquivado' ? 'Reativar' : 'Encerrar esta conta fixa'}</button>`;
  return folha('Conta fixa', corpo);
}

function modalSeletor(E, A, m) {
  const f = E.modalPai.form;
  const db = E.db;
  let corpo = '';
  if (m.campo === 'categoria') {
    const tipo = f.tipo === 'receita' ? 'Receita' : 'Despesa';
    const grupos = db.categorias.filter((c) => c.tipo === tipo && !c.grupo && R.ativo(c));
    corpo = grupos.map((g) => {
      const subs = db.categorias.filter((c) => c.grupo === g.id && R.ativo(c));
      const btn = (c, nome) => `<button class="chip" style="margin:4px 4px 0 0" aria-pressed="${f.categoria === c.id}" data-a="escolher" data-id="${c.id}">${esc(nome)}</button>`;
      return `<div style="margin:14px 4px 0"><div class="muted" style="font-size:12.5px;font-weight:700">${esc(g.nome)}</div><div>${subs.length ? subs.map((s) => btn(s, s.nome)).join('') : btn(g, g.nome)}</div></div>`;
    }).join('');
    const nc = E.novaCat || {};
    corpo += `<div class="cartao" style="margin-top:18px;background:var(--bg)"><div style="font-size:13.5px;font-weight:800">Criar categoria</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px">
        <input class="entrada" style="height:42px;font-size:15px" placeholder="Nome" data-nova-cat="nome" value="${esc(nc.nome || '')}" autocomplete="off">
        <select class="entrada" style="height:42px;font-size:15px" data-nova-cat="grupo"><option value="">${tipo === 'Receita' ? 'Sem grupo' : 'Novo grupo'}</option>${grupos.map((g) => `<option value="${g.id}" ${nc.grupo === g.id ? 'selected' : ''}>em ${esc(g.nome)}</option>`).join('')}</select>
      </div>
      <button class="btn btn-sec btn-peq" style="margin-top:8px" data-a="criarCategoriaRapida">${ic('mais_', 16)}Criar e usar</button></div>`;
  } else {
    const ehCartao = m.campo === 'cartao';
    const lista = (ehCartao ? db.cartoes : db.contas).filter(R.ativo);
    corpo = [...A.ps, A.fam].filter(Boolean).map((p) => {
      const itens = lista.filter((x) => x.dono === p.id);
      if (!itens.length) return '';
      return `<div style="margin:14px 4px 6px;font-size:12.5px;font-weight:700;color:var(--${{ gio: 'g', dem: 'd', fam: 'f' }[A.classe(p.id)]}-txt)">${p.tipo === 'Família' ? 'Da família' : (A.classe(p.id) === 'gio' ? 'Da ' : 'Do ') + esc(p.nome)}</div>
        ${itens.map((x) => `<button class="opcao" role="radio" aria-checked="${f[m.campo] === x.id}" data-a="escolher" data-id="${x.id}">${marcado(f[m.campo] === x.id)}<span style="flex:1"><span style="display:block;font-weight:700">${esc(x.nome)}</span><span class="muted" style="font-size:12.5px">${ehCartao ? 'Fecha dia ' + x.fecha + ' · vence dia ' + x.vence + (R.pagaPorDe(db, x) !== x.dono ? ' · paga: ' + esc(A.nome(R.pagaPorDe(db, x))) : '') : esc(x.tipo || '') + ' · ' + brl(R.saldoConta(db, x))}</span></span></button>`).join('')}`;
    }).join('') || `<div class="vazio">Nada cadastrado. <button class="link" data-a="${ehCartao ? 'novoCartao' : 'novaConta'}">Cadastrar</button></div>`;
  }
  const titulo = { categoria: 'Categoria', cartao: 'Cartão', conta: f.tipo === 'receita' ? 'Caiu na conta' : 'Saiu da conta', contaDestino: 'Entra na conta' }[m.campo];
  return modalLancar(E, A, E.modalPai) + folha(titulo, corpo, 'fecharSeletor');
}

function modalDetalhe(E, A, m) {
  const db = E.db;
  let t, tt;
  if (m.k === 'prev') {
    const lista = R.previstosDoMes(db, E.mes);
    t = lista.find((x) => x.id === m.id);
    if (!t) return '';
    tt = t.ehRenda ? { ...t, dono: t.pessoa } : t;
  } else if (m.k === 'ren') {
    t = R.porId(db.rendas, m.id);
    if (!t) return '';
    tt = { ...t, tipo: R.TIPO.receita, dono: t.pessoa, pagou: A.conta(t.conta) ? A.conta(t.conta).dono : t.pessoa, ehRenda: true };
  } else {
    t = R.porId(db.transacoes, m.id);
    if (!t) return '';
    tt = t;
  }
  const linha = (r, v) => `<div style="display:flex;justify-content:space-between;gap:12px;padding:11px 0;border-top:1px solid var(--line);font-size:14px"><span class="muted">${r}</span><span style="text-align:right;font-weight:600;white-space:pre-wrap">${v}</span></div>`;
  let acerto = '';
  if (m.k !== 'ren' && R.ehGasto(tt)) {
    if (A.fam && tt.dono === A.fam.id) {
      const parts = R.partesFamilia(db, tt, R.mesCompetencia(db, tt));
      acerto = A.ps.map((p) => `${esc(p.nome)} ${brl(tt.valor * (parts[p.id] || 0))}`).join(' · ') + ` <span class="muted">(${nomeRegra(tt.divisao || A.fam.divisaoPadrao)})</span>`;
    } else {
      const pg = R.quemPagou(db, tt);
      if (tt.dono && pg && tt.dono !== pg) {
        if (A.fam && pg === A.fam.id) { const outro = A.ps.find((p) => p.id !== tt.dono); const ff = R.fracoesFamilia(db, R.mesCompetencia(db, tt)); acerto = outro ? `Saiu da conta da Família: ${esc(A.nome(tt.dono))} deve ${brl(tt.valor * (ff[outro.id] || 0))} a ${esc(A.nome(outro.id))}` : ''; }
        else acerto = `${esc(A.nome(tt.dono))} deve ${brl(tt.valor)} a ${esc(A.nome(pg))}`;
      }
    }
  } else if (m.k === 'trn' && tt.tipo === R.TIPO.transf && R.envolveFamilia(db, R.donoDaConta(db, tt.conta), R.donoDaConta(db, tt.contaDestino))) {
    acerto = tt.foraAcerto ? 'Fora do acerto (dinheiro guardado por uma pessoa só)' : 'Dividida no acerto pela parte de cada um';
  }
  const fat = tt.fatura ? R.porId(db.faturas, tt.fatura) : null;
  const tags = R.tagsDe(tt);
  const botoes = m.k === 'prev'
    ? `<button class="btn btn-pri btn-largo" style="margin-top:16px" data-a="confirmarPrevisto">${ic('ok', 18)}Confirmar lançamento</button>
       <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px">
         <button class="btn btn-borda" data-a="editarFixa" data-id="${esc(t.recorrencia)}">${ic('lapis', 18)}Editar fixa</button>
         <button class="btn btn-perigo" data-a="pularMes">${ic('lixo', 18)}Só este mês</button>
       </div>
       <p class="muted" style="font-size:12.5px;margin-top:8px">"Só este mês" tira o previsto de ${esc(nomeMesAno(mesDe(tt.data)).toLowerCase())}; os outros meses continuam.</p>`
    : `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:16px">
        <button class="btn btn-borda" data-a="editarLancamento">${ic('lapis', 18)}Editar</button>
        <button class="btn btn-perigo" data-a="excluirLancamento">${ic('lixo', 18)}Excluir</button>
      </div>
      ${m.k === 'trn' && t.cartao && t.tipo === R.TIPO.despesa ? `<button class="btn btn-borda btn-largo" style="margin-top:8px" data-a="estornarCompra">${ic('repetir', 18)}Lançar estorno desta compra</button>` : ''}
      ${m.k === 'trn' ? `<button class="btn btn-sec btn-largo" style="margin-top:8px" data-a="alternarConferido">${t.conferido ? 'Desmarcar conferido' : 'Marcar como conferido'}</button>` : ''}`;
  const corpo = `<div style="margin:6px 4px 0">
      <div class="muted" style="font-size:13px">${dataBR(tt.data)}${tt.status === 'Previsto' ? ' · previsto' : ''}</div>
      <div style="font-size:30px;font-weight:800;letter-spacing:-0.6px;margin-top:2px" class="${sinalValor(tt) > 0 ? 'rec' : ''}">${sens((sinalValor(tt) < 0 ? '− ' : sinalValor(tt) > 0 ? '+ ' : '') + brl(tt.valor))}</div>
      <div class="chips" style="margin-top:8px">${pillDono(A, tt.dono)}${t.conferido ? '<span class="pill ok">Conferido</span>' : ''}${tt.ehRenda ? '<span class="pill neutra">Renda da divisão</span>' : ''}${tt.recorrencia ? '<span class="pill neutra">Conta fixa</span>' : ''}${tt.deduz ? '<span class="pill neutra">Deduz da renda</span>' : ''}${tags.map((x) => `<span class="pill neutra">#${esc(x)}</span>`).join('')}</div>
      <div style="margin-top:12px">
        ${linha('Tipo', esc(tt.ehRenda ? 'Renda' : tt.tipo))}
        ${tt.categoria ? linha('Categoria', esc(A.cat(tt.categoria))) : ''}
        ${linha(tt.cartao && tt.tipo !== R.TIPO.fatura ? 'Cartão' : 'Conta', esc(A.origem(tt)))}
        ${fat ? linha('Fatura', 'vence ' + dataBR(fat.vencimento) + ' · conta em ' + nomeMesAno(fat.mesRenda).split(' ')[0].toLowerCase()) : ''}
        ${tt.totalParcelas > 1 ? linha('Parcela', tt.parcela + ' de ' + tt.totalParcelas) : ''}
        ${tt.tipo !== R.TIPO.transf && R.quemPagou(db, tt) ? linha(tt.tipo === R.TIPO.receita ? 'Recebido por' : 'Pago por', esc(A.nome(R.quemPagou(db, tt)))) : ''}
        ${acerto ? linha('Divisão', acerto) : ''}
        ${tt.obs ? linha('Observação', esc(tt.obs)) : ''}
      </div>
      ${botoes}
    </div>`;
  return folha(tt.desc || (tt.ehRenda ? 'Renda' : tt.tipo), corpo);
}

function modalConta(E, A, m) {
  const f = m.form;
  const cores = ['Roxo', 'Azul', 'Verde', 'Laranja', 'Vermelho', 'Preto', 'Cinza'];
  const corpo = `
    <label class="campo"><span>Nome</span><input class="entrada" data-campo="nome" value="${esc(f.nome)}" placeholder="Ex.: Itaú"></label>
    <div class="campo"><span>De quem é</span><div class="donos" style="grid-template-columns:repeat(${[...A.ps, A.fam].filter(Boolean).length},1fr)">${[...A.ps, A.fam].filter(Boolean).map((p) => `<button role="radio" class="${A.classe(p.id)}" aria-checked="${f.dono === p.id}" data-a="formDono" data-id="${p.id}">${esc(p.nome)}</button>`).join('')}</div></div>
    ${A.fam && f.dono === A.fam.id ? '<div class="muted" style="font-size:12.5px;margin-top:6px">Conta conjunta: o dinheiro dela é dos dois, pela divisão da família. Ao transferir para ela, você escolhe se divide no acerto ou se é uma reserva só sua.</div>' : ''}
    <label class="campo"><span>Tipo</span><select class="entrada" data-campo="tipo">${['Conta corrente', 'Conta digital', 'Poupança', 'Carteira (dinheiro)', 'Vale-refeição/alimentação'].map((x) => `<option ${f.tipo === x ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
    <label class="campo"><span>Banco (opcional)</span><input class="entrada" data-campo="banco" value="${esc(f.banco || '')}"></label>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      <label class="campo"><span>Saldo em</span><input type="date" class="entrada" data-campo="dataSaldo" value="${esc(f.dataSaldo)}"></label>
      <label class="campo"><span>Saldo (R$)</span><input class="entrada" inputmode="numeric" data-mascara="dinheiro" data-negativo="1" data-campo="saldoInicial" value="${esc(f.saldoInicial)}" placeholder="0,00"></label>
    </div>
    <div class="campo"><span>Cor</span><div class="chips">${cores.map((c) => `<button class="icone-btn" style="width:40px;height:40px;background:${corConta(c)};border:2px solid ${f.cor === c ? 'var(--text)' : 'transparent'}" data-a="formCor" data-v="${c}" aria-label="${c}" aria-pressed="${f.cor === c}"></button>`).join('')}</div></div>
    <button class="btn btn-pri btn-largo" style="margin-top:20px" data-a="salvarConta" ${E.salvando ? 'aria-disabled="true"' : ''}>${E.salvando ? 'Salvando…' : 'Salvar conta'}</button>
    ${f.id ? `<button class="btn btn-borda btn-largo" style="margin-top:8px" data-a="arquivarConta">${f.status === 'Arquivado' ? 'Reativar conta' : 'Arquivar conta'}</button>` : ''}`;
  return folha(f.id ? 'Editar conta' : 'Nova conta', corpo);
}

function modalCartao(E, A, m) {
  const f = m.form;
  const cores = ['Roxo', 'Azul', 'Verde', 'Laranja', 'Vermelho', 'Preto', 'Cinza'];
  const ex = f.rendaRef === 'Mesmo mês do vencimento' ? 'Ex.: a fatura que vence em dezembro conta como gasto de dezembro.' : 'Ex.: a fatura que vence em dezembro conta como gasto de novembro (renda, metas e acerto de novembro).';
  const corpo = `
    <label class="campo"><span>Nome</span><input class="entrada" data-campo="nome" value="${esc(f.nome)}" placeholder="Ex.: Nubank Giovanna"></label>
    <div class="campo"><span>De quem é</span><div class="donos" style="grid-template-columns:repeat(${[...A.ps, A.fam].filter(Boolean).length},1fr)">${[...A.ps, A.fam].filter(Boolean).map((p) => `<button role="radio" class="${A.classe(p.id)}" aria-checked="${f.dono === p.id}" data-a="formDono" data-id="${p.id}">${esc(p.nome)}</button>`).join('')}</div></div>
    <div class="campo"><span>Paga por</span><div class="donos" style="grid-template-columns:repeat(${A.ps.length},1fr)">${A.ps.map((p) => `<button role="radio" class="${A.classe(p.id)}" aria-checked="${f.pagaPor === p.id}" data-a="formPagaPor" data-id="${p.id}">${esc(p.nome)}</button>`).join('')}</div>
      <div class="muted" style="font-size:12.5px;margin-top:6px">${f.pagaPor ? `As compras deste cartão contam como pagas por ${esc(A.nome(f.pagaPor))}. A conta você escolhe na hora de pagar a fatura; se sair de uma conta de outra pessoa ou da Família, isso entra no acerto.` : 'Escolha quem paga a fatura. Precisa ser uma pessoa: a Família não paga cartão.'}</div></div>
    <div class="cartao" style="margin-top:14px;background:var(--bg)">
      <div style="display:flex;align-items:center"><span style="flex:1">Fechamento</span><span class="passo"><button data-a="formDia" data-v="fecha:-1" aria-label="Fechamento um dia antes">−</button><span class="v">dia ${f.fecha}</span><button data-a="formDia" data-v="fecha:1" aria-label="Fechamento um dia depois">+</button></span></div>
      <div style="display:flex;align-items:center;margin-top:8px"><span style="flex:1">Vencimento</span><span class="passo"><button data-a="formDia" data-v="vence:-1" aria-label="Vencimento um dia antes">−</button><span class="v">dia ${f.vence}</span><button data-a="formDia" data-v="vence:1" aria-label="Vencimento um dia depois">+</button></span></div>
      <div class="muted" style="font-size:12.5px;margin-top:10px">Compras até o dia ${f.fecha === 1 ? 'último do mês anterior' : f.fecha - 1} entram na fatura que vence no dia ${f.vence}${f.vence > f.fecha ? ' do mesmo mês' : ' do mês seguinte'}. Se o banco mudar a data de uma fatura, dá para corrigir só aquela em Faturas.</div>
    </div>
    <div class="campo"><span>As compras deste cartão contam no mês</span><div class="chips">${[['Mês anterior ao vencimento', 'Anterior ao vencimento'], ['Mesmo mês do vencimento', 'Do vencimento']].map(([v, n]) => `<button class="chip" aria-pressed="${f.rendaRef === v}" data-a="formRendaRef" data-v="${v}">${n}</button>`).join('')}</div><div class="muted" style="font-size:12.5px;margin-top:6px">${ex}</div></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      <label class="campo" style="grid-column:1/-1"><span>Limite (R$)</span><input class="entrada" inputmode="numeric" data-mascara="dinheiro" data-campo="limite" value="${esc(f.limite)}"></label>
    </div>
    <div class="campo"><span>Cor</span><div class="chips">${cores.map((c) => `<button class="icone-btn" style="width:40px;height:40px;background:${corConta(c)};border:2px solid ${f.cor === c ? 'var(--text)' : 'transparent'}" data-a="formCor" data-v="${c}" aria-label="${c}" aria-pressed="${f.cor === c}"></button>`).join('')}</div></div>
    <button class="btn btn-pri btn-largo" style="margin-top:20px" data-a="salvarCartao" ${E.salvando ? 'aria-disabled="true"' : ''}>${E.salvando ? 'Salvando…' : 'Salvar cartão'}</button>
    ${f.id ? `<button class="btn btn-borda btn-largo" style="margin-top:8px" data-a="arquivarCartao">${f.status === 'Arquivado' ? 'Reativar cartão' : 'Arquivar cartão'}</button>` : ''}`;
  return folha(f.id ? 'Editar cartão' : 'Novo cartão', corpo);
}

function modalRenda(E, A, m) {
  const f = m.form;
  const contas = E.db.contas.filter(R.ativo);
  const corpo = `
    <div class="campo"><span>De quem</span><div class="donos" style="grid-template-columns:repeat(${A.ps.length},1fr)">${A.ps.map((p) => `<button role="radio" class="${A.classe(p.id)}" aria-checked="${f.pessoa === p.id}" data-a="formPessoa" data-id="${p.id}">${esc(p.nome)}</button>`).join('')}</div></div>
    <label class="campo"><span>Descrição</span><input class="entrada" data-campo="desc" value="${esc(f.desc)}" placeholder="Salário"></label>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      <label class="campo"><span>Valor líquido (R$)</span><input class="entrada" inputmode="numeric" data-mascara="dinheiro" data-campo="valor" value="${esc(f.valor)}" placeholder="0,00"></label>
      <label class="campo"><span>Data</span><input type="date" class="entrada" data-campo="data" value="${esc(f.data)}"></label>
    </div>
    <label class="campo"><span>Caiu na conta</span><select class="entrada" data-campo="conta"><option value="">—</option>${contas.map((c) => `<option value="${c.id}" ${f.conta === c.id ? 'selected' : ''}>${esc(A.nomeConta(c.id))} (${esc(A.nome(c.dono))})</option>`).join('')}</select></label>
    <p class="muted" style="font-size:12.5px;margin-top:10px">A renda do mês define o percentual de cada um na divisão dos gastos da família.</p>
    <button class="btn btn-pri btn-largo" style="margin-top:16px;background:var(--receita)" data-a="salvarRenda" ${E.salvando ? 'aria-disabled="true"' : ''}>${E.salvando ? 'Salvando…' : 'Salvar renda'}</button>`;
  return folha(f.id ? 'Editar renda' : 'Lançar renda', corpo);
}

function modalConfirmar(E, A, m) {
  const corpo = `<p class="soft" style="margin:10px 4px 0;font-size:14.5px;line-height:1.5">${m.texto}</p>
    ${m.opcoes.map(([acao, rot, perigo]) => `<button class="btn ${perigo ? 'btn-perigo' : 'btn-sec'} btn-largo" style="margin-top:10px" data-a="${acao}" ${E.salvando ? 'aria-disabled="true"' : ''}>${rot}</button>`).join('')}
    <button class="btn btn-largo" style="margin-top:6px;background:transparent;color:var(--muted)" data-a="fecharModal">Cancelar</button>`;
  return folha(m.titulo, corpo);
}

function modalFechamento(E, A, m) {
  const f = m.form;
  const corpo = `<p class="muted" style="margin:8px 4px 0;font-size:13.5px">Use quando o banco mudar a data desta fatura. O padrão do cartão não muda. As compras dos dias afetados mudam de fatura sozinhas.</p>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      <label class="campo"><span>Fecha em</span><input type="date" class="entrada" data-campo="fechamento" value="${esc(f.fechamento)}"></label>
      <label class="campo"><span>Vence em</span><input type="date" class="entrada" data-campo="vencimento" value="${esc(f.vencimento)}"></label>
    </div>
    <button class="btn btn-pri btn-largo" style="margin-top:18px" data-a="salvarFechamento" ${E.salvando ? 'aria-disabled="true"' : ''}>${E.salvando ? 'Salvando…' : 'Salvar datas'}</button>`;
  return folha('Datas desta fatura', corpo);
}

export function toast(E) {
  return E.toast ? `<div class="toast ${E.toast.erro ? 'erro' : ''}" role="status">${esc(E.toast.msg)}</div>` : '';
}
