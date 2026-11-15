# Painel da demonstração (Loja Olist)

Página web que mostra o CRUD em tempo real sobre a coleção `pedidos` do Firestore.
Tem três colunas: a lista de pedidos, a visão do lojista (altera o pedido) e a visão
do cliente (acompanha o pedido). Embaixo fica o registro de cada operação enviada ao banco.

## Como rodar

1. Preencha `src/firebase-config.ts` com a configuração web do projeto.
   No Firebase Console: engrenagem > Configurações do projeto > Geral > Seus apps > app Web.
   Se não existir um app Web, clique em Adicionar app e escolha Web.
2. Instale e rode:

   ```bash
   npm install
   npm run dev
   ```

3. Abra o endereço `Local` que o terminal mostrar (normalmente http://localhost:5173).
   O endereço `Network` serve para abrir no celular, se ele estiver na mesma rede.

Enquanto a configuração não for preenchida, a página mostra uma tela explicando o que falta.

## Arquivos

| Arquivo | O que tem |
|---|---|
| `src/crud.ts` | As operações de CRUD. Não depende da tela; é o arquivo para mostrar na apresentação. |
| `src/main.ts` | A tela: desenha as colunas e chama as funções do `crud.ts`. |
| `src/tipos.ts` | Os tipos TypeScript do documento `pedidos`. |
| `src/firebase.ts` | Conexão com o Firestore. |
| `src/firebase-config.ts` | Configuração do projeto (você preenche). |
| `firestore.indexes.json` | Os três índices compostos que a lista usa. |

## Onde está cada letra do CRUD

| Letra | Função em `crud.ts` | Chamada do Firestore | Na tela |
|---|---|---|---|
| Create | `criarPedido` | `addDoc` | Formulário "Criar pedido" |
| Read | `observarPedidos`, `observarPedido` | `onSnapshot` | Lista e rastreio, em tempo real |
| Read | `lerPedido`, `listarPedidos` | `getDoc`, `getDocs` | Leitura única (usada em `avaliarPedido`) |
| Read | `resumirPedidos` | `getAggregateFromServer` | Botão "Calcular resumo" |
| Update | `avancarStatus`, `cancelarPedido`, `adicionarItem` | `runTransaction` | Botões do lojista |
| Update | `avaliarPedido` | `updateDoc` | Formulário do cliente |
| Delete | `apagarPedido`, `apagarPedidosDaDemo` | `deleteDoc` | "Apagar pedido" e a limpeza no rodapé |

## Antes da apresentação

Faça isto com pelo menos um dia de folga, porque o índice leva alguns minutos para ficar pronto.

1. **Crie os índices compostos.** Na página, escolha um estado e veja a lista; depois um
   status; depois os dois juntos. Em cada caso que precisar de índice, aparece um aviso
   vermelho com o link "Criar o índice no Console". Clique, confirme e espere o status
   mudar para Ativado. São três índices (os mesmos de `firestore.indexes.json`).
   Sem eles a lista continua funcionando, só que sem a ordenação por data.
2. **Confira as regras de segurança.** No Console, Firestore Database > Regras. O modo de
   teste traz uma data limite (30 dias depois da criação do banco). Se a apresentação for
   depois dessa data, aumente a data na regra e publique.
3. **Faça um ensaio completo** com o roteiro abaixo e grave a tela. O vídeo é o plano B.
4. **Apague os pedidos de teste** com "Apagar pedidos criados na demo", no rodapé.

## Roteiro sugerido

1. Read: clicar em um pedido do dataset. O rastreio do cliente aparece ao lado.
2. Read com filtro: escolher SP e Entregue. Clicar em "Calcular resumo" (agregação).
3. Create: abrir "Criar pedido", preencher o nome e criar. O pedido aparece na lista
   com a marca "criado na demo" e já fica selecionado.
4. Update: "Adicionar item" (transação que recalcula o total) e depois avançar as etapas.
   A linha do tempo do cliente muda a cada clique.
5. Tentar adicionar um item depois de Enviado: a operação é recusada, e o motivo aparece
   no aviso e no registro.
6. Update pelo cliente: com o pedido Entregue, enviar uma avaliação.
7. Delete: "Apagar pedido" (dois cliques). O rastreio mostra que o pedido não existe mais.

Para mostrar o tempo real com duas pessoas, use "Copiar link do rastreio" e abra o link em
outra janela, ou no celular trocando `localhost` pelo endereço `Network` do terminal.
Também dá para alterar o documento direto no Firebase Console e ver a página mudar.

## Pontos de falha e o que a página faz

| Problema | O que acontece | O que fazer |
|---|---|---|
| Configuração não preenchida | Tela "Falta configurar o Firebase" | Preencher `src/firebase-config.ts` |
| Falta índice composto | Aviso com link; lista segue sem ordenação | Criar o índice pelo link |
| Modo de teste expirou | Aviso "As regras de segurança bloquearam" | Atualizar a data nas regras |
| Sem internet | Indicador vermelho no topo; a lista mostra o que já estava na tela | Reconectar; usar o vídeo |
| Cota gratuita esgotada | Aviso "A cota gratuita de hoje acabou" | Esperar a renovação diária |
| Pedido apagado por outra pessoa | Colunas mostram "Este pedido foi apagado" | Selecionar outro |
| Duas alterações ao mesmo tempo | A transação é refeita sozinha pelo SDK | Nada |
| Valor inválido (preço zero, nota fora de 1 a 5) | Operação recusada antes de ir ao banco | Corrigir o valor |

Sobre a cota: o plano gratuito permite 50 mil leituras e 20 mil escritas por dia. A lista
lê no máximo 15 documentos por consulta, então cada troca de filtro custa até 15 leituras.
Não troque a lista por uma leitura da coleção inteira: com 3 mil pedidos, 17 recargas
esgotariam a cota do dia.

## O que não foi testado

O código compila e a tela foi testada com dados simulados no lugar do Firestore.
Ele ainda não rodou contra o banco real, porque a configuração web é sua.
O primeiro `npm run dev` com a configuração preenchida é o teste que falta.
