# Economiau 🐾

Economiau — controle financeiro da família Santos Mota. Gastos, cartões, metas e a divisão das contas da casa pela renda de cada um, com os dados guardados numa planilha Google só nossa.

**App:** https://apto305.github.io/Economiau/

## O que já faz (versão 1.1)

- Entrar com Google (só os e-mails da aba Pessoas da planilha).
- Escolher a planilha no seletor do Google: o app só enxerga essa planilha.
- Perfis Demétrio, Giovanna e Família, cada um com a sua cor e os seus números.
- Lançar despesa, receita, compra no cartão (com parcelas) e transferência/pagamento de fatura, escolhendo **de quem é** e **de onde saiu o dinheiro**.
- Faturas criadas sozinhas pelo dia de fechamento do cartão; dá para corrigir as datas de uma fatura específica.
- Compras no cartão contam no mês da fatura (renda, divisão e acerto); pix e boleto no mês do pagamento.
- Divisão dos gastos da família pela renda do mês e acerto calculado (quem transfere quanto para quem).
- Cadastro de contas, cartões e rendas.
- Contas fixas ("Repetir todo mês"): aparecem como previstas até alguém confirmar.
- Tags livres em qualquer lançamento e filtros em Transações (tipo, categoria, conta, tag, busca, não conferidos).
- "Gasto de trabalho: deduz da renda": o valor sai da renda de quem pagou antes da divisão.
- Celular (instalável na tela inicial) e computador (menu lateral, tabela de transações).
- Modo demonstração com dados inventados ("Experimentar com dados de exemplo").

## Como funciona

O app é só a interface (HTML, CSS e JavaScript, sem servidor). Os dados ficam na planilha da família no Google Drive, montada pelo script `montar-planilha.gs` (versão 1.8 ou mais nova). Nada é guardado neste repositório.

Arquivos principais:

- `js/regras.js` — regras: faturas, mês de competência, divisão pela renda, saldos e acerto.
- `js/dados.js` — leitura e gravação nas abas da planilha (e o modo demonstração).
- `js/google.js` — login Google, seletor de arquivo e API do Google Sheets.
- `js/telas.js` e `js/app.js` — telas e ações.
