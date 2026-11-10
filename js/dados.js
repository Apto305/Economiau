// Camada de dados: lê e grava as abas da planilha e devolve objetos
// simples para o resto do app. Tem dois "motores": a planilha Google de
// verdade e um modo demonstração (dados inventados guardados no navegador).
import { sheets } from './google.js';
import { serialParaISO, isoParaSerial, agoraSerial, formatarId, proximoNumero, mesDe, somaMes, hojeISO } from './util.js';

// Campos do app → cabeçalho da coluna na planilha, com o tipo do dado.
// d = data, dh = data e hora, n = número, b = caixa (sim/não), m = mês AAAA-MM
const ABAS = {
  transacoes: {
    aba: 'Transações', prefixo: 'TRN', campos: {
      id: ['ID'], data: ['Data', 'd'], desc: ['Descrição'], valor: ['Valor', 'n'], tipo: ['Tipo'],
      categoria: ['Categoria (ID)'], meio: ['Meio'], cartao: ['Cartão (ID)'], conta: ['Conta (ID)'], fatura: ['Fatura (ID)'],
      parcela: ['Parcela', 'n'], totalParcelas: ['Total de parcelas', 'n'], grupoParc: ['Grupo do parcelamento'],
      dono: ['Dono (ID)'], pagou: ['Quem pagou (ID)'], divisao: ['Divisão'], pctPagou: ['% de quem pagou', 'n'],
      pago: ['Pago', 'b'], dataPag: ['Data do pagamento', 'd'], recorrencia: ['Recorrência (ID)'], status: ['Status'],
      conferido: ['Conferido', 'b'], obs: ['Observação'], criadoPor: ['Criado por'], criadoEm: ['Criado em', 'dh'],
      contaDestino: ['Conta de destino (ID)'], tags: ['Tags'], deduz: ['Deduz da renda', 'b'],
      foraAcerto: ['Fora do acerto', 'b'], mesRec: ['Mês da recorrência', 'm'],
    },
  },
  faturas: {
    aba: 'Faturas', prefixo: 'FAT', campos: {
      id: ['ID'], cartao: ['Cartão (ID)'], competencia: ['Competência', 'm'], fechamento: ['Data de fechamento', 'd'],
      vencimento: ['Data de vencimento', 'd'], mesRenda: ['Mês de referência da renda', 'm'], totalBanco: ['Total do banco', 'n'],
      status: ['Status'], dataPag: ['Data do pagamento', 'd'], pagoPor: ['Pago por (ID)'], conferida: ['Conferida', 'b'],
      obs: ['Observação'], criadoEm: ['Criado em', 'dh'],
    },
  },
  rendas: {
    aba: 'Rendas', prefixo: 'REN', campos: {
      id: ['ID'], data: ['Data de recebimento', 'd'], pessoa: ['Pessoa (ID)'], desc: ['Descrição'], valor: ['Valor', 'n'],
      conta: ['Conta (ID)'], criadoEm: ['Criado em', 'dh'], tags: ['Tags'], recorrencia: ['Recorrência (ID)'], mesRec: ['Mês da recorrência', 'm'],
    },
  },
  recorrencias: {
    aba: 'Recorrências', prefixo: 'REC', campos: {
      id: ['ID'], desc: ['Descrição'], valor: ['Valor', 'n'], categoria: ['Categoria (ID)'], meio: ['Meio'], cartao: ['Cartão (ID)'],
      conta: ['Conta (ID)'], dia: ['Dia do mês', 'n'], dono: ['Dono (ID)'], pagou: ['Quem paga (ID)'], divisao: ['Divisão'],
      inicio: ['Início', 'd'], fim: ['Fim', 'd'], status: ['Status'], criadoEm: ['Criado em', 'dh'], varia: ['Valor varia'],
      tipo: ['Tipo'], tags: ['Tags'], deduz: ['Deduz da renda', 'b'], pulados: ['Meses pulados'],
    },
  },
  investimentos: {
    aba: 'Investimentos', prefixo: 'INV', campos: {
      id: ['ID'], nome: ['Nome'], emissor: ['Emissor'], tipo: ['Tipo'], titular: ['Titular (ID)'], indexador: ['Indexador'],
      taxa: ['Taxa', 'n'], dataAplic: ['Data de aplicação', 'd'], vencimento: ['Vencimento', 'd'], isento: ['Isento de IR'],
      liquidez: ['Liquidez'], status: ['Status'], criadoEm: ['Criado em', 'dh'], arquivadoEm: ['Arquivado em', 'dh'],
      bruto: ['Valor bruto', 'n'], rendimento: ['Rendimento bruto', 'n'], iof: ['IOF estimado', 'n'], ir: ['IR estimado', 'n'],
      liquido: ['Valor líquido', 'n'], calculadoEm: ['Calculado em', 'dh'],
      valorBanco: ['Valor no banco', 'n'], valorBancoEm: ['Valor no banco em', 'd'],
    },
  },
  movsInv: {
    aba: 'Movimentações de investimento', prefixo: 'MOV', campos: {
      id: ['ID'], investimento: ['Investimento (ID)'], data: ['Data', 'd'], tipo: ['Tipo'], valor: ['Valor', 'n'], conta: ['Conta (ID)'],
      obs: ['Observação'], criadoEm: ['Criado em', 'dh'], liquido: ['Valor líquido recebido', 'n'],
      foraAcerto: ['Fora do acerto', 'b'],
    },
  },
  acertos: {
    aba: 'Acertos', prefixo: 'ACE', campos: {
      id: ['ID'], data: ['Data', 'd'], de: ['De (ID)'], para: ['Para (ID)'], valor: ['Valor', 'n'], mesRef: ['Mês de referência', 'm'],
      obs: ['Observação'], criadoEm: ['Criado em', 'dh'],
    },
  },
  cartoes: {
    aba: 'Cartões', prefixo: 'CRT', campos: {
      id: ['ID'], nome: ['Nome'], dono: ['Proprietário (ID)'], fecha: ['Dia de fechamento', 'n'], vence: ['Dia de vencimento', 'n'],
      rendaRef: ['Pago com a renda do'], contaPag: ['Conta de pagamento (ID)'], status: ['Status'], criadoEm: ['Criado em', 'dh'],
      arquivadoEm: ['Arquivado em', 'dh'], limite: ['Limite', 'n'], cor: ['Cor'], pagaPor: ['Paga por (ID)'],
    },
  },
  contas: {
    aba: 'Contas', prefixo: 'CTA', campos: {
      id: ['ID'], nome: ['Nome'], banco: ['Banco'], dono: ['Proprietário (ID)'], tipo: ['Tipo'], saldoInicial: ['Saldo inicial', 'n'],
      dataSaldo: ['Data do saldo inicial', 'd'], status: ['Status'], criadoEm: ['Criado em', 'dh'], arquivadoEm: ['Arquivado em', 'dh'], cor: ['Cor'],
    },
  },
  categorias: {
    aba: 'Categorias', prefixo: 'CAT', campos: {
      id: ['ID'], nome: ['Nome'], tipo: ['Tipo'], status: ['Status'], criadoEm: ['Criado em', 'dh'], grupo: ['Grupo (ID)'], ordem: ['Ordem', 'n'],
    },
  },
  pessoas: {
    aba: 'Pessoas', prefixo: 'PES', campos: {
      id: ['ID'], nome: ['Nome'], email: ['E-mail'], tipo: ['Tipo'], status: ['Status'], criadoEm: ['Criado em', 'dh'],
      divisaoPadrao: ['Divisão padrão'], pctFixo: ['% fixo na divisão', 'n'],
    },
  },
};
export const NOMES_ABAS = Object.keys(ABAS);

function lerCelula(v, tipo) {
  if (v === undefined || v === null) v = '';
  switch (tipo) {
    case 'd': return serialParaISO(v);
    case 'dh': return typeof v === 'number' ? v : '';
    case 'n': return v === '' ? '' : (typeof v === 'number' ? v : Number(String(v).replace(',', '.')) || 0);
    case 'b': return v === true || v === 'TRUE' || v === 'Sim';
    case 'm': return typeof v === 'number' ? serialParaISO(v).slice(0, 7) : String(v).slice(0, 7);
    default: return typeof v === 'string' ? v.trim() : String(v);
  }
}
function escreverCelula(v, tipo) {
  if (v === undefined || v === null) return '';
  switch (tipo) {
    case 'd': return v ? isoParaSerial(v) : '';
    case 'n': return v === '' ? '' : Number(v);
    case 'b': return !!v;
    default: return v;
  }
}
// Campos que dependem de outros (saldo inicial vazio = 0 etc.)
function normalizar(nome, o) {
  if (nome === 'recorrencias') { o.valor = Number(o.valor) || 0; o.dia = Number(o.dia) || 1; if (!o.tipo) o.tipo = 'Despesa'; }
  if ('tags' in o || nome === 'transacoes' || nome === 'rendas' || nome === 'recorrencias') o.tags = o.tags || '';
  if (nome === 'movsInv') o.valor = Number(o.valor) || 0;
  if (nome === 'investimentos') o.taxa = o.taxa === '' ? '' : Number(o.taxa) || 0;
  if (nome === 'contas' || nome === 'transacoes' || nome === 'rendas' || nome === 'acertos') {
    ['valor', 'saldoInicial'].forEach((k) => { if (k in o) o[k] = Number(o[k]) || 0; });
  }
  if (nome === 'cartoes') { o.fecha = Number(o.fecha) || 1; o.vence = Number(o.vence) || 10; }
  if (nome === 'transacoes' && !o.status) o.status = 'Confirmado';
  return o;
}

// ------------------------------------------------------------- planilha
export class BancoPlanilha {
  constructor(id) { this.id = id; this.mapa = {}; this.linhas = {}; this.sheetIds = {}; }

  async carregar() {
    const nomes = NOMES_ABAS.map((k) => ABAS[k].aba);
    const [meta, cab, val, idx] = await Promise.all([
      sheets.metadados(this.id), sheets.lerCabecalhos(this.id, nomes), sheets.lerAbas(this.id, nomes),
      sheets.lerAbas(this.id, ['Índices']).catch(() => ({ valueRanges: [{}] })),
    ]);
    this.titulo = meta.properties.title;
    meta.sheets.forEach((s) => (this.sheetIds[s.properties.title] = s.properties.sheetId));
    const faltando = nomes.filter((n) => this.sheetIds[n] === undefined);
    if (faltando.length) { const e = new Error('Esta planilha não tem a estrutura do Economiau (faltam as abas: ' + faltando.join(', ') + ').'); e.estrutura = true; throw e; }
    const db = {};
    NOMES_ABAS.forEach((k, i) => {
      const def = ABAS[k];
      const formulas = (cab.valueRanges[i].values || [[]])[0] || [];
      const linhas = val.valueRanges[i].values || [];
      const titulos = (linhas[0] || []).map((t) => String(t).trim());
      // coluna de cada campo e se ela é automática (fórmula no cabeçalho)
      const colunas = {};
      Object.entries(def.campos).forEach(([campo, [titulo, tipo]]) => {
        const c = titulos.indexOf(titulo);
        if (c >= 0) colunas[campo] = { c, tipo, auto: String(formulas[c] || '').startsWith('=') };
      });
      this.mapa[k] = colunas;
      this.linhas[k] = {};
      db[k] = [];
      for (let r = 1; r < linhas.length; r++) {
        const L = linhas[r];
        const id = String(L[colunas.id ? colunas.id.c : 0] || '').trim();
        if (!id) continue;
        const o = {};
        Object.entries(colunas).forEach(([campo, { c, tipo }]) => (o[campo] = lerCelula(L[c], tipo)));
        this.linhas[k][id] = r + 1;
        db[k].push(normalizar(k, o));
      }
      this.ultimaLinha = this.ultimaLinha || {};
      this.ultimaLinha[k] = Math.max(1, ...Object.values(this.linhas[k]));
    });
    db.indices = lerIndices((idx.valueRanges[0] || {}).values || []);
    this.db = db;
    return db;
  }

  temCampo(aba, campo) { return !!(this.mapa[aba] && this.mapa[aba][campo]); }

  // Monta os intervalos de uma linha só com as colunas que o app conhece e
  // que não são automáticas (as automáticas têm fórmula no cabeçalho).
  intervalosDaLinha(k, linha, o) {
    const cols = Object.entries(this.mapa[k]).filter(([campo, x]) => !x.auto && campo in o).sort((a, b) => a[1].c - b[1].c);
    const data = [];
    let atual = null;
    cols.forEach(([campo, { c, tipo }]) => {
      const v = escreverCelula(o[campo], tipo);
      if (atual && c === atual.fim + 1) { atual.vals.push(v); atual.fim = c; } else { atual = { ini: c, fim: c, vals: [v] }; data.push(atual); }
    });
    return data.map((s) => ({ range: sheets.intervalo(ABAS[k].aba, linha, s.ini + 1, s.fim + 1), values: [s.vals] }));
  }

  async inserir(k, lista) {
    const def = ABAS[k];
    let n = proximoNumero(this.db[k], def.prefixo);
    const data = [];
    lista.forEach((o) => {
      if (!o.id) o.id = formatarId(def.prefixo, n++);
      if ('criadoEm' in def.campos) o.criadoEm = agoraSerial();
      const linha = ++this.ultimaLinha[k];
      this.linhas[k][o.id] = linha;
      data.push(...this.intervalosDaLinha(k, linha, o));
    });
    await sheets.escrever(this.id, data);
    lista.forEach((o) => this.db[k].push(normalizar(k, { ...o })));
    return lista;
  }

  async atualizar(k, lista) {
    const data = [];
    lista.forEach((o) => {
      const linha = this.linhas[k][o.id];
      if (!linha) throw new Error('Registro ' + o.id + ' não encontrado na planilha.');
      data.push(...this.intervalosDaLinha(k, linha, o));
    });
    await sheets.escrever(this.id, data);
    lista.forEach((o) => {
      const i = this.db[k].findIndex((x) => x.id === o.id);
      if (i >= 0) this.db[k][i] = normalizar(k, { ...this.db[k][i], ...o });
    });
  }

  async excluir(k, ids) {
    const sheetId = this.sheetIds[ABAS[k].aba];
    const linhas = ids.map((id) => this.linhas[k][id]).filter(Boolean).sort((a, b) => b - a); // de baixo para cima
    if (!linhas.length) return;
    await sheets.lote(this.id, linhas.map((l) => ({ deleteDimension: { range: { sheetId, dimension: 'ROWS', startIndex: l - 1, endIndex: l } } })));
    // recarrega para recalcular os números das linhas
    await this.carregar();
  }
}

// --------------------------------------------------- modo demonstração
const CHAVE_DEMO = 'economiau-demo-v2';

export class BancoDemo {
  constructor() { this.titulo = 'Planilha de demonstração'; this.demo = true; }
  async carregar() {
    let db = null;
    try { db = JSON.parse(localStorage.getItem(CHAVE_DEMO) || 'null'); } catch (e) { db = null; }
    if (!db) db = dadosDemo();
    NOMES_ABAS.forEach((k) => { if (!db[k]) db[k] = []; });
    if (!db.indices) db.indices = [];
    this.db = db;
    return db;
  }
  salvar() { try { localStorage.setItem(CHAVE_DEMO, JSON.stringify(this.db)); } catch (e) { /* sem espaço */ } }
  temCampo() { return true; }
  async inserir(k, lista) {
    const def = ABAS[k];
    let n = proximoNumero(this.db[k], def.prefixo);
    lista.forEach((o) => { if (!o.id) o.id = formatarId(def.prefixo, n++); o.criadoEm = agoraSerial(); this.db[k].push(normalizar(k, { ...o })); });
    this.salvar();
    return lista;
  }
  async atualizar(k, lista) {
    lista.forEach((o) => { const i = this.db[k].findIndex((x) => x.id === o.id); if (i >= 0) this.db[k][i] = normalizar(k, { ...this.db[k][i], ...o }); });
    this.salvar();
  }
  async excluir(k, ids) { this.db[k] = this.db[k].filter((x) => !ids.includes(x.id)); this.salvar(); }
  static apagar() { try { localStorage.removeItem(CHAVE_DEMO); } catch (e) { /* ignora */ } }
}

// Dados inventados para experimentar o app sem a planilha de verdade
function dadosDemo() {
  const hoje = hojeISO();
  const mes = mesDe(hoje);
  const ant = somaMes(mes, -1);
  const d = (m, dia) => m + '-' + String(dia).padStart(2, '0');
  const db = { pessoas: [], contas: [], cartoes: [], categorias: [], faturas: [], transacoes: [], rendas: [], acertos: [], recorrencias: [], investimentos: [], movsInv: [], indices: [] };
  db.pessoas = [
    { id: 'PES-0001', nome: 'Demétrio', email: 'demo-demetrio@exemplo.com', tipo: 'Pessoa', status: 'Ativo' },
    { id: 'PES-0002', nome: 'Giovanna', email: 'demo-giovanna@exemplo.com', tipo: 'Pessoa', status: 'Ativo' },
    { id: 'PES-0003', nome: 'Família', email: '', tipo: 'Família', status: 'Ativo', divisaoPadrao: 'Proporcional à renda' },
  ];
  const CATS = [
    ['Moradia', ['Aluguel ou financiamento', 'Condomínio', 'Luz, água e gás', 'Internet e telefone', 'Casa e manutenção']],
    ['Alimentação', ['Mercado', 'Restaurantes e delivery', 'Padaria e lanches']],
    ['Transporte', ['Apps de transporte', 'Ônibus e metrô', 'Combustível', 'Estacionamento e pedágio', 'Manutenção do carro']],
    ['Saúde', ['Plano de saúde', 'Consultas e exames', 'Farmácia', 'Academia']],
    ['Pets', ['Ração e areia', 'Veterinário', 'Petshop e brinquedos']],
    ['Lazer', ['Passeios e eventos', 'Viagens', 'Assinaturas e streaming', 'Hobbies']],
    ['Pessoal', ['Vestuário', 'Cuidados pessoais', 'Educação', 'Presentes']],
    ['Financeiro', ['Impostos e taxas', 'Tarifas e anuidades', 'Juros e multas']],
    ['Outros', []],
  ];
  let nc = 1;
  const cat = {};
  CATS.forEach(([g, itens]) => {
    const gid = formatarId('CAT', nc++);
    db.categorias.push({ id: gid, nome: g, tipo: 'Despesa', status: 'Ativo', grupo: '' });
    itens.forEach((i) => { const id = formatarId('CAT', nc++); cat[i] = id; db.categorias.push({ id, nome: i, tipo: 'Despesa', status: 'Ativo', grupo: gid }); });
  });
  ['Salário', 'Renda extra', 'Rendimentos', 'Reembolso'].forEach((i) => { const id = formatarId('CAT', nc++); cat[i] = id; db.categorias.push({ id, nome: i, tipo: 'Receita', status: 'Ativo', grupo: '' }); });

  const inicio = d(ant, 1);
  db.contas = [
    { id: 'CTA-0001', nome: 'Itaú', banco: 'Itaú', dono: 'PES-0001', tipo: 'Conta corrente', saldoInicial: 1850, dataSaldo: inicio, status: 'Ativo', cor: 'Laranja' },
    { id: 'CTA-0002', nome: 'Nubank', banco: 'Nubank', dono: 'PES-0001', tipo: 'Conta digital', saldoInicial: 400, dataSaldo: inicio, status: 'Ativo', cor: 'Roxo' },
    { id: 'CTA-0003', nome: 'Nubank', banco: 'Nubank', dono: 'PES-0002', tipo: 'Conta digital', saldoInicial: 1200, dataSaldo: inicio, status: 'Ativo', cor: 'Roxo' },
    { id: 'CTA-0004', nome: 'Inter', banco: 'Inter', dono: 'PES-0002', tipo: 'Conta digital', saldoInicial: 300, dataSaldo: inicio, status: 'Ativo', cor: 'Laranja' },
  ];
  db.cartoes = [
    { id: 'CRT-0001', nome: 'Nubank Demétrio', dono: 'PES-0001', fecha: 28, vence: 5, rendaRef: 'Mês anterior ao vencimento', contaPag: '', pagaPor: 'PES-0001', status: 'Ativo', limite: 8000, cor: 'Roxo' },
    { id: 'CRT-0002', nome: 'Nubank Giovanna', dono: 'PES-0002', fecha: 28, vence: 5, rendaRef: 'Mês anterior ao vencimento', contaPag: '', pagaPor: 'PES-0002', status: 'Ativo', limite: 6000, cor: 'Roxo' },
  ];
  [ant, mes].forEach((m) => {
    db.rendas.push({ id: '', data: d(m, 5), pessoa: 'PES-0001', desc: 'Salário', valor: 6000, conta: 'CTA-0001' });
    db.rendas.push({ id: '', data: d(m, 5), pessoa: 'PES-0002', desc: 'Salário', valor: 4000, conta: 'CTA-0003' });
  });
  db.rendas.forEach((r, i) => (r.id = formatarId('REN', i + 1)));

  // faturas: a que vence neste mês (conta no anterior) e a que vence no próximo
  const fat = (id, cartao, mesFecha) => {
    const c = db.cartoes.find((x) => x.id === cartao);
    const venceMes = somaMes(mesFecha, 1);
    return { id, cartao, competencia: venceMes, fechamento: d(mesFecha, c.fecha), vencimento: d(venceMes, c.vence), mesRenda: mesFecha, totalBanco: '', status: 'Aberta', conferida: false };
  };
  db.faturas = [fat('FAT-0001', 'CRT-0001', ant), fat('FAT-0002', 'CRT-0002', ant), fat('FAT-0003', 'CRT-0001', mes), fat('FAT-0004', 'CRT-0002', mes)];
  const T = [];
  const add = (data, desc, valor, catNome, dono, pagou, extra = {}) => T.push({ data, desc, valor, tipo: 'Despesa', categoria: cat[catNome], dono, pagou, status: 'Confirmado', meio: 'Pix', pago: true, ...extra });
  const F = 'PES-0003', D = 'PES-0001', G = 'PES-0002';
  const cred = (conta, fatura) => ({ meio: 'Crédito', cartao: conta, fatura, pago: false });
  // mês anterior
  add(d(ant, 5), 'Aluguel', 1760, 'Aluguel ou financiamento', F, D, { conta: 'CTA-0001' });
  add(d(ant, 10), 'Condomínio', 640, 'Condomínio', F, D, { conta: 'CTA-0001', meio: 'Boleto' });
  add(d(ant, 12), 'Mercado do bairro', 412.3, 'Mercado', F, G, cred('CRT-0002', 'FAT-0002'));
  add(d(ant, 18), 'Luz', 196.3, 'Luz, água e gás', F, G, { conta: 'CTA-0003', meio: 'Débito automático' });
  add(d(ant, 20), 'Petshop', 165, 'Ração e areia', F, G, cred('CRT-0002', 'FAT-0002'));
  add(d(ant, 22), 'Posto de combustível', 182, 'Combustível', F, D, cred('CRT-0001', 'FAT-0001'));
  add(d(ant, 24), 'Uber', 23.7, 'Apps de transporte', D, D, cred('CRT-0001', 'FAT-0001'));
  add(d(ant, 26), 'Farmácia', 46.9, 'Farmácia', G, D, { conta: 'CTA-0001' });
  // este mês
  const hojeDia = Number(hoje.slice(8, 10));
  const dia = (n) => d(mes, Math.min(n, hojeDia));
  add(dia(1), 'Padaria', 18.5, 'Padaria e lanches', D, D, { conta: 'CTA-0002', meio: 'Débito' });
  add(dia(2), 'Mercado do bairro', 87.4, 'Mercado', F, D, cred('CRT-0001', 'FAT-0003'));
  add(dia(3), 'Delivery', 64.9, 'Restaurantes e delivery', F, G, cred('CRT-0002', 'FAT-0004'));
  add(d(mes, 5), 'Aluguel', 1760, 'Aluguel ou financiamento', F, D, { conta: 'CTA-0001', status: hojeDia >= 5 ? 'Confirmado' : 'Previsto' });
  T.forEach((t, i) => (t.id = formatarId('TRN', i + 1)));
  db.transacoes = T.map((t) => normalizar('transacoes', t));
  // índices inventados (dias úteis do último ano) e dois investimentos
  db.indices = [];
  const base = new Date(); base.setDate(base.getDate() - 400);
  for (let i = 0; i < 400; i++) {
    const x = new Date(base); x.setDate(base.getDate() + i);
    if (x.getDay() === 0 || x.getDay() === 6) continue;
    const dia = x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0');
    db.indices.push({ dia, cdi: 0.055131, selic: 0.055131, ipca: x.getDate() <= 3 ? 0.38 : '' });
  }
  const dAp = db.indices[40].dia;
  db.investimentos = [
    { id: 'INV-0001', nome: 'CDB Banco Inter 110% CDI', emissor: 'Banco Inter', tipo: 'CDB', titular: 'PES-0003', indexador: 'CDI', taxa: 110, dataAplic: dAp, vencimento: somaMes(mes, 24) + '-15', isento: 'Não', liquidez: 'Diária', status: 'Ativo' },
    { id: 'INV-0002', nome: 'Tesouro IPCA+ 2035', emissor: 'Tesouro Nacional', tipo: 'Tesouro IPCA+', titular: 'PES-0001', indexador: 'IPCA', taxa: 6.5, dataAplic: db.indices[200].dia, vencimento: '2035-05-15', isento: 'Não', liquidez: 'Diária', status: 'Ativo' },
  ];
  db.movsInv = [
    { id: 'MOV-0001', investimento: 'INV-0001', data: dAp, tipo: 'Aporte', valor: 8000, conta: 'CTA-0001' },
    { id: 'MOV-0002', investimento: 'INV-0002', data: db.indices[200].dia, tipo: 'Aporte', valor: 3000, conta: 'CTA-0001' },
  ];
  return db;
}

// Aba Índices (sem ID): Data | CDI (% ao dia) | Selic (% ao dia) | IPCA (% ao mês)
function lerIndices(linhas) {
  if (!linhas.length) return [];
  const t = (linhas[0] || []).map((x) => String(x).trim());
  const c = (n) => t.indexOf(n);
  const [cd, cc, cs, ci, ca] = [c('Data'), c('CDI (% ao dia)'), c('Selic (% ao dia)'), c('IPCA (% ao mês)'), c('Atualizado em')];
  return linhas.slice(1).map((l) => ({ dia: serialParaISO(l[cd]), cdi: l[cc] ?? '', selic: l[cs] ?? '', ipca: l[ci] ?? '', atualizadoEm: ca >= 0 && typeof l[ca] === 'number' ? l[ca] : '' })).filter((x) => x.dia);
}

export { ABAS };
