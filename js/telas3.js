// Início personalizável, avisos e configurações.
import { esc, brl, brlSinal, dataCurta, nomeMesAno, hojeISO, mesDe, somaMes, arred } from './util.js';
import { ic } from './icones.js';
import * as R from './regras.js';
import * as T2 from './telas2.js';
import { apoio, casca, corConta } from './telas.js';

const sens = (txt) => `<span class="valor-sens">${txt}</span>`;
const LSget = (k, d) => { try { const v = localStorage.getItem('economiau-' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } };

// ------------------------------------------------------------ configurações
export const CONFIG_PADRAO = {
  tema: 'escuro', perfilAoAbrir: 'ultimo', ocultarAoAbrir: false,
  avisos: { fatura: true, meta: true, variavel: true, acerto: true }, diasFatura: 3, notificar: false,
};
export function config() {
  const c = LSget('config', {});
  return { ...CONFIG_PADRAO, ...c, avisos: { ...CONFIG_PADRAO.avisos, ...(c.avisos || {}) } };
}

// ------------------------------------------------------------ blocos do Início
export const BLOCOS = [
  ['resumo', 'Resumo do mês', 'Gastos, entradas, saldo e sobra'],
  ['acerto', 'Acerto', 'Quem deve quanto no mês'],
  ['avisos', 'Avisos', 'Faturas vencendo, metas em 80%, contas a lançar, acerto'],
  ['ultimos', 'Últimos lançamentos', ''],
  ['fixas', 'Contas fixas a lançar', ''],
  ['contas', 'Contas', 'Sempre aparece'],
  ['faturas', 'Faturas', 'Sempre aparece'],
  ['metas', 'Metas', 'As metas do mês com a barra de cada uma'],
  ['planejado', 'Sobra planejada', 'Sobra prevista × planejada'],
  ['grupos', 'Despesas por grupo', 'Onde o dinheiro foi no mês'],
  ['limite', 'Limite dos cartões', 'Quanto do limite já está usado'],
  ['investimentos', 'Investimentos', 'Valor líquido de hoje'],
];
export const OBRIGATORIOS = ['contas', 'faturas'];
const LIGADOS = ['resumo', 'acerto', 'avisos', 'ultimos', 'fixas', 'contas', 'faturas', 'metas'];
const LARGOS = ['resumo', 'ultimos'];

// Preferências do Início do perfil (guardadas neste aparelho)
export function prefsInicio(perfil) {
  const p = LSget('inicio-' + perfil, null);
  const ids = BLOCOS.map(([id]) => id);
  const ordem = p && Array.isArray(p.ordem) ? [...p.ordem.filter((x) => ids.includes(x)), ...ids.filter((x) => !p.ordem.includes(x))] : ids;
  return { ordem, off: p && p.off ? p.off : ids.filter((x) => !LIGADOS.includes(x)), largo: p && p.largo ? p.largo : LARGOS };
}
export function blocosDoInicio(E) {
  const pr = E.inicioRasc || prefsInicio(E.perfil);
  return pr.ordem.map((id) => ({ id, on: OBRIGATORIOS.includes(id) || !pr.off.includes(id), largo: pr.largo.includes(id) }));
}

export function modalInicio(E, A, m) {
  const pr = E.inicioRasc || prefsInicio(E.perfil);
  const nomes = Object.fromEntries(BLOCOS.map(([id, n, sub]) => [id, [n, sub]]));
  const lista = pr.ordem.map((id, i) => {
    const obr = OBRIGATORIOS.includes(id);
    const on = obr || !pr.off.includes(id);
    const largo = pr.largo.includes(id);
    return `<div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-top:1px solid var(--line)">
      <button class="opcao" style="flex:1;margin:0;background:none;border:0;padding:6px 4px" data-a="inicioBloco" data-id="${id}" aria-checked="${on}" ${obr ? 'aria-disabled="true"' : ''}><span class="check ${on ? 'on' : ''}" ${obr ? 'style="opacity:.55"' : ''}>${on ? ic('ok', 13, 'stroke-width="3.2"') : ''}</span><span style="flex:1;text-align:left"><span style="display:block;font-weight:700">${esc(nomes[id][0])}</span>${nomes[id][1] ? `<span class="muted" style="font-size:12px">${esc(nomes[id][1])}</span>` : ''}</span></button>
      ${id === 'resumo' ? '' : `<button class="chip so-pc" style="height:30px;font-size:12px" aria-pressed="${largo}" data-a="inicioLargo" data-id="${id}" title="No computador, o bloco ocupa duas colunas">${largo ? 'Largo' : 'Normal'}</button>`}
      <button class="icone-btn" data-a="inicioMover" data-id="${id}" data-v="-1" aria-label="Subir ${esc(nomes[id][0])}" ${i === 0 ? 'disabled style="opacity:.3"' : ''}><span style="display:inline-block;transform:rotate(-90deg)">${ic('seta', 18)}</span></button>
      <button class="icone-btn" data-a="inicioMover" data-id="${id}" data-v="1" aria-label="Descer ${esc(nomes[id][0])}" ${i === pr.ordem.length - 1 ? 'disabled style="opacity:.3"' : ''}><span style="display:inline-block;transform:rotate(90deg)">${ic('seta', 18)}</span></button>
    </div>`;
  }).join('');
  const corpo = `<p class="muted" style="font-size:13px;margin:6px 4px 10px">Escolha os blocos do Início de ${esc(A.nome(E.perfil))} e a ordem deles. Fica salvo neste aparelho, para este perfil.</p>
    ${lista}
    <button class="btn btn-pri btn-largo" style="margin-top:16px" data-a="salvarInicio">Salvar</button>
    <button class="btn btn-largo" style="margin-top:6px;background:transparent;color:var(--muted)" data-a="inicioPadrao">Voltar ao padrão</button>`;
  return `<button class="veu" data-a="fecharInicio" aria-label="Fechar"></button><div class="folha" role="dialog" aria-label="Personalizar o Início"><div class="alca"></div><h2>Personalizar o Início</h2>${corpo}</div>`;
}

// Blocos opcionais do Início
export function blocoExtra(E, A, id, res) {
  const db = E.db, mes = E.mes, p = E.perfil, fam = A.fam;
  const ehFam = fam && p === fam.id;
  const nomeM = nomeMesAno(mes).split(' ')[0].toLowerCase();
  const titulo = (t, link, rot) => `<div class="secao-titulo"><span>${t}</span>${link ? `<a href="#/${link}">${rot}</a>` : ''}</div>`;
  const barra = (pct, cor) => `<span style="display:block;height:8px;border-radius:4px;background:var(--surf2);overflow:hidden;margin-top:6px"><span style="display:block;height:100%;width:${Math.max(0, Math.min(100, pct * 100)).toFixed(1)}%;background:${cor};border-radius:0 4px 4px 0"></span></span>`;
  const corPct = (x) => (x >= 1 ? 'var(--despesa)' : x >= 0.8 ? 'var(--aviso)' : 'var(--accent)');

  if (id === 'avisos') {
    const av = avisos(E);
    return titulo('Avisos', av.length ? 'config' : '', 'Ajustar') + `<div class="lista">${av.length ? av.map((x) => `<a class="item" href="#/${x.rota}">${ic(x.icone || 'aviso', 20, `style="color:${x.cor || 'var(--aviso)'};flex:none"`)}<span class="principal-txt"><span class="titulo" style="white-space:normal">${x.titulo}</span>${x.sub ? `<span class="sub" style="white-space:normal">${x.sub}</span>` : ''}</span>${ic('seta', 16)}</a>`).join('') : '<div class="vazio">Nenhum aviso agora.</div>'}</div>`;
  }
  if (id === 'metas') {
    const lista = (res.metas || []).filter((x) => R.pesoNoPerfil(db, x.dono, p, mes) > 0).sort((a, b) => b.pct - a.pct).slice(0, 5);
    return titulo('Metas de ' + esc(nomeM), 'planejamento', 'Planejamento') + `<div class="lista">${lista.length ? lista.map((x) => `<a class="item" href="#/planejamento" style="flex-direction:column;align-items:stretch;gap:0"><span style="display:flex;justify-content:space-between;gap:8px"><span class="titulo">${esc(x.nome)}</span><span style="white-space:nowrap;font-size:13.5px"><strong>${sens(brl(x.usado))}</strong> <span class="muted">/ ${sens(brl(x.valor))}</span></span></span>${barra(x.pct, corPct(x.pct))}</a>`).join('') : '<div class="vazio">Nenhuma meta neste mês. <a href="#/planejamento">Criar no Planejamento</a></div>'}</div>`;
  }
  if (id === 'planejado') {
    const pl = R.planejadoDoMes(db, p, mes, res.metas);
    const dif = arred(res.sobraPrev - pl.sobra);
    return titulo('Sobra de ' + esc(nomeM), 'planejamento', 'Planejamento') + `<div class="cartao"><div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap"><span><span class="muted" style="display:block;font-size:12.5px">Prevista</span><strong style="font-size:22px;${res.sobraPrev < 0 ? 'color:var(--despesa)' : ''}">${sens(brlSinal(res.sobraPrev))}</strong></span><span style="text-align:right"><span class="muted" style="display:block;font-size:12.5px">Planejada</span><strong style="font-size:22px">${sens(brlSinal(pl.sobra))}</strong></span></div>
      <div class="muted" style="font-size:12.5px;margin-top:6px">${pl.renda || pl.gastos ? (Math.abs(dif) < 0.01 ? 'Igual ao planejado.' : sens(brl(Math.abs(dif))) + (dif > 0 ? ' acima' : ' abaixo') + ' do planejado.') : 'Crie metas e contas fixas para ter um planejado.'}</div></div>`;
  }
  if (id === 'grupos') {
    const porCat = R.gastosPorCategoria(db, p, mes);
    const g = new Map();
    porCat.forEach((v, k) => { const c = R.porId(db.categorias, k); const gid = c ? (c.grupo || c.id) : ''; g.set(gid, (g.get(gid) || 0) + v); });
    const lista = [...g.entries()].filter(([, v]) => v > 0.005).sort((a, b) => b[1] - a[1]);
    const total = lista.reduce((s, [, v]) => s + v, 0);
    const top = lista.slice(0, 5);
    const resto = arred(total - top.reduce((s, [, v]) => s + v, 0));
    const max = Math.max(1, ...top.map(([, v]) => v));
    const nome = (gid) => (gid ? (R.porId(db.categorias, gid) || {}).nome || '?' : 'Sem categoria');
    return titulo('Despesas por grupo', 'relatorios', 'Relatórios') + `<div class="cartao">${top.length ? top.map(([gid, v]) => `<div style="margin-top:8px" title="${esc(nome(gid))}: ${brl(v)}"><div style="display:flex;justify-content:space-between;font-size:13.5px"><span>${esc(nome(gid))}</span><span style="font-variant-numeric:tabular-nums"><strong>${sens(brl(v))}</strong> <span class="muted">${total ? Math.round((v / total) * 100) : 0}%</span></span></div>${barra(v / max, 'var(--accent)')}</div>`).join('') + (resto > 0.005 ? `<div class="muted" style="font-size:12.5px;margin-top:10px">Outros grupos: ${sens(brl(resto))}</div>` : '') : `<div class="vazio">Nenhum gasto lançado em ${esc(nomeM)}.</div>`}</div>`;
  }
  if (id === 'limite') {
    const hoje = hojeISO();
    const cartoes = db.cartoes.filter((c) => R.ativo(c) && Number(c.limite) > 0 && (ehFam ? c.dono === fam.id : c.dono === p || R.pagaPorDe(db, c) === p));
    const usado = (c) => arred(R.faturasDoCartao(db, c.id).filter((f) => R.situacaoFatura(db, f, hoje) !== 'Paga').reduce((s, f) => s + R.totalFatura(db, f.id), 0));
    return titulo('Limite dos cartões', 'faturas', 'Faturas') + `<div class="lista">${cartoes.length ? cartoes.map((c) => { const u = usado(c); const pct = u / Number(c.limite); return `<a class="item" href="#/faturas" style="flex-direction:column;align-items:stretch;gap:0"><span style="display:flex;justify-content:space-between;gap:8px;align-items:center"><span style="display:flex;gap:8px;align-items:center;min-width:0"><span class="chip-cor" style="background:${corConta(c.cor)};width:24px;height:24px;font-size:12px">${esc(c.nome[0])}</span><span class="titulo">${esc(c.nome)}</span></span><span style="white-space:nowrap;font-size:13px"><strong>${sens(brl(u))}</strong> <span class="muted">de ${sens(brl(c.limite))}</span></span></span>${barra(pct, corPct(pct))}<span class="muted" style="font-size:12px;margin-top:4px">disponível ${sens(brl(Math.max(0, Number(c.limite) - u)))} · inclui parcelas futuras</span></a>`; }).join('') : '<div class="vazio">Nenhum cartão com limite cadastrado neste perfil.</div>'}</div>`;
  }
  if (id === 'investimentos') {
    const C = T2.calcInvest(E);
    const lista = (db.investimentos || []).filter((i) => R.ativo(i) && i.titular === p && C.res[i.id]);
    const daFam = !ehFam && fam ? (db.investimentos || []).filter((i) => R.ativo(i) && i.titular === fam.id && C.res[i.id]) : [];
    const soma = (l) => arred(l.reduce((s, i) => s + C.res[i.id].liquido, 0));
    const rend = (l) => arred(l.reduce((s, i) => s + (C.res[i.id].bruto - C.res[i.id].aplicado), 0));
    return titulo('Investimentos', 'investimentos', 'Ver todos') + `<a class="cartao" href="#/investimentos" style="display:block;color:inherit;text-decoration:none"><span class="muted" style="font-size:12.5px">${ehFam ? 'Da família' : 'Seus'} · líquido se resgatar hoje</span><div style="font-size:24px;font-weight:800;margin-top:2px">${sens(brl(soma(lista)))}</div><div class="muted" style="font-size:12.5px;margin-top:2px">${lista.length} investimento${lista.length === 1 ? '' : 's'} · rendimento bruto ${sens(brl(rend(lista)))}</div>${daFam.length ? `<div class="muted" style="font-size:12.5px;margin-top:8px;padding-top:8px;border-top:1px solid var(--line)">Da família: ${sens(brl(soma(daFam)))} (${daFam.length})</div>` : ''}</a>`;
  }
  return '';
}

// ------------------------------------------------------------------ avisos
// Avisos do perfil agora: faturas perto de vencer, metas a partir de 80%,
// contas de valor variável para lançar e acerto do mês anterior pendente.
export function avisos(E) {
  const cfg = config();
  const db = E.db, p = E.perfil;
  if (!db || !p) return [];
  const A = apoio(E);
  const fam = A.fam;
  const ehFam = fam && p === fam.id;
  const hoje = hojeISO();
  const mesHoje = mesDe(hoje);
  const dias = (iso) => Math.round((Date.parse(iso) - Date.parse(hoje)) / 86400000);
  const out = [];
  if (cfg.avisos.fatura) {
    db.cartoes.filter((c) => R.ativo(c) && (ehFam ? c.dono === fam.id : R.pagaPorDe(db, c) === p)).forEach((c) => {
      const f = R.faturaAtual(db, c, hoje);
      if (!f || !f.vencimento) return;
      const d = dias(f.vencimento);
      if (d < -10 || d > cfg.diasFatura || R.situacaoFatura(db, f, hoje) === 'Paga') return;
      const total = R.totalFatura(db, f.id);
      if (total <= 0) return;
      out.push({ chave: 'fat:' + f.id, icone: 'faturas', rota: 'faturas', cor: d < 0 ? 'var(--despesa)' : 'var(--aviso)', titulo: `Fatura ${esc(c.nome)} ${d < 0 ? 'venceu ' + (d === -1 ? 'ontem' : 'há ' + -d + ' dias') : d === 0 ? 'vence hoje' : d === 1 ? 'vence amanhã' : 'vence em ' + d + ' dias'}`, sub: `${sens(brl(total))} · ${dataCurta(f.vencimento)}`, texto: `Fatura ${c.nome}: ${brl(total)}, vence ${dataCurta(f.vencimento)}` });
    });
  }
  if (cfg.avisos.meta) {
    R.situacaoMetas(db, mesHoje).filter((x) => R.pesoNoPerfil(db, x.dono, p, mesHoje) > 0 && x.pct >= 0.8).forEach((x) => {
      const passou = x.usado > x.valor + 0.005;
      out.push({ chave: 'meta:' + x.meta.id + ':' + mesHoje + ':' + (passou ? 'p' : '80'), icone: 'planejar', rota: 'planejamento', cor: passou ? 'var(--despesa)' : 'var(--aviso)', titulo: `Meta ${esc(x.nome)}: ${passou ? 'passou do limite' : Math.round(x.pct * 100) + '% usada'}`, sub: `${sens(brl(x.usado))} de ${sens(brl(x.valor))}${x.previsto ? ' (com previstos)' : ''}`, texto: `Meta ${x.nome}: ${brl(x.usado)} de ${brl(x.valor)}` });
    });
  }
  if (cfg.avisos.variavel) {
    R.previstosDoMes(db, mesHoje).forEach((x) => {
      const r = R.porId(db.recorrencias || [], x.recorrencia);
      if (!r || r.varia !== 'Sim' || !R.visivelNoPerfil(db, x, p)) return;
      if (dias(x.data) > 3) return;
      out.push({ chave: 'var:' + x.id, icone: 'repetir', rota: 'fixas', titulo: `${esc(x.desc)}: lance o valor certo`, sub: `conta de valor variável · ${dias(x.data) < 0 ? 'era dia ' : 'dia '}${dataCurta(x.data)} · previsto ${sens(brl(x.valor))}`, texto: `${x.desc}: lance o valor certo (dia ${dataCurta(x.data)})` });
    });
  }
  if (cfg.avisos.acerto && A.ps.length === 2) {
    const ant = somaMes(mesHoje, -1);
    const ac = R.acertoDoMes(db, ant);
    const r = ac.resultado;
    if (r && (ehFam || r.de === p || r.para === p)) {
      out.push({ chave: 'ace:' + ant + ':' + r.valor, icone: 'acerto', rota: 'acerto', titulo: `Acerto de ${nomeMesAno(ant).split(' ')[0].toLowerCase()} pendente`, sub: `${esc(A.nome(r.de))} transfere ${sens(brl(r.valor))} para ${esc(A.nome(r.para))}`, texto: `Acerto de ${nomeMesAno(ant).toLowerCase()}: ${A.nome(r.de)} transfere ${brl(r.valor)} para ${A.nome(r.para)}`, mesAcerto: ant });
    }
  }
  return out;
}

// --------------------------------------------------------- configurações
export function telaConfig(E) {
  const A = apoio(E);
  const cfg = config();
  const db = E.db;
  const chips = (campo, ops) => `<div class="chips">${ops.map(([v, n]) => `<button class="chip" aria-pressed="${String(cfg[campo]) === String(v)}" data-a="cfg" data-c="${campo}" data-v="${v}">${n}</button>`).join('')}</div>`;
  const chave = (on, acao, v, rot) => `<button class="chip" role="switch" aria-checked="${!!on}" aria-pressed="${!!on}" data-a="${acao}" data-v="${v || ''}" aria-label="${esc(rot)}">${on ? 'Sim' : 'Não'}</button>`;
  const linha = (titulo, sub, ctrl) => `<div style="display:flex;align-items:center;gap:12px;padding:12px 0;border-top:1px solid var(--line)"><span style="flex:1"><span style="display:block;font-weight:700">${titulo}</span>${sub ? `<span class="muted" style="font-size:12.5px">${sub}</span>` : ''}</span>${ctrl}</div>`;
  const notif = typeof Notification === 'undefined' ? 'indisponivel' : Notification.permission;
  const pend = E.banco && !E.banco.demo ? E.banco.pendentes : 0;
  const C = E.banco && !E.banco.demo ? T2.calcInvest(E) : null;
  const pessoas = db.pessoas.filter((x) => x.tipo === 'Pessoa');
  const corpo = `<div class="grade">
    <div>
      <div class="cartao"><h2 style="font-size:16px;font-weight:800">Aparência</h2>
        <div style="margin-top:10px"><span class="muted" style="font-size:13px">Tema</span>${chips('tema', [['escuro', 'Escuro'], ['claro', 'Claro'], ['auto', 'Igual ao celular']])}</div>
      </div>
      <div class="cartao"><h2 style="font-size:16px;font-weight:800">Ao abrir o app</h2>
        <div style="margin-top:10px"><span class="muted" style="font-size:13px">Perfil</span>${chips('perfilAoAbrir', [['ultimo', 'O último usado'], ['perguntar', 'Perguntar sempre'], ...db.pessoas.filter(R.ativo).map((x) => [x.id, x.nome])])}</div>
        ${linha('Esconder valores ao abrir', 'Os valores aparecem como •••• até tocar no olho.', chave(cfg.ocultarAoAbrir, 'cfgOcultar', '', 'Esconder valores ao abrir'))}
      </div>
      <div class="cartao"><h2 style="font-size:16px;font-weight:800">Avisos</h2>
        <p class="muted" style="font-size:12.5px;margin-top:4px">Aparecem no bloco Avisos do Início${notif === 'granted' && cfg.notificar ? ' e como notificação quando vocês abrem o app' : ''}.</p>
        ${linha('Fatura perto de vencer', `Avisa ${cfg.diasFatura} dia${cfg.diasFatura === 1 ? '' : 's'} antes.`, chave(cfg.avisos.fatura, 'cfgAviso', 'fatura', 'Fatura perto de vencer'))}
        ${cfg.avisos.fatura ? `<div style="padding:0 0 10px">${chips('diasFatura', [[1, '1 dia antes'], [3, '3 dias'], [5, '5 dias'], [7, '7 dias']])}</div>` : ''}
        ${linha('Meta em 80%', 'Quando o lançado + previsto chega a 80% da meta.', chave(cfg.avisos.meta, 'cfgAviso', 'meta', 'Meta em 80%'))}
        ${linha('Conta de valor variável', 'Luz, água… quando chega o dia, lembra de lançar o valor certo.', chave(cfg.avisos.variavel, 'cfgAviso', 'variavel', 'Conta de valor variável'))}
        ${linha('Acerto pendente', 'Acerto do mês anterior ainda não registrado.', chave(cfg.avisos.acerto, 'cfgAviso', 'acerto', 'Acerto pendente'))}
        ${linha('Notificação no celular', notif === 'indisponivel' ? 'Este navegador não mostra notificações. No iPhone, instale o app na tela inicial (iOS 16.4 ou mais novo).' : notif === 'denied' ? 'Bloqueadas nas configurações do navegador/celular. Libere por lá para ligar.' : 'Mostra os avisos como notificação ao abrir o app (uma vez por dia cada). Com o app fechado o celular não avisa: isso precisaria de um servidor.', notif === 'indisponivel' || notif === 'denied' ? '<span class="pill neutra">indisponível</span>' : chave(cfg.notificar && notif === 'granted', 'cfgNotificar', '', 'Notificação no celular'))}
      </div>
    </div>
    <div>
      <div class="cartao"><h2 style="font-size:16px;font-weight:800">Planilha</h2>
        ${linha(esc(E.banco ? E.banco.titulo || 'Planilha' : ''), E.banco && E.banco.demo ? 'Modo demonstração (dados de exemplo neste aparelho)' : E.banco && E.banco.offline ? 'Sem internet: usando a cópia deste aparelho' : 'Conectada', E.banco && !E.banco.demo ? `<a class="btn btn-peq btn-sec" href="https://docs.google.com/spreadsheets/d/${esc(E.banco.id)}" target="_blank" rel="noopener">Abrir</a>` : '')}
        ${E.banco && !E.banco.demo ? linha('Lançamentos sem internet', pend ? `${pend} esperando para ir para a planilha` : 'Nada esperando: tudo já está na planilha.', pend ? '<button class="btn btn-peq btn-sec" data-a="enviarFila">Enviar</button>' : '') : ''}
        ${linha('Atualizar dados', 'Lê a planilha de novo (útil depois de mexer nela direto).', '<button class="btn btn-peq btn-sec" data-a="recarregar">Atualizar</button>')}
        ${E.banco && !E.banco.demo ? linha('Estrutura da planilha', E.banco.temCampo('metas', 'categorias') ? 'Atualizada (1.17)' : 'Desatualizada: rode o script de montagem 1.17 para usar tudo', '') : ''}
      </div>
      ${C ? `<div class="secao-titulo" style="margin-top:4px"><span>Robô dos índices</span></div>${T2.statusRobo(E, C).replace('margin-top:12px;', 'margin-top:0;')}` : ''}
      <div class="cartao"><h2 style="font-size:16px;font-weight:800">Pessoas com acesso</h2>
        ${pessoas.map((x) => `<div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-top:1px solid var(--line)">${A.avatar(x.id, 32)}<span style="flex:1;min-width:0"><span style="display:block;font-weight:700">${esc(x.nome)}</span><span class="muted" style="font-size:12.5px;overflow-wrap:anywhere">${esc(x.email || 'sem e-mail')}</span></span></div>`).join('')}
        <p class="muted" style="font-size:12.5px;margin-top:8px">Quem entra é decidido pela aba Pessoas e pelo compartilhamento da planilha no Google Drive.</p>
      </div>
      <div class="cartao"><h2 style="font-size:16px;font-weight:800">Conta</h2>
        ${linha('Trocar de planilha', '', '<button class="btn btn-peq btn-sec" data-a="trocarPlanilha">Trocar</button>')}
        ${linha('Sair', esc(E.email || ''), '<button class="btn btn-peq btn-perigo" data-a="sair">Sair</button>')}
        <p class="muted" style="font-size:12px;margin-top:10px">Economiau ${esc(E.versao)} · as preferências desta tela ficam salvas neste aparelho.</p>
      </div>
    </div>
  </div>`;
  return casca(E, 'Configurações', corpo, { voltar: 'mais' });
}
