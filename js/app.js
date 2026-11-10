// Economiau — estado, navegação e ações.
import { CONFIG } from './config.js';
import * as G from './google.js';
import { BancoPlanilha, BancoDemo } from './dados.js';
import * as R from './regras.js';
import * as T from './telas.js';
import * as T2 from './telas2.js';
import * as I from './invest.js';
import { hojeISO, mesDe, somaMes, somaDias, lerValor, arred, brl, nomeMesAno, formatarId, proximoNumero, dataNoMes } from './util.js';

const LS = {
  get: (k, d = null) => { try { const v = localStorage.getItem('economiau-' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set: (k, v) => { try { localStorage.setItem('economiau-' + k, JSON.stringify(v)); } catch (e) { /* sem armazenamento */ } },
  del: (k) => { try { localStorage.removeItem('economiau-' + k); } catch (e) { /* ignora */ } },
};

const E = {
  fase: 'iniciando', erro: '', msgCarregando: '', email: LS.get('email', ''), banco: null, db: null,
  perfil: LS.get('perfil'), rota: 'inicio', mes: mesDe(hojeISO()), filtros: { ...T.FILTROS_PADRAO }, modal: null, modalPai: null,
  ocultar: LS.get('ocultar', false), toast: null, salvando: false, sessaoExpirada: false, versao: CONFIG.versaoApp,
  cartaoSel: null, faturaSel: null, rev: 0,
  confFatura: null, saldoBanco: {}, contasOk: LS.get('contasOk', {}),
};
window.__economiau = E; // ajuda a depurar pelo console

// ------------------------------------------------------------ desenho
const raiz = document.getElementById('app');
function desenhar() {
  const foco = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.campo : null;
  const rolagens = [...document.querySelectorAll('.rolar, .folha')].map((el) => el.scrollTop);
  const y = window.scrollY;
  document.body.className = 'perfil-' + (E.db && E.perfil ? T.apoio(E).chave(E.perfil) : 'demetrio');
  let html = '';
  if (E.fase === 'iniciando' || E.fase === 'carregando') html = T.telaCarregando(E);
  else if (E.fase === 'entrar') html = T.telaEntrar(E);
  else if (E.fase === 'conectar') html = T.telaConectar(E);
  else if (E.fase === 'negado') html = T.telaNegado(E);
  else if (E.fase === 'erro') html = T.telaErro(E);
  else if (E.rota === 'perfis' || !E.perfil) html = T.telaPerfis(E);
  else {
    const telas = { inicio: T.telaInicio, transacoes: T.telaTransacoes, acerto: T.telaAcerto, mais: T.telaMais, contas: T.telaContas, rendas: T.telaRendas, faturas: T.telaFaturas, primeiro: T.telaPrimeiro, fixas: T.telaFixas, conferencia: T2.telaConferencia, investimentos: T2.telaInvestimentos, categorias: T.telaCategorias, tags: T.telaTags };
    html = (telas[E.rota] || T.telaInicio)(E) + T.modal(E);
  }
  raiz.innerHTML = html + T.toast(E);
  document.querySelectorAll('.auto-altura').forEach(ajustarAltura);
  [...document.querySelectorAll('.rolar, .folha')].forEach((el, i) => { if (rolagens[i]) el.scrollTop = rolagens[i]; });
  window.scrollTo(0, y);
  if (foco) {
    const el = document.querySelector('[data-campo="' + foco + '"]');
    if (el) { el.focus(); if (el.setSelectionRange && el.type !== 'date' && el.type !== 'number') { const n = el.value.length; try { el.setSelectionRange(n, n); } catch (e) { /* tipo sem cursor */ } } }
  }
}

let timerToast = null;
function avisar(msg, erro = false) {
  E.toast = { msg, erro };
  desenhar();
  clearTimeout(timerToast);
  timerToast = setTimeout(() => { E.toast = null; desenhar(); }, erro ? 6000 : 2800);
}

// ------------------------------------------------------------ início
async function iniciar() {
  window.addEventListener('hashchange', () => { lerRota(); desenhar(); });
  lerRota();
  if (LS.get('demo')) return abrirDemo();
  desenhar();
  try { await G.prepararLogin(); } catch (e) { /* sem internet: tenta seguir */ }
  if (G.tokenValido()) return depoisDoLogin();
  E.fase = 'entrar';
  desenhar();
}

function lerRota() {
  const r = (location.hash || '').replace(/^#\/?/, '') || 'inicio';
  if (r === 'faturas' && E.rota !== 'faturas') E.faturaSel = null; // abre sempre na fatura em aberto
  E.rota = r;
  E.modal = null; E.modalPai = null;
}
function ir(rota) { if (location.hash !== '#/' + rota) location.hash = '#/' + rota; else { E.rota = rota; desenhar(); } }

async function abrirDemo() {
  E.banco = new BancoDemo();
  E.email = 'demo-demetrio@exemplo.com';
  E.db = await E.banco.carregar();
  if (!E.perfil || !R.porId(E.db.pessoas, E.perfil)) E.perfil = null;
  E.fase = 'pronto';
  desenhar();
}

async function depoisDoLogin() {
  E.fase = 'carregando'; E.msgCarregando = 'Entrando…'; desenhar();
  try {
    const u = await G.usuario();
    E.email = (u.email || '').toLowerCase();
    LS.set('email', E.email);
  } catch (e) {
    E.fase = 'entrar'; E.erro = e instanceof G.SessaoExpirada ? '' : e.message; desenhar(); return;
  }
  const id = LS.get('planilha');
  if (!id) { E.fase = 'conectar'; E.erro = ''; desenhar(); return; }
  carregarPlanilha(id);
}

async function carregarPlanilha(id) {
  E.fase = 'carregando'; E.msgCarregando = 'Lendo a planilha…'; desenhar();
  try {
    E.banco = new BancoPlanilha(id);
    E.db = await E.banco.carregar();
  } catch (e) {
    if (e instanceof G.SessaoExpirada) { E.fase = 'entrar'; E.erro = ''; desenhar(); return; }
    if (e.status === 403 || e.status === 404) { LS.del('planilha'); E.fase = 'conectar'; E.erro = 'O app não conseguiu abrir a planilha. Escolha de novo no seletor.'; desenhar(); return; }
    E.fase = 'erro'; E.erro = e.message; desenhar(); return;
  }
  const pessoa = E.db.pessoas.find((p) => String(p.email || '').toLowerCase() === E.email);
  if (!pessoa) { E.fase = 'negado'; desenhar(); return; }
  if (!E.perfil || !R.porId(E.db.pessoas, E.perfil)) E.perfil = null;
  E.fase = 'pronto'; E.erro = ''; E.sessaoExpirada = false;
  if (!E.db.contas.some(R.ativo) && !LS.get('primeiro-ok-' + id)) { if (E.perfil) ir('primeiro'); }
  desenhar();
  corrigirFaturas();
}

// Conserta compras no cartão que ficaram numa fatura que não cobre a data
// (erro das versões 1.0 a 1.4 quando a compra era lançada depois de uma mais nova)
async function corrigirFaturas() {
  const meses = R.faturasComMesErrado(E.banco.db);
  const erradas = R.comprasNaFaturaErrada(E.banco.db);
  // 1.5: "Paga por" nos cartões antigos e "Quem pagou" das compras no cartão
  const semPaga = E.banco.temCampo('cartoes', 'pagaPor') ? R.cartoesSemPagaPor(E.banco.db) : [];
  const rep = R.faturasRepetidas(E.banco.db);
  if (!erradas.length && !meses.length && !semPaga.length && !rep.apagar.length && !R.pagadoresErrados(E.banco.db).length) return;
  try {
    // faturas repetidas (mesmo cartão vencendo no mesmo mês): junta numa só
    if (rep.apagar.length) {
      if (rep.mover.length) await E.banco.atualizar('transacoes', rep.mover);
      await E.banco.excluir('faturas', rep.apagar);
      if (E.confFatura && rep.apagar.includes(E.confFatura)) E.confFatura = rep.manter[0];
    }
    if (semPaga.length) await E.banco.atualizar('cartoes', semPaga);
    const pagou = R.pagadoresErrados(E.banco.db);
    if (pagou.length) await E.banco.atualizar('transacoes', pagou);
    const meses2 = R.faturasComMesErrado(E.banco.db);
    if (meses2.length) await E.banco.atualizar('faturas', meses2);
    const mudar = await moverComprasErradas();
    E.db = E.banco.db; E.rev++;
    if (mudar) avisar(mudar === 1 ? 'Corrigi a fatura de 1 compra lançada com data antiga.' : 'Corrigi a fatura de ' + mudar + ' compras lançadas com data antiga.');
    else if (meses.length) avisar(meses.length === 1 ? 'Corrigi o mês de 1 fatura pela regra do cartão.' : 'Corrigi o mês de ' + meses.length + ' faturas pela regra do cartão.');
    else if (semPaga.length) avisar('Preenchi "Paga por" nos cartões. Confira em Contas e cartões.');
    else if (rep.apagar.length) avisar(rep.apagar.length === 1 ? 'Juntei 1 fatura repetida.' : 'Juntei ' + rep.apagar.length + ' faturas repetidas.');
    desenhar();
  } catch (e) { tratarErro(e); }
}

async function gravarTags(mudancas) {
  return salvar(async () => {
    for (const [aba, linhas] of Object.entries(mudancas)) {
      if (E.banco.temCampo(aba, 'tags')) await E.banco.atualizar(aba, linhas);
    }
  });
}

// Compras que estão numa fatura que não cobre a data delas vão para a fatura
// certa (cria a fatura se preciso). Devolve quantas mudaram.
async function moverComprasErradas(cartaoId) {
  const erradas = R.comprasNaFaturaErrada(E.banco.db).filter(({ t }) => !cartaoId || t.cartao === cartaoId);
  const criadas = [];
  const mudar = [];
  for (const { t, k } of erradas) {
    const c = R.porId(E.banco.db.cartoes, t.cartao);
    const id = await garantirFatura(c, t.data, k, criadas);
    if (id !== t.fatura) mudar.push({ id: t.id, fatura: id });
  }
  if (mudar.length) await E.banco.atualizar('transacoes', mudar);
  if (!E.banco.demo) await E.banco.carregar();
  return mudar.length;
}

// Recarrega os dados depois de uma escrita (garante números de linha certos)
async function recarregarDados() {
  try { E.db = await E.banco.carregar(); E.rev++; } catch (e) { tratarErro(e); }
}

function tratarErro(e) {
  if (e instanceof G.SessaoExpirada) { E.sessaoExpirada = true; avisar('A sessão do Google expirou. Toque em Continuar.', true); return; }
  avisar(e.message || 'Algo deu errado.', true);
}

async function salvar(fn) {
  if (E.salvando) return;
  E.salvando = true; desenhar();
  try { await fn(); } catch (e) { E.salvando = false; if (E.banco) E.db = E.banco.db; tratarErro(e); return false; }
  E.salvando = false;
  E.db = E.banco.db; // o motor pode ter recarregado tudo (ex.: depois de excluir)
  E.rev++;
  return true;
}

// ------------------------------------------------------------ apoio
const fam = () => R.familia(E.db);
const pessoas = () => R.pessoasReais(E.db);
const formAtual = () => (E.modal && E.modal.form) || (E.modalPai && E.modalPai.form);
const eu = () => (E.db.pessoas.find((p) => String(p.email || '').toLowerCase() === E.email) || pessoas()[0] || {}).id;
const donoPadrao = () => (E.perfil && fam() && E.perfil !== fam().id ? E.perfil : eu());
// Perfil em que a pessoa entrou (pode ser a Família); é o dono padrão dos lançamentos
const perfilAtual = () => (E.perfil && R.porId(E.db.pessoas, E.perfil) ? E.perfil : eu());
const primeiraConta = (dono) => (E.db.contas.find((c) => c.dono === dono && R.ativo(c)) || E.db.contas.find((c) => c.dono === eu() && R.ativo(c)) || E.db.contas.find(R.ativo) || {}).id || '';
const primeiroCartao = (dono) => (E.db.cartoes.find((c) => c.dono === dono && R.ativo(c)) || E.db.cartoes.find((c) => c.dono === eu() && R.ativo(c)) || E.db.cartoes.find(R.ativo) || {}).id || '';

function novoForm(tipo = 'despesa') {
  const quem = perfilAtual();
  return {
    tipo, valor: '', data: hojeISO(), dataModo: 'hoje', desc: '', categoria: '', obs: '',
    conta: primeiraConta(quem), cartao: primeiroCartao(quem), contaDestino: '', parcelas: 1, meio: 'Pix',
    dono: quem, renda: !ehFamilia(quem), transf: 'fatura', tags: [], tagNova: '', deduz: false, repetir: false, repetirMeses: 0, foraAcerto: false,
  };
}
const valorTxt = (n) => (n === '' || n === null || n === undefined ? '' : Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const ehFamilia = (id) => fam() && id === fam().id;
function mascarar(v, negativo) {
  const sinal = negativo && String(v).trim().startsWith('-') ? '-' : '';
  const dig = String(v).replace(/\D/g, '').replace(/^0+/, '');
  if (!dig) return sinal;
  return sinal + (parseInt(dig, 10) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function addTag(f, nome) {
  const t = R.normTag(String(nome || '').replace(/,/g, ' '));
  if (t && !f.tags.includes(t)) f.tags.push(t);
  f.tagNova = '';
}

// ------------------------------------------------------------ ações
const A = {
  async entrar() {
    E.erro = '';
    try { await G.entrar(E.email); } catch (e) { E.erro = e.message; desenhar(); return; }
    LS.del('demo');
    depoisDoLogin();
  },
  entrarDemo() { LS.set('demo', true); E.perfil = null; abrirDemo(); },
  async escolherPlanilha() {
    E.erro = '';
    if (!G.tokenValido()) { try { await G.entrar(E.email); } catch (e) { E.erro = e.message; desenhar(); return; } }
    let p;
    try { p = await G.escolherPlanilha(); } catch (e) { E.erro = e.message; desenhar(); return; }
    if (!p) return;
    LS.set('planilha', p.id);
    carregarPlanilha(p.id);
  },
  trocarPlanilha() {
    if (E.banco && E.banco.demo) { LS.del('demo'); E.banco = null; E.db = null; E.fase = G.tokenValido() ? 'conectar' : 'entrar'; ir('inicio'); desenhar(); return; }
    LS.del('planilha'); E.banco = null; E.db = null; E.fase = 'conectar'; E.erro = ''; desenhar();
  },
  sair() { G.sair(); LS.del('demo'); LS.del('perfil'); E.perfil = null; E.banco = null; E.db = null; E.fase = 'entrar'; E.erro = ''; ir('inicio'); desenhar(); },
  async recarregar() {
    if (E.banco && E.banco.demo) { avisar('Modo demonstração: os dados ficam neste navegador.'); return; }
    if (E.fase === 'erro') { const id = LS.get('planilha'); if (id) carregarPlanilha(id); return; }
    await recarregarDados(); avisar('Dados atualizados.');
  },
  async renovar() {
    try { await G.entrar(E.email); } catch (e) { avisar(e.message, true); return; }
    E.sessaoExpirada = false; await recarregarDados(); desenhar();
  },
  escolherPerfil(d) {
    E.perfil = d.id; LS.set('perfil', d.id);
    const id = LS.get('planilha');
    if (!E.db.contas.some(R.ativo) && !(E.banco && E.banco.demo) && !LS.get('primeiro-ok-' + id)) ir('primeiro'); else ir('inicio');
  },
  ir(d) { ir(d.v); },
  mudarMes(d) { E.mes = somaMes(E.mes, Number(d.v)); desenhar(); },
  alternarOcultar() { E.ocultar = !E.ocultar; LS.set('ocultar', E.ocultar); desenhar(); },
  filtro(d) { E.filtros[d.c] = d.v; desenhar(); },
  filtroQuem(d) {
    const sel = T.quemSel(E.filtros);
    E.filtros.quem = d.v === 'tudo' ? [] : sel.includes(d.v) ? sel.filter((x) => x !== d.v) : [...sel, d.v];
    desenhar();
  },
  abrirFiltros() { E.modal = { tipo: 'filtros' }; desenhar(); },
  limparFiltros() { E.filtros = { ...T.FILTROS_PADRAO, quem: E.filtros.quem, tipo: E.filtros.tipo }; if (E.modal && E.modal.tipo === 'filtros') E.modal = null; desenhar(); },
  filtroTag(d) { E.filtros.tag = E.filtros.tag === d.v ? '' : d.v; desenhar(); },
  filtroNaoConf() { E.filtros.naoConf = !E.filtros.naoConf; desenhar(); },
  menuLancar() { if (window.innerWidth >= 1100) A.novoLancamento(); else { E.modal = { tipo: 'menu' }; desenhar(); } },
  lancarTipo(d) { A.novoLancamento({ v: d.v }); },
  concluirPrimeiro() { LS.set('primeiro-ok-' + LS.get('planilha'), true); ir('inicio'); },

  // ---- lançamento
  novoLancamento(d) {
    if (!E.db.contas.some(R.ativo)) { avisar('Cadastre ao menos uma conta antes de lançar.', true); ir('contas'); return; }
    E.modal = { tipo: 'lancar', form: novoForm((d && d.v) || 'despesa') }; E.modalPai = null; desenhar();
    setTimeout(() => { const v = document.getElementById('valor'); if (v) v.focus(); }, 50);
  },
  fecharModal() { if (E.modalPai && E.modal && E.modal.tipo !== 'lancar') { E.modal = E.modalPai; E.modalPai = null; } else { E.modal = null; E.modalPai = null; } desenhar(); },
  lancEstorno(d) { const f = E.modal.form; f.estorno = d.v === '1'; if (f.estorno) { f.parcelas = 1; f.repetir = false; f.deduz = false; } desenhar(); },
  estornarCompra() {
    const t = R.porId(E.db.transacoes, E.modal.id);
    const f = { ...novoForm('cartao'), estorno: true, valor: valorTxt(t.valor), desc: 'Estorno: ' + (t.desc || ''), categoria: t.categoria || '', cartao: t.cartao, dono: t.dono, tags: R.tagsDe(t) };
    E.modal = { tipo: 'lancar', form: f }; desenhar();
  },
  // ---- categorias
  catTipo(d) { E.catOrdem = null; E.catTipo = d.v; desenhar(); },
  novaCategoria(d) { E.modal = { tipo: 'categoria', form: { nome: '', tipo: E.catTipo || 'Despesa', grupo: d.id || '', status: 'Ativo' } }; desenhar(); setTimeout(() => { const el = document.querySelector('[data-campo="nome"]'); if (el) el.focus(); }, 50); },
  // ---- tags
  editarTag(d) { E.modal = { tipo: 'tag', form: { tag: d.v, nome: d.v } }; desenhar(); },
  async salvarTag() {
    const f = formAtual();
    const novo = R.normTag(f.nome);
    if (!novo) return avisar('Digite um nome para a tag.', true);
    if (novo === f.tag) { E.modal = null; desenhar(); return; }
    const junta = R.todasAsTags(E.db).includes(novo);
    const ok = await gravarTags(R.trocarTag(E.db, f.tag, novo));
    if (ok) { E.modal = null; avisar(junta ? `Tags juntadas em #${novo}.` : `Tag renomeada para #${novo}.`); }
  },
  excluirTag() {
    const f = E.modal.form;
    E.modal = { tipo: 'confirmar', titulo: 'Excluir a tag?', texto: `#${f.tag} sai de todos os lançamentos que a usam. Os lançamentos continuam.`, alvo: f.tag, opcoes: [['confirmarExcluirTag', 'Excluir tag', true]] };
    desenhar();
  },
  async confirmarExcluirTag() {
    const tag = E.modal.alvo;
    const ok = await gravarTags(R.trocarTag(E.db, tag, ''));
    if (ok) { E.modal = null; if (E.filtros.tag === tag) E.filtros.tag = ''; avisar(`Tag #${tag} excluída.`); }
  },
  // ---- ordem das categorias (rascunho até "Salvar ordem")
  catOrdemIniciar() {
    if (!E.banco.temCampo('categorias', 'ordem')) return avisar('Rode o script da planilha versão 1.13 para poder reordenar as categorias.', true);
    const tipo = E.catTipo || 'Despesa';
    const ordem = {};
    const ativas = E.db.categorias.filter((c) => c.tipo === tipo && R.ativo(c));
    R.porOrdem(E.db, ativas.filter((c) => !c.grupo)).forEach((g, i) => {
      ordem[g.id] = i + 1;
      R.porOrdem(E.db, ativas.filter((c) => c.grupo === g.id)).forEach((c, k) => (ordem[c.id] = k + 1));
    });
    E.catOrdem = { tipo, ordem };
    desenhar();
  },
  catOrdemCancelar() { E.catOrdem = null; desenhar(); },
  catMover(d) {
    const o = E.catOrdem.ordem;
    const c = R.porId(E.db.categorias, d.id);
    const irmaos = R.porOrdem(E.db, E.db.categorias.filter((x) => x.tipo === c.tipo && (x.grupo || '') === (c.grupo || '') && R.ativo(x)), o);
    const i = irmaos.indexOf(c), j = i + Number(d.v);
    if (j < 0 || j >= irmaos.length) return;
    [irmaos[i], irmaos[j]] = [irmaos[j], irmaos[i]];
    irmaos.forEach((x, k) => (o[x.id] = k + 1));
    desenhar();
  },
  async catOrdemSalvar() {
    const o = E.catOrdem.ordem;
    const mudar = Object.entries(o).filter(([id, n]) => (R.porId(E.db.categorias, id) || {}).ordem !== n).map(([id, ordem]) => ({ id, ordem }));
    const ok = mudar.length ? await salvar(() => E.banco.atualizar('categorias', mudar)) : true;
    if (ok) { E.catOrdem = null; avisar('Ordem salva.'); desenhar(); }
  },
  editarCategoria(d) { const c = R.porId(E.db.categorias, d.id); E.modal = { tipo: 'categoria', form: { ...c, grupo: c.grupo || '' } }; desenhar(); },
  async salvarCategoria() {
    const f = E.modal.form;
    const nome = (f.nome || '').trim();
    if (!nome) return avisar('Dê um nome para a categoria.', true);
    const repetida = E.db.categorias.some((c) => c.id !== f.id && c.tipo === f.tipo && (c.grupo || '') === (f.grupo || '') && c.nome.toLowerCase() === nome.toLowerCase() && R.ativo(c));
    if (repetida) return avisar('Já existe uma categoria com esse nome aqui.', true);
    const o = { nome, tipo: f.tipo, grupo: f.grupo || '' };
    const ok = await salvar(() => (f.id ? E.banco.atualizar('categorias', [{ id: f.id, ...o }]) : E.banco.inserir('categorias', [{ ...o, status: 'Ativo' }])));
    if (ok) { E.modal = null; avisar('Categoria salva.'); }
  },
  async arquivarCategoria() {
    const f = E.modal.form;
    const novo = f.status === 'Arquivado' ? 'Ativo' : 'Arquivado';
    const lista = [{ id: f.id, status: novo }];
    if (novo === 'Arquivado') E.db.categorias.filter((c) => c.grupo === f.id && R.ativo(c)).forEach((c) => lista.push({ id: c.id, status: 'Arquivado' }));
    const ok = await salvar(() => E.banco.atualizar('categorias', lista));
    if (ok) { E.modal = null; avisar(novo === 'Arquivado' ? 'Categoria arquivada.' : 'Categoria reativada.'); }
  },
  async excluirCategoria() {
    const f = E.modal.form;
    const ok = await salvar(() => E.banco.excluir('categorias', [f.id]));
    if (ok) { E.modal = null; avisar('Categoria excluída.'); }
  },
  async criarCategoriaRapida() {
    const nc = E.novaCat || {};
    const nome = (nc.nome || '').trim();
    if (!nome) return avisar('Digite o nome da categoria.', true);
    const f = E.modalPai.form;
    const tipo = f.tipo === 'receita' ? 'Receita' : 'Despesa';
    let nova;
    const ok = await salvar(async () => { [nova] = await E.banco.inserir('categorias', [{ nome, tipo, grupo: nc.grupo || '', status: 'Ativo' }]); });
    if (ok) { f.categoria = nova.id; E.novaCat = {}; E.modal = E.modalPai; E.modalPai = null; avisar('Categoria criada.'); }
  },
  lancTipo(d) {
    const f = E.modal.form; f.tipo = d.v; f.estorno = false;
    if (d.v === 'receita') { f.categoria = ''; if (!E.modal.editando) { f.dono = perfilAtual(); f.renda = !ehFamilia(f.dono); } }
    else if (f.categoria && R.porId(E.db.categorias, f.categoria) && R.porId(E.db.categorias, f.categoria).tipo === 'Receita') f.categoria = '';
    if (d.v === 'despesa' || d.v === 'cartao') f.dono = f.dono || perfilAtual();
    desenhar();
  },
  lancData(d) {
    const f = formAtual(); f.dataModo = d.v;
    if (d.v === 'hoje') f.data = hojeISO(); else if (d.v === 'ontem') f.data = somaDias(hojeISO(), -1);
    desenhar();
  },
  lancMeio(d) { E.modal.form.meio = d.v; desenhar(); },
  lancDono(d) { const f = E.modal.form; f.dono = d.id; if (ehFamilia(d.id)) f.deduz = false; if (f.tipo === 'receita' && ehFamilia(d.id)) f.renda = false; else if (f.tipo === 'receita' && !E.modal.editando) f.renda = true; desenhar(); },
  lancRenda() { E.modal.form.renda = !E.modal.form.renda; desenhar(); },
  lancDeduz() { E.modal.form.deduz = !E.modal.form.deduz; desenhar(); },
  lancDivisao(d) { E.modal.form.divisao = d.v; desenhar(); },
  lancForaAcerto() { E.modal.form.foraAcerto = !E.modal.form.foraAcerto; desenhar(); },
  movForaAcerto() { E.modal.form.foraAcerto = !E.modal.form.foraAcerto; desenhar(); },
  lancRepetir() { E.modal.form.repetir = !E.modal.form.repetir; desenhar(); },
  repetirPor(d) { E.modal.form.repetirMeses = Number(d.v) || 0; desenhar(); },
  repetirMeses(d) { const f = E.modal.form; f.repetirMeses = Math.max(1, Math.min(120, (Number(f.repetirMeses) || 1) + Number(d.v))); desenhar(); },
  pularMes() {
    const p = R.acharPrevisto(E.db, E.modal.id);
    if (!p) return;
    if (!E.banco.temCampo('recorrencias', 'pulados')) { avisar('Rode o script da planilha versão 1.9 para poder pular um mês.', true); return; }
    E.modal = { tipo: 'confirmar', titulo: 'Pular este mês?', alvo: { rec: p.recorrencia, mes: mesDe(p.data) },
      texto: `"${p.desc}" não vai aparecer como prevista em ${nomeMesAno(mesDe(p.data)).toLowerCase()}. Os outros meses continuam normalmente.`,
      opcoes: [['confirmarPular', 'Pular só este mês', true]] };
    desenhar();
  },
  async confirmarPular() {
    const { rec, mes } = E.modal.alvo;
    const r = R.porId(E.db.recorrencias, rec);
    const lista = String(r.pulados || '').split(',').map((x) => x.trim()).filter(Boolean);
    if (!lista.includes(mes)) lista.push(mes);
    const ok = await salvar(() => E.banco.atualizar('recorrencias', [{ id: rec, pulados: lista.sort().join(', ') }]));
    if (ok) { E.modal = null; avisar('Mês pulado.'); }
  },
  // ---- conferência
  abrirConfFatura(d) { E.confFatura = d.id; desenhar(); window.scrollTo(0, 0); },
  fecharConfFatura() { E.confFatura = null; desenhar(); },
  async confCompra(d) {
    const t = R.porId(E.db.transacoes, d.id);
    const ok = await salvar(() => E.banco.atualizar('transacoes', [{ id: t.id, conferido: !t.conferido }]));
    if (ok) desenhar();
  },
  async marcarTodasCompras(d) {
    const f = R.porId(E.db.faturas, d.id);
    const lista = T2.comprasDaFatura(E.db, f).filter((t) => !t.conferido);
    if (!lista.length) return;
    const ok = await salvar(() => E.banco.atualizar('transacoes', lista.map((t) => ({ id: t.id, conferido: true }))));
    if (ok) desenhar();
  },
  async concluirFatura(d) {
    const ok = await salvar(() => E.banco.atualizar('faturas', [{ id: d.id, conferida: true }]));
    if (ok) avisar('Fatura conferida.');
  },
  async desconferirFatura(d) {
    const ok = await salvar(() => E.banco.atualizar('faturas', [{ id: d.id, conferida: false }]));
    if (ok) desenhar();
  },
  lancarNaFatura(d) {
    const f = R.porId(E.db.faturas, d.id);
    const form = novoForm('cartao');
    form.cartao = f.cartao;
    const hoje = hojeISO();
    form.data = hoje < f.fechamento ? hoje : somaDias(f.fechamento, -1);
    form.dataModo = 'outra';
    E.modal = { tipo: 'lancar', form }; desenhar();
  },
  contaBate(d) { E.contasOk[d.id + ':' + E.mes] = true; LS.set('contasOk', E.contasOk); desenhar(); },
  async ajustarSaldo(d) {
    const c = R.porId(E.db.contas, d.id);
    const app = R.saldoConta(E.db, c);
    const banco = arred(lerValor(E.saldoBanco[d.id]));
    const dif = arred(banco - app);
    if (Math.abs(dif) < 0.005) return;
    const ok = await salvar(async () => {
      await E.banco.inserir('transacoes', [{ data: hojeISO(), desc: 'Ajuste de saldo', valor: Math.abs(dif), tipo: dif > 0 ? R.TIPO.receita : R.TIPO.despesa, meio: 'Pix', conta: c.id, dono: c.dono, pagou: c.dono, status: 'Confirmado', pago: true, conferido: true, grupoParc: 'AJUSTE', obs: 'Ajuste feito na conferência: banco ' + brl(banco) + ', app ' + brl(app), criadoPor: E.email }]);
      if (!E.banco.demo) await E.banco.carregar();
    });
    if (ok) { E.contasOk[d.id + ':' + E.mes] = true; LS.set('contasOk', E.contasOk); avisar('Saldo ajustado.'); }
  },

  // ---- investimentos
  abrirInvest(d) { E.modal = { tipo: 'invest', id: d.id }; desenhar(); },
  novoInvest() {
    const p = donoPadrao();
    E.modal = { tipo: 'investForm', form: { foraAcerto: false, nome: '', emissor: '', tipo: 'CDB', titular: E.perfil || p, indexador: 'CDI', taxa: '100', dataAplic: hojeISO(), vencimento: '', liquidez: 'Diária', isento: 'Não', valor: '', conta: primeiraConta(E.perfil && !ehFamilia(E.perfil) ? E.perfil : p) } };
    desenhar();
  },
  editarInvest(d) {
    const i = R.porId(E.db.investimentos, d.id);
    E.modal = { tipo: 'investForm', editando: i.id, form: { ...i, taxa: String(i.taxa).replace('.', ','), isento: i.isento || (I.ehIsento(i) ? 'Sim' : 'Não') } };
    desenhar();
  },
  investTitular(d) { E.modal.form.titular = d.id; if (!ehFamilia(d.id)) E.modal.form.conta = primeiraConta(d.id) || E.modal.form.conta; desenhar(); },
  investIsento() { const f = E.modal.form; f.isento = f.isento === 'Sim' ? 'Não' : 'Sim'; desenhar(); },
  async salvarInvest() {
    const f = E.modal.form;
    if (!f.nome.trim()) return avisar('Dê um nome para o investimento.', true);
    const fixo = T2.indexadorFixo(f.tipo);
    const o = { nome: f.nome.trim(), emissor: (f.emissor || '').trim(), tipo: f.tipo, titular: f.titular, indexador: fixo || f.indexador, taxa: lerValor(f.taxa), dataAplic: f.dataAplic || hojeISO(), vencimento: f.vencimento || '', liquidez: f.liquidez, isento: ['LCI', 'LCA', 'Poupança'].includes(f.tipo) ? 'Sim' : f.isento };
    const editando = E.modal.editando;
    const valor = arred(lerValor(f.valor));
    const ok = await salvar(async () => {
      if (editando) { await E.banco.atualizar('investimentos', [{ id: editando, ...o }]); return; }
      const [inv] = await E.banco.inserir('investimentos', [{ ...o, status: 'Ativo' }]);
      if (valor > 0) await E.banco.inserir('movsInv', [{ investimento: inv.id, data: o.dataAplic, tipo: 'Aporte', valor, conta: f.conta || '', obs: '', ...foraMov(o.titular, f) }]);
    });
    if (ok) { E.modal = editando ? { tipo: 'invest', id: editando } : null; avisar(editando ? 'Investimento atualizado.' : 'Investimento salvo.'); }
  },
  async arquivarInvest(d) {
    const i = R.porId(E.db.investimentos, d.id);
    const novo = i.status === 'Arquivado' ? 'Ativo' : 'Arquivado';
    const ok = await salvar(() => E.banco.atualizar('investimentos', [{ id: i.id, status: novo }]));
    if (ok) { E.modal = null; avisar(novo === 'Arquivado' ? 'Investimento arquivado.' : 'Investimento reativado.'); }
  },
  novoMov(d) {
    const i = R.porId(E.db.investimentos, E.modal.id);
    E.modalPai = E.modal;
    E.modal = { tipo: 'mov', form: { foraAcerto: false, investimento: i.id, tipo: d.v, valor: '', data: hojeISO(), conta: primeiraConta(ehFamilia(i.titular) ? eu() : i.titular) } };
    desenhar();
  },
  resgateTotal() { const f = E.modal.form; const r = T2.calcInvest(E).res[f.investimento]; f.valor = valorTxt(r.liquido); desenhar(); },
  async salvarMov() {
    const f = E.modal.form;
    const valor = arred(lerValor(f.valor));
    if (!(valor > 0)) return avisar('Digite o valor.', true);
    const inv = R.porId(E.db.investimentos, f.investimento);
    let total = false;
    const ok = await salvar(async () => {
      if (f.tipo === 'Aporte') {
        await E.banco.inserir('movsInv', [{ investimento: inv.id, data: f.data, tipo: 'Aporte', valor, conta: f.conta || '', ...foraMov(inv.titular, f) }]);
        return;
      }
      const r = T2.calcInvest(E).res[inv.id];
      const fr = Math.min(1, valor / r.liquido);
      total = fr >= 0.999;
      const bruto = arred(total ? r.bruto : r.bruto * fr);
      const temLiq = E.banco.temCampo('movsInv', 'liquido');
      await E.banco.inserir('movsInv', [{ investimento: inv.id, data: f.data, tipo: 'Resgate', valor: temLiq ? bruto : valor, conta: f.conta || '', obs: temLiq ? '' : 'Valor líquido recebido', ...(temLiq ? { liquido: valor } : {}), ...foraMov(inv.titular, f) }]);
      if (total) await E.banco.atualizar('investimentos', [{ id: inv.id, status: 'Arquivado' }]);
    });
    if (ok) { E.modal = total ? null : { tipo: 'invest', id: inv.id }; E.modalPai = null; avisar(total ? 'Resgate total registrado.' : f.tipo === 'Aporte' ? 'Aporte registrado.' : 'Resgate registrado.'); }
  },
  ajusteInv(d) {
    E.modalPai = E.modal;
    E.modal = { tipo: 'ajusteInv', form: { investimento: d.id, valor: '', base: 'liquido' } };
    desenhar();
  },
  ajusteBase(d) { E.modal.form.base = d.v; desenhar(); },
  async salvarAjusteInv() {
    const f = formAtual();
    const alvo = arred(lerValor(f.valor));
    if (!(alvo > 0)) return avisar('Digite o valor que o banco mostra.', true);
    if (!E.banco.temCampo('investimentos', 'valorBanco')) return avisar('Rode o script da planilha versão 1.13 primeiro.', true);
    const inv = R.porId(E.db.investimentos, f.investimento);
    const C = T2.calcInvest(E);
    const hoje = hojeISO();
    const movs = (E.db.movsInv || []).filter((x) => x.investimento === inv.id);
    const datas = movs.map((x) => x.data).filter(Boolean).sort();
    if (datas.length && (!C.ind.dias.length || datas[0] < C.ind.dias[0])) return avisar('Espere o robô buscar os índices que faltam antes de corrigir.', true);
    const ajuste = I.ajusteParaBater(inv, movs, C.ind, hoje, alvo, f.base || 'liquido');
    const ok = await salvar(async () => {
      if (Math.abs(ajuste) >= 0.01) await E.banco.inserir('movsInv', [{ investimento: inv.id, data: hoje, tipo: 'Ajuste', valor: ajuste, conta: '', obs: `banco mostrou ${brl(alvo)} ${f.base === 'bruto' ? 'bruto' : 'líquido'}` }]);
      await E.banco.atualizar('investimentos', [{ id: inv.id, valorBanco: alvo, valorBancoEm: hoje }]);
    });
    if (ok) { E.modal = { tipo: 'invest', id: inv.id }; E.modalPai = null; avisar(Math.abs(ajuste) >= 0.01 ? 'Rendimento corrigido pelo banco.' : 'Já estava igual ao banco.'); }
  },
  excluirMov(d) {
    const mv = R.porId(E.db.movsInv, d.id);
    E.modalPai = E.modal;
    E.modal = { tipo: 'confirmar', titulo: 'Excluir movimentação?', alvo: { id: d.id, inv: mv.investimento }, texto: `${mv.tipo} de ${brl(mv.valor)} em ${mv.data.split('-').reverse().join('/')}. Não dá para desfazer.`, opcoes: [['confirmarExcluirMov', 'Excluir', true]] };
    desenhar();
  },
  async confirmarExcluirMov() {
    const { id, inv } = E.modal.alvo;
    const ok = await salvar(() => E.banco.excluir('movsInv', [id]));
    if (ok) { E.modal = { tipo: 'invest', id: inv }; E.modalPai = null; avisar('Movimentação excluída.'); }
  },

  salvarParcelaUma() { E.modal = E.modalPai; E.modalPai = null; E.modal.escopo = 'uma'; A.salvarLancamento(); },
  salvarParcelaProximas() { E.modal = E.modalPai; E.modalPai = null; E.modal.escopo = 'proximas'; A.salvarLancamento(); },
  tagTirar(d) { const f = formAtual(); f.tags = f.tags.filter((x) => x !== d.v); desenhar(); },
  tagPor(d) { const f = formAtual(); addTag(f, d.v); desenhar(); },
  tagAdicionar() { const f = formAtual(); addTag(f, f.tagNova); desenhar(); setTimeout(() => { const el = document.querySelector('[data-campo="tagNova"]'); if (el) el.focus(); }, 30); },
  lancTransf(d) { const f = E.modal.form; f.transf = d.v; desenhar(); },
  parcelas(d) { const f = E.modal.form; f.parcelas = Math.max(1, Math.min(48, f.parcelas + Number(d.v))); desenhar(); },
  abrirSeletor(d) { E.modalPai = E.modal; E.modal = { tipo: 'seletor', campo: d.v }; desenhar(); },
  fecharSeletor() { E.modal = E.modalPai; E.modalPai = null; desenhar(); },
  escolher(d) {
    const campo = E.modal.campo;
    const pf = E.modalPai.form;
    pf[campo] = d.id;
    if (campo === 'cartao' && pf.tipo === 'transferencia' && pf.transf === 'fatura' && !E.modalPai.editando) {
      const pp = R.pagaPorDe(E.db, R.porId(E.db.cartoes, d.id));
      if (pp && R.donoDaConta(E.db, pf.conta) !== pp) pf.conta = primeiraConta(pp);
    }
    E.modal = E.modalPai; E.modalPai = null; desenhar();
  },
  async salvarLancamento() {
    const f = E.modal.form;
    const valor = arred(lerValor(f.valor));
    if (!(valor > 0)) return avisar('Digite o valor.', true);
    if (f.tipo !== 'transferencia' && !f.desc.trim()) return avisar('Escreva uma descrição.', true);
    if (E.modal.editando && f.grupo && f.parcelas > 1 && !E.modal.escopo) {
      const t = R.porId(E.db.transacoes, E.modal.editando);
      const prox = E.db.transacoes.filter((x) => x.grupoParc === t.grupoParc && x.id !== t.id && !x.conferido && x.parcela > t.parcela).length;
      E.modalPai = E.modal;
      E.modal = { tipo: 'confirmar', titulo: 'Aplicar a mudança em quais parcelas?',
        texto: `Esta é a parcela ${t.parcela} de ${t.totalParcelas}.` + (prox ? ` Há mais ${prox} parcela${prox === 1 ? '' : 's'} depois dela ainda não conferida${prox === 1 ? '' : 's'}.` : ' As próximas já foram conferidas ou não existem.'),
        opcoes: [['salvarParcelaUma', 'Só esta parcela']].concat(prox ? [['salvarParcelaProximas', 'Esta e as próximas ' + (prox + 1)]] : []) };
      desenhar();
      return;
    }
    const ok = await salvar(async () => {
      if (E.modal.editando) await atualizarLancamento(f, valor); else await gravarLancamento(f, valor);
    });
    if (ok) {
      const editou = E.modal && E.modal.editando;
      E.modal = null; E.modalPai = null;
      avisar(editou ? 'Alteração salva.' : 'Lançamento salvo.');
    }
  },
  abrirDetalhe(d) { E.modal = { tipo: 'detalhe', id: d.id, k: d.k }; desenhar(); },
  editarLancamento() {
    const m = E.modal;
    if (m.k === 'ren') {
      const r = R.porId(E.db.rendas, m.id);
      E.modal = {
        tipo: 'lancar', editando: r.id, editandoRenda: true,
        form: { ...novoForm('receita'), valor: valorTxt(r.valor), data: r.data, dataModo: 'outra', desc: r.desc || '', conta: r.conta || '', dono: r.pessoa, renda: true, tags: R.tagsDe(r), recorrencia: r.recorrencia || '' },
      };
      desenhar(); return;
    }
    const t = R.porId(E.db.transacoes, m.id);
    const tipo = t.tipo === R.TIPO.fatura || t.tipo === R.TIPO.transf ? 'transferencia' : t.tipo === R.TIPO.receita ? 'receita' : t.cartao ? 'cartao' : 'despesa';
    E.modal = {
      tipo: 'lancar', editando: t.id,
      form: {
        tipo, valor: valorTxt(t.valor), data: t.data, dataModo: 'outra', desc: t.desc || '', categoria: t.categoria || '', obs: t.obs || '',
        conta: t.conta || '', cartao: t.cartao || '', contaDestino: t.contaDestino || '', parcelas: t.totalParcelas || 1, meio: t.meio || 'Pix',
        dono: t.dono || '', renda: false, transf: t.tipo === R.TIPO.transf ? 'conta' : 'fatura', grupo: t.grupoParc || '',
        tags: R.tagsDe(t), tagNova: '', deduz: !!t.deduz, recorrencia: t.recorrencia || '', estorno: t.tipo === R.TIPO.estorno, foraAcerto: !!t.foraAcerto, divisao: t.divisao || '',
      },
    };
    desenhar();
  },
  confirmarPrevisto() {
    const p = R.acharPrevisto(E.db, E.modal.id);
    if (!p) return;
    const tipo = p.ehRenda || p.tipo === R.TIPO.receita ? 'receita' : p.cartao ? 'cartao' : 'despesa';
    const f = { ...novoForm(tipo), valor: valorTxt(p.valor), data: p.data, dataModo: 'outra', desc: p.desc || '', categoria: p.categoria || '', conta: p.conta || primeiraConta(p.dono), cartao: p.cartao || '', meio: p.meio && p.meio !== 'Crédito' ? p.meio : 'Pix', dono: p.dono, renda: !!p.ehRenda, tags: R.tagsDe(p), deduz: !!p.deduz, recorrencia: p.recorrencia, mesRec: p.id.split(':')[2] || '' };
    E.modal = { tipo: 'lancar', form: f }; desenhar();
  },
  editarFixa(d) {
    const r = R.porId(E.db.recorrencias, d.id);
    if (!r) return;
    E.modal = { tipo: 'fixa', form: { ...r, valor: valorTxt(r.valor) } }; desenhar();
  },
  fixaDia(d) { const f = E.modal.form; f.dia = ((Number(f.dia) - 1 + Number(d.v) + 31) % 31) + 1; desenhar(); },
  async salvarFixa() {
    const f = E.modal.form;
    const ok = await salvar(() => E.banco.atualizar('recorrencias', [{ id: f.id, desc: (f.desc || '').trim(), valor: arred(lerValor(f.valor)), dia: f.dia }]));
    if (ok) { E.modal = null; avisar('Conta fixa atualizada.'); }
  },
  async encerrarFixa() {
    const f = E.modal.form;
    const reativar = f.status === 'Arquivado';
    const ok = await salvar(() => E.banco.atualizar('recorrencias', [{ id: f.id, status: reativar ? 'Ativo' : 'Arquivado', fim: reativar ? '' : hojeISO() }]));
    if (ok) { E.modal = null; avisar(reativar ? 'Conta fixa reativada.' : 'Conta fixa encerrada. O que já foi lançado continua.'); }
  },
  excluirLancamento() {
    const m = E.modal;
    const t = m.k === 'ren' ? R.porId(E.db.rendas, m.id) : R.porId(E.db.transacoes, m.id);
    const grupo = m.k !== 'ren' && t.grupoParc && t.totalParcelas > 1 ? E.db.transacoes.filter((x) => x.grupoParc === t.grupoParc) : null;
    E.modal = {
      tipo: 'confirmar', titulo: 'Excluir lançamento?', alvo: { k: m.k, id: m.id, grupo: grupo ? t.grupoParc : null },
      texto: grupo ? `"${t.desc}" tem ${grupo.length} parcelas. Excluir só esta ou todas?` : `"${t.desc || 'Lançamento'}" de ${brl(t.valor)} sai da planilha. Não dá para desfazer.`,
      opcoes: grupo ? [['confirmarExclusao', 'Só esta parcela', true], ['confirmarExclusaoGrupo', 'Todas as ' + grupo.length + ' parcelas', true]] : [['confirmarExclusao', 'Excluir', true]],
    };
    desenhar();
  },
  async confirmarExclusao() { await excluir(false); },
  async confirmarExclusaoGrupo() { await excluir(true); },
  async alternarConferido() {
    const t = R.porId(E.db.transacoes, E.modal.id);
    const ok = await salvar(() => E.banco.atualizar('transacoes', [{ id: t.id, conferido: !t.conferido }]));
    if (ok) desenhar();
  },

  // ---- acerto
  registrarAcerto() {
    const ac = R.acertoDoMes(E.db, E.mes);
    if (!ac.resultado) return;
    const r = ac.resultado;
    const nome = (id) => R.porId(E.db.pessoas, id).nome;
    const temDestino = E.banco.temCampo('transacoes', 'contaDestino');
    E.modal = {
      tipo: 'confirmar', titulo: 'Registrar o acerto?', alvo: r,
      texto: `Registra que <strong>${nome(r.de)}</strong> transferiu <strong>${brl(r.valor)}</strong> para <strong>${nome(r.para)}</strong> referente a ${nomeMesAno(E.mes).toLowerCase()}.` +
        (temDestino ? ` A transferência sai da primeira conta de ${nome(r.de)} e entra na primeira de ${nome(r.para)}; dá para editar depois em Transações.` : ''),
      opcoes: [['confirmarAcerto', 'Registrar acerto']],
    };
    desenhar();
  },
  async confirmarAcerto() {
    const r = E.modal.alvo;
    const ok = await salvar(async () => {
      const [a] = await E.banco.inserir('acertos', [{ data: hojeISO(), de: r.de, para: r.para, valor: r.valor, mesRef: E.mes, obs: 'Registrado pelo app' }]);
      if (E.banco.temCampo('transacoes', 'contaDestino')) {
        const de = primeiraConta(r.de), para = primeiraConta(r.para);
        const cde = R.porId(E.db.contas, de), cpara = R.porId(E.db.contas, para);
        if (cde && cpara && cde.dono === r.de && cpara.dono === r.para) {
          await E.banco.inserir('transacoes', [{ data: hojeISO(), desc: 'Acerto de ' + nomeMesAno(E.mes).split(' ')[0].toLowerCase(), valor: r.valor, tipo: R.TIPO.transf, meio: 'Pix', conta: de, contaDestino: para, pagou: r.de, dono: r.para, status: 'Confirmado', pago: true, grupoParc: a.id, criadoPor: E.email }]);
        }
      }
      if (!E.banco.demo) await E.banco.carregar();
    });
    if (ok) { E.modal = null; avisar('Acerto registrado.'); }
  },

  // ---- contas e cartões
  novaConta() {
    const voltar = E.modal && E.modal.tipo === 'seletor' ? null : null;
    E.modal = { tipo: 'conta', form: { nome: '', dono: perfilAtual(), tipo: 'Conta corrente', banco: '', saldoInicial: '', dataSaldo: hojeISO(), cor: 'Roxo', status: 'Ativo' }, voltar }; E.modalPai = null; desenhar();
  },
  editarConta(d) { const c = R.porId(E.db.contas, d.id); E.modal = { tipo: 'conta', form: { ...c, saldoInicial: String(c.saldoInicial || 0).replace('.', ',') } }; desenhar(); },
  formDono(d) { E.modal.form.dono = d.id; desenhar(); },
  formPessoa(d) { E.modal.form.pessoa = d.id; const c = primeiraConta(d.id); if (c) E.modal.form.conta = c; desenhar(); },
  formCor(d) { E.modal.form.cor = d.v; desenhar(); },
  formDia(d) { const [k, n] = d.v.split(':'); const f = E.modal.form; f[k] = ((Number(f[k]) - 1 + Number(n) + 31) % 31) + 1; desenhar(); },
  formRendaRef(d) { E.modal.form.rendaRef = d.v; desenhar(); },
  async salvarConta() {
    const f = E.modal.form;
    if (!f.nome.trim()) return avisar('Dê um nome para a conta.', true);
    const o = { nome: f.nome.trim(), dono: f.dono, tipo: f.tipo, banco: f.banco || '', saldoInicial: arred(lerValor(f.saldoInicial)), dataSaldo: f.dataSaldo || hojeISO(), cor: f.cor, status: f.status || 'Ativo' };
    const ok = await salvar(() => (f.id ? E.banco.atualizar('contas', [{ id: f.id, ...o }]) : E.banco.inserir('contas', [o])));
    if (ok) { E.modal = null; avisar('Conta salva.'); }
  },
  async arquivarConta() {
    const f = E.modal.form;
    const novo = f.status === 'Arquivado' ? 'Ativo' : 'Arquivado';
    const ok = await salvar(() => E.banco.atualizar('contas', [{ id: f.id, status: novo }]));
    if (ok) { E.modal = null; avisar(novo === 'Arquivado' ? 'Conta arquivada. O histórico continua.' : 'Conta reativada.'); }
  },
  novoCartao() { E.modal = { tipo: 'cartao', form: { nome: '', dono: perfilAtual(), pagaPor: donoPadrao(), fecha: 28, vence: 5, rendaRef: 'Mês anterior ao vencimento', limite: '', cor: 'Roxo', status: 'Ativo' } }; E.modalPai = null; desenhar(); },
  editarCartao(d) { const c = R.porId(E.db.cartoes, d.id); E.modal = { tipo: 'cartao', form: { ...c, pagaPor: R.pagaPorDe(E.db, c), limite: c.limite ? String(c.limite).replace('.', ',') : '' } }; desenhar(); },
  formPagaPor(d) { E.modal.form.pagaPor = d.id; desenhar(); },
  async salvarCartao() {
    const f = E.modal.form;
    if (!f.nome.trim()) return avisar('Dê um nome para o cartão.', true);
    if (!f.pagaPor || ehFamilia(f.pagaPor)) return avisar('Escolha quem paga a fatura (Demétrio ou Giovanna).', true);
    const temPagaPor = E.banco.temCampo('cartoes', 'pagaPor');
    if (!temPagaPor) return avisar('Rode o script da planilha versão 1.11 para salvar "Paga por" no cartão.', true);
    const o = { nome: f.nome.trim(), dono: f.dono, pagaPor: f.pagaPor, fecha: f.fecha, vence: f.vence, rendaRef: f.rendaRef, limite: f.limite === '' ? '' : arred(lerValor(f.limite)), cor: f.cor, status: f.status || 'Ativo' };
    const antigo = f.id ? { ...R.porId(E.db.cartoes, f.id) } : null;
    let datas = [], movidas = 0;
    const ok = await salvar(async () => {
      if (f.id) await E.banco.atualizar('cartoes', [{ id: f.id, ...o }]); else await E.banco.inserir('cartoes', [o]);
      // dia de fechamento/vencimento mudou: ajusta as faturas não conferidas e move as compras
      datas = R.faturasComDiaAntigo(E.banco.db, antigo, { ...antigo, ...o });
      if (datas.length) await E.banco.atualizar('faturas', datas);
      const meses = R.faturasComMesErrado(E.banco.db);
      if (meses.length) await E.banco.atualizar('faturas', meses);
      const pagou = R.pagadoresErrados(E.banco.db);
      if (pagou.length) await E.banco.atualizar('transacoes', pagou);
      if (datas.length) movidas = await moverComprasErradas(f.id);
    });
    if (ok) {
      E.modal = null;
      avisar(datas.length ? `Cartão salvo. ${datas.length} fatura${datas.length === 1 ? '' : 's'} com as datas novas${movidas ? ` e ${movidas} compra${movidas === 1 ? '' : 's'} mudou${movidas === 1 ? '' : 'aram'} de fatura` : ''}.` : 'Cartão salvo.');
    }
  },
  async arquivarCartao() {
    const f = E.modal.form;
    const novo = f.status === 'Arquivado' ? 'Ativo' : 'Arquivado';
    const ok = await salvar(() => E.banco.atualizar('cartoes', [{ id: f.id, status: novo }]));
    if (ok) { E.modal = null; avisar(novo === 'Arquivado' ? 'Cartão arquivado. O histórico continua.' : 'Cartão reativado.'); }
  },

  // ---- rendas
  novaRenda() {
    if (!E.db.contas.some(R.ativo)) { avisar('Cadastre ao menos uma conta antes de lançar.', true); ir('contas'); return; }
    const f = novoForm('receita'); f.desc = 'Salário'; f.renda = true;
    E.modal = { tipo: 'lancar', form: f }; desenhar();
  },
  async salvarRenda() {
    const f = E.modal.form;
    const valor = arred(lerValor(f.valor));
    if (!(valor > 0)) return avisar('Digite o valor.', true);
    const o = { data: f.data || hojeISO(), pessoa: f.pessoa, desc: (f.desc || 'Renda').trim(), valor, conta: f.conta || '' };
    const ok = await salvar(() => (f.id ? E.banco.atualizar('rendas', [{ id: f.id, ...o }]) : E.banco.inserir('rendas', [o])));
    if (ok) { E.modal = null; avisar('Renda salva.'); }
  },
  async mudarRegra(d) {
    const f = fam();
    if (!f) return;
    const ok = await salvar(() => E.banco.atualizar('pessoas', [{ id: f.id, divisaoPadrao: d.v }]));
    if (ok) avisar('Regra atualizada para os gastos novos.');
  },

  // ---- faturas
  verEncerradas() { E.verEncerradas = !E.verEncerradas; desenhar(); },
  selCartao(d) { E.cartaoSel = d.id; E.faturaSel = null; desenhar(); },
  selDonoFatura(d) { E.faturasDono = d.id; E.cartaoSel = null; E.faturaSel = null; desenhar(); },
  selFatura(d) { if (d.id) { E.faturaSel = d.id; desenhar(); } },
  alterarFechamento(d) { const f = R.porId(E.db.faturas, d.id); E.modal = { tipo: 'fechamento', form: { id: f.id, fechamento: f.fechamento, vencimento: f.vencimento } }; desenhar(); },
  async salvarFechamento() {
    const f = E.modal.form;
    if (!f.fechamento || !f.vencimento) return avisar('Preencha as duas datas.', true);
    const ok = await salvar(async () => {
      await E.banco.atualizar('faturas', [{ id: f.id, fechamento: f.fechamento, vencimento: f.vencimento }]);
      const meses = R.faturasComMesErrado(E.banco.db);
      if (meses.length) await E.banco.atualizar('faturas', meses);
      await redistribuirCompras(R.porId(E.db.faturas, f.id));
    });
    if (ok) { E.modal = null; avisar('Datas da fatura atualizadas.'); }
  },
  pagarFatura(d) {
    const fat = R.porId(E.db.faturas, d.id);
    const c = R.porId(E.db.cartoes, fat.cartao);
    const form = novoForm('transferencia');
    form.transf = 'fatura'; form.cartao = c.id; form.conta = primeiraConta(R.pagaPorDe(E.db, c));
    form.valor = String(R.totalFatura(E.db, fat.id)).replace('.', ',');
    form.desc = 'Pagamento da fatura ' + c.nome;
    form.faturaAlvo = fat.id;
    E.modal = { tipo: 'lancar', form }; desenhar();
  },
};

// ------------------------------------------------------- gravações
// "Fora do acerto" de um aporte/resgate: só quando a planilha tem a coluna e a Família está envolvida
function foraMov(titular, f) {
  if (!E.banco.temCampo('movsInv', 'foraAcerto')) return {};
  return { foraAcerto: R.donosDiferentes(R.donoDaConta(E.db, f.conta), titular) && !!f.foraAcerto };
}

async function garantirFatura(cartao, data, deslocamento, criadas) {
  const db = E.banco.db;
  const f = R.faturaPara({ ...db, faturas: [...db.faturas, ...criadas] }, cartao, data, deslocamento);
  if (f.id) return f.id;
  const [nova] = await E.banco.inserir('faturas', [{ cartao: cartao.id, competencia: f.competencia, fechamento: f.fechamento, vencimento: f.vencimento, mesRenda: f.mesRenda, status: 'Aberta', conferida: false }]);
  criadas.push(nova);
  return nova.id;
}

async function gravarLancamento(f, valor) {
  const db = E.db;
  const famId = fam() ? fam().id : '';
  const regra = f.divisao || (fam() || {}).divisaoPadrao || 'Proporcional à renda';
  const futuro = f.data > hojeISO();
  const v18 = E.banco.temCampo('transacoes', 'tags');
  const tags = (f.tags || []).join(', ');
  const extra = v18 ? { tags, deduz: !!f.deduz && f.dono !== famId } : {};
  const base = { data: f.data, desc: f.desc.trim(), obs: f.obs || '', criadoPor: E.email, status: futuro ? 'Previsto' : 'Confirmado', recorrencia: f.recorrencia || '', ...extra };
  if (f.recorrencia && f.mesRec && E.banco.temCampo('transacoes', 'mesRec')) base.mesRec = f.mesRec;
  const ehRenda = f.tipo === 'receita' && f.renda && f.dono !== famId;

  // "Repetir todo mês": cria a conta fixa e liga o primeiro lançamento a ela
  if (f.repetir && !f.recorrencia && v18 && f.tipo !== 'transferencia') {
    const origem = f.tipo === 'cartao' ? R.porId(db.cartoes, f.cartao) : R.porId(db.contas, f.conta);
    const [rec] = await E.banco.inserir('recorrencias', [{
      desc: f.desc.trim(), valor, categoria: f.categoria || '', meio: f.tipo === 'cartao' ? 'Crédito' : f.tipo === 'despesa' ? f.meio : 'Pix',
      cartao: f.tipo === 'cartao' ? f.cartao : '', conta: f.tipo === 'cartao' ? '' : f.conta, dia: Number(f.data.slice(8, 10)), dono: f.dono,
      pagou: origem ? (f.tipo === 'cartao' ? R.pagaPorDe(db, origem) : origem.dono) : '', divisao: f.dono === famId ? regra : '', inicio: somaMes(mesDe(f.data), 1) + '-01', // previstas só a partir do mês seguinte
      fim: Number(f.repetirMeses) > 0 ? dataNoMes(somaMes(mesDe(f.data), Number(f.repetirMeses) - 1), 31) : '', status: 'Ativo', varia: 'Não',
      tipo: ehRenda ? 'Renda' : f.tipo === 'receita' ? 'Receita' : 'Despesa', tags, deduz: !!extra.deduz,
    }]);
    base.recorrencia = rec.id;
  }

  if (f.tipo === 'despesa') {
    const c = R.porId(db.contas, f.conta);
    if (!c) throw new Error('Escolha a conta de onde saiu o dinheiro.');
    await E.banco.inserir('transacoes', [{ ...base, valor, tipo: R.TIPO.despesa, categoria: f.categoria, meio: f.meio, conta: c.id, dono: f.dono, pagou: c.dono, divisao: f.dono === famId ? regra : '', pago: !futuro, dataPag: futuro ? '' : f.data }]);
  } else if (f.tipo === 'cartao' && f.estorno) {
    const c = R.porId(db.cartoes, f.cartao);
    if (!c) throw new Error('Escolha o cartão.');
    const fatura = await garantirFatura(c, f.data, 0, []);
    await E.banco.inserir('transacoes', [{ ...base, deduz: false, status: 'Confirmado', valor, tipo: R.TIPO.estorno, categoria: f.categoria, meio: 'Crédito', cartao: c.id, fatura, dono: f.dono, pagou: R.pagaPorDe(db, c), divisao: f.dono === famId ? regra : '', pago: false }]);
  } else if (f.tipo === 'cartao') {
    const c = R.porId(db.cartoes, f.cartao);
    if (!c) throw new Error('Escolha o cartão.');
    const n = f.parcelas;
    const valores = R.valoresParcelas(valor, n);
    const grupo = n > 1 ? 'PAR-' + Date.now().toString(36).toUpperCase() : '';
    const criadas = [];
    const linhas = [];
    for (let k = 0; k < n; k++) {
      const fatura = await garantirFatura(c, f.data, k, criadas);
      linhas.push({ ...base, status: 'Confirmado', valor: valores[k], tipo: R.TIPO.despesa, categoria: f.categoria, meio: 'Crédito', cartao: c.id, fatura, parcela: n > 1 ? k + 1 : '', totalParcelas: n > 1 ? n : '', grupoParc: grupo, dono: f.dono, pagou: R.pagaPorDe(db, c), divisao: f.dono === famId ? regra : '', pago: false });
    }
    await E.banco.inserir('transacoes', linhas);
  } else if (f.tipo === 'receita') {
    const c = R.porId(db.contas, f.conta);
    if (!c) throw new Error('Escolha a conta em que o dinheiro caiu.');
    if (ehRenda) {
      const r = { data: f.data, pessoa: f.dono, desc: f.desc.trim(), valor, conta: c.id };
      if (E.banco.temCampo('rendas', 'tags')) { r.tags = tags; r.recorrencia = base.recorrencia || ''; }
      if (f.recorrencia && f.mesRec && E.banco.temCampo('rendas', 'mesRec')) r.mesRec = f.mesRec;
      await E.banco.inserir('rendas', [r]);
    } else {
      await E.banco.inserir('transacoes', [{ ...base, deduz: false, valor, tipo: R.TIPO.receita, categoria: f.categoria, meio: 'Pix', conta: c.id, dono: f.dono, pagou: c.dono, divisao: f.dono === famId ? regra : '', pago: true }]);
    }
  } else {
    const c = R.porId(db.contas, f.conta);
    if (!c) throw new Error('Escolha a conta de onde sai o dinheiro.');
    if (f.transf === 'fatura') {
      const k = R.porId(db.cartoes, f.cartao);
      if (!k) throw new Error('Escolha o cartão.');
      const fat = f.faturaAlvo ? R.porId(db.faturas, f.faturaAlvo) : R.faturaAtual(db, k, hojeISO());
      if (!fat) throw new Error('Este cartão não tem fatura em aberto.');
      await E.banco.inserir('transacoes', [{ ...base, deduz: false, status: 'Confirmado', desc: base.desc || 'Pagamento da fatura ' + k.nome, valor, tipo: R.TIPO.fatura, meio: 'Pix', conta: c.id, cartao: k.id, fatura: fat.id, pagou: c.dono, dono: R.pagaPorDe(db, k), pago: true, dataPag: f.data }]);
      const dbx = E.banco.db;
      const pago = arred(dbx.transacoes.filter((t) => t.tipo === R.TIPO.fatura && t.fatura === fat.id).reduce((s, t) => s + t.valor, 0));
      if (pago >= R.totalFatura(dbx, fat.id) - 0.005) await E.banco.atualizar('faturas', [{ id: fat.id, status: 'Paga', dataPag: f.data, pagoPor: c.dono }]);
    } else {
      if (!E.banco.temCampo('transacoes', 'contaDestino')) throw new Error('A planilha precisa da coluna "Conta de destino (ID)". Rode o script de montagem mais novo na planilha e tente de novo.');
      const d = R.porId(db.contas, f.contaDestino);
      if (!d) throw new Error('Escolha a conta que recebe.');
      if (d.id === c.id) throw new Error('As contas de origem e destino são a mesma.');
      await E.banco.inserir('transacoes', [{ ...base, deduz: false, desc: base.desc || 'Transferência', valor, tipo: R.TIPO.transf, meio: 'Pix', conta: c.id, contaDestino: d.id, pagou: c.dono, dono: d.dono, pago: true, dataPag: f.data, ...(E.banco.temCampo('transacoes', 'foraAcerto') && R.donosDiferentes(c.dono, d.dono) ? { foraAcerto: !!f.foraAcerto } : {}) }]);
    }
  }
  if (!E.banco.demo) await E.banco.carregar();
}

async function atualizarLancamento(f, valor) {
  const db = E.db;
  const m = E.modal;
  const famId = fam() ? fam().id : '';
  const v18 = E.banco.temCampo('transacoes', 'tags');
  const tags = (f.tags || []).join(', ');
  const querRenda = f.tipo === 'receita' && f.renda && f.dono !== famId;

  // renda ↔ receita: muda de aba (Rendas ↔ Transações)
  if (m.editandoRenda) {
    const r = R.porId(db.rendas, m.editando);
    const c = R.porId(db.contas, f.conta);
    if (querRenda) {
      const o = { id: r.id, data: f.data, pessoa: f.dono, desc: f.desc.trim(), valor, conta: c ? c.id : '' };
      if (E.banco.temCampo('rendas', 'tags')) o.tags = tags;
      if (r.recorrencia && !r.mesRec && mesDe(f.data) !== mesDe(r.data) && E.banco.temCampo('rendas', 'mesRec')) o.mesRec = mesDe(r.data);
      await E.banco.atualizar('rendas', [o]);
    } else {
      await E.banco.inserir('transacoes', [{ data: f.data, desc: f.desc.trim(), obs: f.obs || '', criadoPor: E.email, status: 'Confirmado', valor, tipo: R.TIPO.receita, categoria: f.categoria, meio: 'Pix', conta: c ? c.id : '', dono: f.dono, pagou: c ? c.dono : '', divisao: f.dono === famId ? (fam().divisaoPadrao || '') : '', pago: true, recorrencia: r.recorrencia || '', ...(v18 ? { tags } : {}) }]);
      await E.banco.excluir('rendas', [r.id]);
    }
    if (!E.banco.demo) await E.banco.carregar();
    return;
  }
  const t = R.porId(db.transacoes, m.editando);
  if (t.tipo === R.TIPO.receita && querRenda) {
    const c = R.porId(db.contas, f.conta);
    const r = { data: f.data, pessoa: f.dono, desc: f.desc.trim(), valor, conta: c ? c.id : '' };
    if (E.banco.temCampo('rendas', 'tags')) { r.tags = tags; r.recorrencia = t.recorrencia || ''; }
    await E.banco.inserir('rendas', [r]);
    await E.banco.excluir('transacoes', [t.id]);
    if (!E.banco.demo) await E.banco.carregar();
    return;
  }
  const comuns = { desc: f.desc.trim() || t.desc, categoria: f.categoria, dono: f.dono, obs: f.obs || '', ...(v18 ? { tags, deduz: !!f.deduz && f.dono !== famId } : {}) };
  if (t.grupoParc && t.totalParcelas > 1) {
    // parcela: só esta, ou esta e as próximas ainda não conferidas
    const alvo = m.escopo === 'proximas'
      ? db.transacoes.filter((x) => x.grupoParc === t.grupoParc && (x.id === t.id || (!x.conferido && x.parcela > t.parcela)))
      : [t];
    await E.banco.atualizar('transacoes', alvo.map((x) => ({ id: x.id, ...comuns, valor, divisao: f.dono === famId ? (f.divisao || x.divisao || fam().divisaoPadrao) : '' })));
  } else {
    const o = { id: t.id, ...comuns, valor, data: f.data, divisao: f.dono === famId ? (f.divisao || t.divisao || (fam() || {}).divisaoPadrao || '') : '' };
    // conta fixa com a data mudada para outro mês: continua sendo do mês original
    if (t.recorrencia && !t.mesRec && mesDe(f.data) !== mesDe(t.data) && E.banco.temCampo('transacoes', 'mesRec')) o.mesRec = mesDe(t.data);
    if (f.tipo === 'cartao') {
      const c = R.porId(db.cartoes, f.cartao);
      o.cartao = c.id; o.pagou = R.pagaPorDe(db, c); o.fatura = await garantirFatura(c, f.data, 0, []);
    } else if (f.tipo === 'despesa' || f.tipo === 'receita') {
      const c = R.porId(db.contas, f.conta);
      o.conta = c.id; o.pagou = c.dono;
      if (f.tipo === 'despesa') o.meio = f.meio;
      if (f.tipo === 'receita') o.deduz = false;
    } else if (f.tipo === 'transferencia') {
      o.conta = f.conta; o.pagou = (R.porId(db.contas, f.conta) || {}).dono || ''; o.deduz = false;
      if (t.tipo === R.TIPO.transf) {
        o.contaDestino = f.contaDestino; o.dono = (R.porId(db.contas, f.contaDestino) || {}).dono || '';
        if (E.banco.temCampo('transacoes', 'foraAcerto')) o.foraAcerto = R.donosDiferentes(o.pagou, o.dono) && !!f.foraAcerto;
      }
      else o.dono = t.dono;
    }
    o.status = f.data > hojeISO() ? 'Previsto' : 'Confirmado';
    if (!v18) delete o.deduz;
    await E.banco.atualizar('transacoes', [o]);
  }
  if (!E.banco.demo) await E.banco.carregar();
}

async function excluir(todoGrupo) {
  const alvo = E.modal.alvo;
  const ok = await salvar(async () => {
    if (alvo.k === 'ren') { await E.banco.excluir('rendas', [alvo.id]); return; }
    const t = R.porId(E.db.transacoes, alvo.id);
    const ids = todoGrupo && alvo.grupo ? E.db.transacoes.filter((x) => x.grupoParc === alvo.grupo).map((x) => x.id) : [alvo.id];
    await E.banco.excluir('transacoes', ids);
    if (t && t.tipo === R.TIPO.fatura && t.fatura) {
      const fat = R.porId(E.db.faturas, t.fatura);
      if (fat && fat.status === 'Paga') await E.banco.atualizar('faturas', [{ id: fat.id, status: 'Aberta', dataPag: '' }]);
    }
    // acerto registrado pelo app: apaga junto a linha da aba Acertos
    if (t && t.grupoParc && /^ACE-/.test(t.grupoParc)) await E.banco.excluir('acertos', [t.grupoParc]);
  });
  if (ok) { E.modal = null; avisar('Excluído.'); }
}

// Depois de mudar as datas de uma fatura: compras à vista (ou 1ª parcela)
// da fatura e da vizinha mudam de fatura se a data pedir.
async function redistribuirCompras(fat) {
  const db = E.db;
  const c = R.porId(db.cartoes, fat.cartao);
  const lista = R.faturasDoCartao(db, c.id);
  const i = lista.findIndex((x) => x.id === fat.id);
  const vizinhas = [lista[i - 1], lista[i], lista[i + 1]].filter(Boolean).map((x) => x.id);
  const mudar = [];
  const criadas = [];
  for (const t of db.transacoes) {
    if (!vizinhas.includes(t.fatura) || !R.ehGasto(t) || (t.totalParcelas > 1 && t.parcela > 1)) continue;
    const certa = await garantirFatura(c, t.data, 0, criadas);
    if (certa !== t.fatura) mudar.push({ id: t.id, fatura: certa });
  }
  if (mudar.length) await E.banco.atualizar('transacoes', mudar);
  if (!E.banco.demo) await E.banco.carregar();
}

// ------------------------------------------------------------ eventos
document.addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-a]');
  if (!el || el.getAttribute('aria-disabled') === 'true') return;
  const fn = A[el.dataset.a];
  if (!fn) return;
  ev.preventDefault();
  fn(el.dataset);
});
function ajustarAltura(el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; }
document.addEventListener('input', (ev) => {
  const el = ev.target;
  if (!el.dataset) return;
  if (el.dataset.filtro === 'busca') { E.filtros.busca = el.value; return; }
  if (el.dataset.novaCat) { E.novaCat = E.novaCat || {}; E.novaCat[el.dataset.novaCat] = el.value; return; }
  if (el.dataset.saldoBanco) { el.value = mascarar(el.value, true); E.saldoBanco[el.dataset.saldoBanco] = el.value; return; }
  if (el.dataset.totalBanco) { el.value = mascarar(el.value, false); return; }
  if (el.dataset.mascara === 'dinheiro') {
    const novo = mascarar(el.value, !!el.dataset.negativo);
    if (novo !== el.value) { el.value = novo; try { el.setSelectionRange(novo.length, novo.length); } catch (e) { /* ok */ } }
  }
  if (el.classList.contains('auto-altura')) ajustarAltura(el);
  const campo = el.dataset.campo;
  const f = campo && formAtual();
  if (f) f[campo] = el.value;
  if (campo === 'tagNova' && /,$/.test(el.value)) { addTag(f, el.value); desenhar(); }
});
document.addEventListener('change', (ev) => {
  const el = ev.target;
  if (!el.isConnected) return; // campo que acabou de ser redesenhado
  if (el.dataset && el.dataset.filtro) { E.filtros[el.dataset.filtro] = el.value; desenhar(); return; }
  if (el.dataset && el.dataset.novaCat) { E.novaCat = E.novaCat || {}; E.novaCat[el.dataset.novaCat] = el.value; return; }
  if (el.dataset && el.dataset.saldoBanco) { setTimeout(desenhar, 0); return; }
  if (el.dataset && el.dataset.totalBanco) {
    const id = el.dataset.totalBanco;
    const v = el.value === '' ? '' : arred(lerValor(el.value));
    salvar(() => E.banco.atualizar('faturas', [{ id, totalBanco: v }])).then((ok) => { if (ok) setTimeout(desenhar, 0); });
    return;
  }
  const campo = el.dataset && el.dataset.campo;
  const f = campo && formAtual();
  if (!f) return;
  f[campo] = el.value;
  if (E.modal && E.modal.tipo === 'investForm' && campo === 'tipo') {
    const fixo = T2.indexadorFixo(el.value);
    if (fixo) f.indexador = fixo;
    if (['LCI', 'LCA', 'Poupança'].includes(el.value)) f.isento = 'Sim';
  }
  if (el.type === 'date') { el.dataset.mudou = '1'; return; } // redesenha ao sair do campo (digitar no PC)
  // espera o foco ir para o próximo campo antes de redesenhar (senão o toque no próximo campo se perde)
  if (el.tagName === 'SELECT' || campo === 'valor' || campo === 'tagNova' || campo === 'taxa') setTimeout(desenhar, 0);
});
document.addEventListener('focusout', (ev) => {
  const el = ev.target;
  if (el.type === 'date' && el.dataset.mudou) { delete el.dataset.mudou; setTimeout(desenhar, 0); }
});
document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape' && E.modal) { E.modal.tipo === 'seletor' ? A.fecharSeletor() : A.fecharModal(); }
  const tag = (ev.target.tagName || '').toLowerCase();
  if ((ev.key === 'n' || ev.key === 'N') && !E.modal && E.fase === 'pronto' && E.perfil && !['input', 'textarea', 'select'].includes(tag) && !ev.ctrlKey && !ev.metaKey) { ev.preventDefault(); A.novoLancamento(); }
  if (ev.key === 'Enter' && tag === 'input' && ev.target.dataset.campo === 'tagNova') { ev.preventDefault(); const f = formAtual(); addTag(f, ev.target.value); desenhar(); setTimeout(() => { const el = document.querySelector('[data-campo="tagNova"]'); if (el) el.focus(); }, 30); return; }
  if (ev.key === 'Enter' && E.modal && E.modal.tipo === 'lancar' && tag === 'input') { ev.preventDefault(); ev.target.blur(); }
  if (ev.key === 'Enter' && E.modal && E.modal.tipo === 'filtros' && tag === 'input') { ev.preventDefault(); desenhar(); }
});

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => { /* sem cache offline */ });
}

iniciar();
