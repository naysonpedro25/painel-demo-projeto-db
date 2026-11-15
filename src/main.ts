// Painel da demonstração: liga a tela às funções de crud.ts.
// Três colunas: lista de pedidos, visão do lojista e visão do cliente.

import type { FirestoreError, Timestamp, Unsubscribe } from "firebase/firestore";
import { configPreenchida } from "./firebase";
import {
  ErroDeRegra,
  SEQUENCIA,
  TAMANHO_DA_LISTA,
  adicionarItem,
  apagarPedido,
  apagarPedidosDaDemo,
  avaliarPedido,
  avancarStatus,
  cancelarPedido,
  criarPedido,
  linkDoIndice,
  observarPedido,
  observarPedidos,
  proximoStatus,
  resumirPedidos,
} from "./crud";
import type { Filtros, Pedido, Status } from "./tipos";

// ------------------------------------------------------------ constantes

const ESTADOS = [
  "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT", "PA",
  "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO",
];

const NOME_DO_STATUS: Record<Status, string> = {
  created: "Pedido criado",
  approved: "Pagamento aprovado",
  invoiced: "Faturado",
  processing: "Em preparação",
  shipped: "Enviado",
  delivered: "Entregue",
  canceled: "Cancelado",
  unavailable: "Indisponível",
};

/** Como a loja fala com o cliente em cada etapa. */
const FRASE_PARA_O_CLIENTE: Record<Status, string> = {
  created: "Recebemos o seu pedido",
  approved: "Pagamento aprovado",
  invoiced: "Estamos preparando o seu pedido",
  processing: "Estamos preparando o seu pedido",
  shipped: "Seu pedido está a caminho",
  delivered: "Pedido entregue",
  canceled: "Pedido cancelado",
  unavailable: "Pedido indisponível",
};

const CATEGORIAS: Record<string, string> = {
  beleza_saude: "Beleza e saúde",
  informatica_acessorios: "Informática e acessórios",
  moveis_decoracao: "Móveis e decoração",
  esporte_lazer: "Esporte e lazer",
  utilidades_domesticas: "Utilidades domésticas",
  brinquedos: "Brinquedos",
  livros_tecnicos: "Livros técnicos",
};

const NOME_DO_PAGAMENTO: Record<string, string> = {
  credit_card: "Cartão de crédito",
  boleto: "Boleto",
  voucher: "Voucher",
  debit_card: "Cartão de débito",
};

// ------------------------------------------------------------ utilidades

const $ = <T extends HTMLElement>(seletor: string) => document.querySelector<T>(seletor)!;

/** Escapa texto antes de colocar no HTML, porque nome e comentário vêm do usuário. */
function esc(texto: unknown): string {
  return String(texto ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!
  );
}

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dataHora = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });
const hora = new Intl.DateTimeFormat("pt-BR", { timeStyle: "medium" });

const formatarData = (t?: Timestamp | null) => (t ? dataHora.format(t.toDate()) : "");
const idCurto = (id: string) => id.slice(0, 8);
const nomeDaCategoria = (c?: string) => (c ? CATEGORIAS[c] ?? c.replace(/_/g, " ") : "Sem categoria");

/** O dataset guarda as cidades em minúsculas ("sao paulo"); aqui cada palavra ganha inicial maiúscula. */
const capitalizar = (texto?: string) => (texto ?? "").replace(/(^|\s)\S/g, (letra) => letra.toUpperCase());

function nomeDoCliente(p: Pedido): string {
  const local = [capitalizar(p.cliente.cidade), p.cliente.estado].filter(Boolean).join(", ");
  return p.cliente.nome ? `${p.cliente.nome} (${local})` : local || "Cliente sem endereço";
}

/** Traduz os códigos de erro do Firestore para o que fazer na prática. */
function explicarErro(erro: unknown): string {
  if (erro instanceof ErroDeRegra) return erro.message;
  const codigo = (erro as FirestoreError)?.code ?? "";
  const mensagens: Record<string, string> = {
    "permission-denied":
      "As regras de segurança bloquearam a operação. Confira no Console se o modo de teste do banco expirou.",
    unavailable: "Sem conexão com o Firestore. Confira a internet.",
    "failed-precondition": "A consulta precisa de um índice composto que ainda não foi criado.",
    "resource-exhausted": "A cota gratuita de hoje acabou. Ela é renovada à meia-noite, no horário do Pacífico.",
    aborted: "Outra alteração aconteceu ao mesmo tempo e a transação desistiu. Tente de novo.",
    "not-found": "O documento não existe mais.",
    "invalid-argument": "O Firestore recusou os dados enviados.",
  };
  return mensagens[codigo] ?? (erro instanceof Error ? erro.message : String(erro));
}

// ----------------------------------------------------------------- estado

const filtros: Filtros = { estado: "", status: "" };
let selecionado: string | null = new URLSearchParams(location.search).get("pedido");
let pedidoAtual: Pedido | null = null;
let confirmandoExclusao = false;
let cancelarLista: Unsubscribe = () => {};
let cancelarPedidoAtual: Unsubscribe = () => {};

// ------------------------------------------------------- registro e avisos

/** Executa uma operação, mede o tempo e escreve o resultado no registro da tela. */
async function executar<T>(operacao: string, detalhe: string, acao: () => Promise<T>): Promise<T | undefined> {
  const inicio = performance.now();
  try {
    const resultado = await acao();
    registrar(operacao, detalhe, `${Math.round(performance.now() - inicio)} ms`, false);
    mostrarAviso(null);
    return resultado;
  } catch (erro) {
    const explicacao = explicarErro(erro);
    registrar(operacao, detalhe, explicacao, true);
    mostrarAviso(explicacao, linkDoIndice(erro));
    return undefined;
  }
}

function registrar(operacao: string, detalhe: string, resultado: string, falhou: boolean) {
  const linha = document.createElement("li");
  if (falhou) linha.className = "falha";
  linha.innerHTML =
    `<time>${hora.format(new Date())}</time>` +
    `<code>${esc(operacao)}</code>` +
    `<span>${esc(detalhe)}</span>` +
    `<em>${esc(resultado)}</em>`;
  const lista = $("#registro");
  lista.prepend(linha);
  while (lista.children.length > 30) lista.lastElementChild?.remove();
}

function mostrarAviso(texto: string | null, link?: string | null) {
  const aviso = $("#aviso");
  aviso.hidden = !texto;
  aviso.innerHTML = texto
    ? esc(texto) + (link ? ` <a href="${esc(link)}" target="_blank" rel="noopener">Criar o índice no Console</a>` : "")
    : "";
}

function mostrarConexao(estado: "conectado" | "offline" | "conectando" | "erro", texto: string) {
  const el = $("#conexao");
  el.dataset.estado = estado;
  el.textContent = texto;
}

// ------------------------------------------------------------------ lista

function escutarLista() {
  cancelarLista();
  $("#lista-nota").textContent = "";
  mostrarConexao("conectando", "Conectando");

  cancelarLista = observarPedidos(filtros, {
    aoMudar: (pedidos, info) => {
      desenharLista(pedidos);
      mostrarConexao(
        info.doCache ? "offline" : "conectado",
        info.doCache ? "Sem conexão, mostrando o que estava na tela" : "Conectado, atualizando em tempo real"
      );
      if (!info.ordenada) {
        $("#lista-nota").textContent =
          "Lista sem ordenação por data, porque o índice composto destes filtros ainda não existe.";
      }
    },
    aoFaltarIndice: (link) => {
      registrar("onSnapshot", "consulta ordenada com filtros", "Falta o índice composto", true);
      mostrarAviso(
        "Esta combinação de filtros com ordenação por data precisa de um índice composto. A lista continua funcionando sem a ordenação.",
        link
      );
    },
    aoErrar: (erro) => {
      mostrarConexao("erro", "Erro ao ler os pedidos");
      const explicacao = explicarErro(erro);
      registrar("onSnapshot", "lista de pedidos", explicacao, true);
      mostrarAviso(explicacao);
    },
  });
}

function desenharLista(pedidos: Pedido[]) {
  const lista = $("#lista");
  if (pedidos.length === 0) {
    lista.innerHTML = `<li class="vazio">Nenhum pedido com estes filtros.</li>`;
    return;
  }
  lista.innerHTML = pedidos
    .map(
      (p) => `
      <li>
        <button type="button" class="pedido${p.id === selecionado ? " ativo" : ""}" data-id="${esc(p.id)}">
          <span class="pedido-topo">
            <code>${esc(idCurto(p.id))}</code>
            <span class="etiqueta" data-status="${esc(p.status)}">${esc(NOME_DO_STATUS[p.status] ?? p.status)}</span>
          </span>
          <span class="pedido-cliente">${esc(nomeDoCliente(p))}${p.origem === "demo" ? ' <span class="demo">criado na demo</span>' : ""}</span>
          <span class="pedido-base">
            <span>${esc(formatarData(p.data_compra))}</span>
            <strong>${esc(moeda.format(p.totais.geral))}</strong>
          </span>
        </button>
      </li>`
    )
    .join("");
}

// ----------------------------------------------------- pedido selecionado

function selecionar(id: string | null) {
  selecionado = id;
  confirmandoExclusao = false;
  cancelarPedidoAtual();
  cancelarPedidoAtual = () => {};
  pedidoAtual = null;

  const url = new URL(location.href);
  if (id) url.searchParams.set("pedido", id);
  else url.searchParams.delete("pedido");
  history.replaceState(null, "", url);

  document.querySelectorAll<HTMLElement>(".pedido").forEach((b) => b.classList.toggle("ativo", b.dataset.id === id));

  if (!id) {
    desenharSelecionado(null, false);
    return;
  }
  cancelarPedidoAtual = observarPedido(
    id,
    (pedido) => {
      pedidoAtual = pedido;
      desenharSelecionado(pedido, true);
    },
    (erro) => {
      const explicacao = explicarErro(erro);
      registrar("onSnapshot", `pedidos/${idCurto(id)}`, explicacao, true);
      mostrarAviso(explicacao);
    }
  );
}

function desenharSelecionado(pedido: Pedido | null, haviaSelecao: boolean) {
  desenharLojista(pedido, haviaSelecao);
  desenharRastreio(pedido, haviaSelecao);
}

function linhasDeItens(p: Pedido): string {
  if (p.itens.length === 0) return `<li class="vazio">Pedido sem itens.</li>`;
  return p.itens
    .map(
      (i) => `
      <li>
        <span>${esc(nomeDaCategoria(i.categoria))}</span>
        <span>${esc(moeda.format(i.preco || 0))} <small>+ ${esc(moeda.format(i.frete || 0))} de frete</small></span>
      </li>`
    )
    .join("");
}

function desenharLojista(p: Pedido | null, haviaSelecao: boolean) {
  const vazio = $("#lojista-vazio");
  const painel = $("#lojista");
  painel.hidden = !p;
  vazio.hidden = Boolean(p);
  vazio.textContent = haviaSelecao
    ? "Este pedido foi apagado. Selecione outro na lista."
    : "Selecione um pedido na lista para gerenciar.";
  if (!p) return;

  const proximo = proximoStatus(p.status);
  $("#lojista-dados").innerHTML = `
    <div class="cabecalho-pedido">
      <div>
        <p class="rotulo">Pedido</p>
        <p class="codigo">${esc(p.id)}</p>
      </div>
      <span class="etiqueta" data-status="${esc(p.status)}">${esc(NOME_DO_STATUS[p.status] ?? p.status)}</span>
    </div>
    <p class="cliente">${esc(nomeDoCliente(p))}</p>
    <ul class="itens">${linhasDeItens(p)}</ul>
    <dl class="totais">
      <div><dt>Itens (${p.totais.qtd_itens})</dt><dd>${esc(moeda.format(p.totais.itens))}</dd></div>
      <div><dt>Frete</dt><dd>${esc(moeda.format(p.totais.frete))}</dd></div>
      <div class="geral"><dt>Total</dt><dd>${esc(moeda.format(p.totais.geral))}</dd></div>
    </dl>`;

  const avancar = $<HTMLButtonElement>("#botao-avancar");
  avancar.disabled = !proximo;
  avancar.textContent = proximo ? `Marcar como: ${NOME_DO_STATUS[proximo]}` : "Sem próxima etapa";
  $<HTMLButtonElement>("#botao-cancelar").disabled = p.status === "delivered" || p.status === "canceled";
  $<HTMLButtonElement>("#botao-apagar").textContent = confirmandoExclusao
    ? "Clique de novo para apagar"
    : "Apagar pedido";
}

function desenharRastreio(p: Pedido | null, haviaSelecao: boolean) {
  const area = $("#rastreio");
  const formulario = $<HTMLFormElement>("#form-avaliacao");
  if (!p) {
    formulario.hidden = true;
    area.innerHTML = `<p class="vazio">${
      haviaSelecao ? "Este pedido não existe mais." : "Selecione um pedido para ver a página que o cliente acompanha."
    }</p>`;
    return;
  }

  const parado = p.status === "canceled" || p.status === "unavailable";
  const etapaAtual = p.status === "invoiced" || p.status === "processing" ? 1 : SEQUENCIA.indexOf(p.status);
  const datas: Partial<Record<Status, Timestamp | null | undefined>> = {
    created: p.data_compra,
    approved: p.aprovado_em,
    shipped: p.enviado_em,
    delivered: p.entregue_em,
  };

  const etapas = SEQUENCIA.map((etapa, indice) => {
    const feita = !parado && indice <= etapaAtual;
    const atual = !parado && indice === etapaAtual;
    return `
      <li class="${feita ? "feita" : ""}${atual ? " atual" : ""}">
        <span class="marca-etapa" aria-hidden="true"></span>
        <span class="nome-etapa">${esc(NOME_DO_STATUS[etapa])}</span>
        <span class="data-etapa">${feita ? esc(formatarData(datas[etapa])) : ""}</span>
      </li>`;
  }).join("");

  const pagamentos = p.pagamentos
    .map(
      (pg) =>
        `${esc(NOME_DO_PAGAMENTO[pg.tipo] ?? pg.tipo)}${pg.parcelas > 1 ? ` em ${pg.parcelas}x` : ""}: ${esc(moeda.format(pg.valor || 0))}`
    )
    .join("<br>");

  const avaliacao = p.avaliacao
    ? `<div class="avaliacao">
         <p class="rotulo">Sua avaliação</p>
         <p class="estrelas" aria-label="Nota ${p.avaliacao.nota} de 5">${"★".repeat(p.avaliacao.nota)}${"☆".repeat(Math.max(0, 5 - p.avaliacao.nota))}</p>
         ${p.avaliacao.comentario ? `<p>${esc(p.avaliacao.comentario)}</p>` : ""}
       </div>`
    : "";

  const saudacao = p.cliente.nome ? `Olá, ${esc(p.cliente.nome)}.` : "Olá.";
  area.innerHTML = `
    <div class="situacao" data-status="${esc(p.status)}">
      <p class="situacao-pedido">Pedido <code>${esc(idCurto(p.id))}</code></p>
      <p class="situacao-frase">${esc(FRASE_PARA_O_CLIENTE[p.status] ?? NOME_DO_STATUS[p.status])}</p>
      <p class="situacao-apoio">${saudacao} ${parado ? "Este pedido não vai seguir para entrega." : "Esta página se atualiza sozinha a cada mudança."}</p>
    </div>
    <ol class="etapas">${etapas}</ol>
    <h3>Itens</h3>
    <ul class="itens">${linhasDeItens(p)}</ul>
    <dl class="totais">
      <div class="geral"><dt>Total com frete</dt><dd>${esc(moeda.format(p.totais.geral))}</dd></div>
    </dl>
    ${pagamentos ? `<p class="pagamentos">${pagamentos}</p>` : ""}
    ${avaliacao}`;

  formulario.hidden = p.status !== "delivered";
  formulario.querySelector("h3")!.textContent = p.avaliacao ? "Mudar a avaliação" : "Avaliar o pedido";
}

// ---------------------------------------------------------------- eventos

function preencherSelects() {
  const opcoesDeEstado = ESTADOS.map((uf) => `<option value="${uf}">${uf}</option>`).join("");
  $("#filtro-estado").innerHTML = `<option value="">Todos</option>${opcoesDeEstado}`;
  $("#novo-estado").innerHTML = opcoesDeEstado;
  $<HTMLSelectElement>("#novo-estado").value = "AL";

  $("#filtro-status").innerHTML =
    `<option value="">Todos</option>` +
    (Object.keys(NOME_DO_STATUS) as Status[])
      .map((s) => `<option value="${s}">${esc(NOME_DO_STATUS[s])}</option>`)
      .join("");

  const opcoesDeCategoria = Object.entries(CATEGORIAS)
    .map(([valor, nome]) => `<option value="${valor}">${esc(nome)}</option>`)
    .join("");
  $("#novo-categoria").innerHTML = opcoesDeCategoria;
  $("#item-categoria").innerHTML = opcoesDeCategoria;
}

function ligarEventos() {
  $("#filtros").addEventListener("change", () => {
    filtros.estado = $<HTMLSelectElement>("#filtro-estado").value;
    filtros.status = $<HTMLSelectElement>("#filtro-status").value;
    $("#resumo-texto").textContent = "Quantidade e faturamento dos filtros atuais.";
    mostrarAviso(null);
    escutarLista();
  });

  $("#lista").addEventListener("click", (evento) => {
    const botao = (evento.target as HTMLElement).closest<HTMLElement>(".pedido");
    if (botao?.dataset.id) selecionar(botao.dataset.id);
  });

  $("#botao-resumo").addEventListener("click", async () => {
    const r = await executar("getAggregateFromServer", "count() e sum(totais.geral)", () => resumirPedidos(filtros));
    if (r) {
      $("#resumo-texto").textContent =
        `${r.quantidade.toLocaleString("pt-BR")} pedidos, ${moeda.format(r.faturamento)} em vendas. ` +
        `Calculado às ${hora.format(new Date())}; não atualiza sozinho.`;
    }
  });

  $<HTMLFormElement>("#form-novo").addEventListener("submit", async (evento) => {
    evento.preventDefault();
    const dados = new FormData(evento.currentTarget as HTMLFormElement);
    const id = await executar("addDoc", "pedidos (novo documento)", () =>
      criarPedido({
        nome: String(dados.get("nome") ?? ""),
        cidade: String(dados.get("cidade") ?? ""),
        estado: String(dados.get("estado") ?? ""),
        categoria: String(dados.get("categoria") ?? ""),
        preco: Number(dados.get("preco")),
        frete: Number(dados.get("frete")),
        pagamento: String(dados.get("pagamento") ?? "credit_card"),
        parcelas: Number(dados.get("parcelas")) || 1,
      })
    );
    if (id) {
      $<HTMLDetailsElement>("#novo").open = false;
      selecionar(id);
    }
  });

  $("#botao-avancar").addEventListener("click", () => {
    if (!selecionado) return;
    const id = selecionado;
    void executar("runTransaction", `pedidos/${idCurto(id)}: status`, () => avancarStatus(id));
  });

  $("#botao-cancelar").addEventListener("click", () => {
    if (!selecionado) return;
    const id = selecionado;
    void executar("runTransaction", `pedidos/${idCurto(id)}: status = canceled`, () => cancelarPedido(id));
  });

  $<HTMLFormElement>("#form-item").addEventListener("submit", (evento) => {
    evento.preventDefault();
    if (!selecionado) return;
    const id = selecionado;
    const dados = new FormData(evento.currentTarget as HTMLFormElement);
    void executar("runTransaction", `pedidos/${idCurto(id)}: itens e totais`, () =>
      adicionarItem(id, {
        categoria: String(dados.get("categoria") ?? ""),
        preco: Number(dados.get("preco")),
        frete: Number(dados.get("frete")),
      })
    );
  });

  $("#botao-apagar").addEventListener("click", async () => {
    if (!selecionado) return;
    if (!confirmandoExclusao) {
      confirmandoExclusao = true;
      desenharLojista(pedidoAtual, true);
      return;
    }
    const id = selecionado;
    confirmandoExclusao = false;
    await executar("deleteDoc", `pedidos/${idCurto(id)}`, () => apagarPedido(id));
  });

  $("#botao-link").addEventListener("click", async () => {
    if (!selecionado) return;
    const url = new URL(location.href);
    url.searchParams.set("pedido", selecionado);
    url.searchParams.set("visao", "cliente");
    try {
      await navigator.clipboard.writeText(url.toString());
      $("#botao-link").textContent = "Link copiado";
    } catch {
      $("#botao-link").textContent = url.toString();
    }
    setTimeout(() => ($("#botao-link").textContent = "Copiar link do rastreio"), 4000);
  });

  $<HTMLFormElement>("#form-avaliacao").addEventListener("submit", (evento) => {
    evento.preventDefault();
    if (!selecionado) return;
    const id = selecionado;
    const dados = new FormData(evento.currentTarget as HTMLFormElement);
    void executar("updateDoc", `pedidos/${idCurto(id)}: avaliacao`, () =>
      avaliarPedido(id, Number(dados.get("nota")), String(dados.get("comentario") ?? ""))
    );
  });

  $("#botao-limpar-demo").addEventListener("click", async () => {
    const apagados = await executar("deleteDoc", 'pedidos com origem "demo"', apagarPedidosDaDemo);
    if (apagados !== undefined) {
      registrar("limpeza", "pedidos criados na demo", `${apagados} apagados`, false);
    }
  });

  window.addEventListener("offline", () => mostrarConexao("offline", "Sem internet"));
  window.addEventListener("online", () => mostrarConexao("conectando", "Reconectando"));
}

// ----------------------------------------------------------------- início

function iniciar() {
  if (!configPreenchida) {
    document.body.innerHTML = `
      <main class="configurar">
        <h1>Falta configurar o Firebase</h1>
        <p>O arquivo <code>src/firebase-config.ts</code> ainda está com os valores de exemplo.</p>
        <ol>
          <li>Abra o Firebase Console e entre no projeto <code>trabalho-bd-4dce0</code>.</li>
          <li>Clique na engrenagem, depois em Configurações do projeto.</li>
          <li>Na aba Geral, em Seus apps, abra o app Web. Se não houver, clique em Adicionar app e escolha Web.</li>
          <li>Copie o objeto <code>firebaseConfig</code> e cole no arquivo.</li>
        </ol>
        <p>Depois de salvar, esta página recarrega sozinha.</p>
      </main>`;
    return;
  }

  // ?visao=cliente mostra só a coluna do cliente, para abrir no celular.
  if (new URLSearchParams(location.search).get("visao") === "cliente") {
    document.body.classList.add("so-cliente");
  }

  preencherSelects();
  ligarEventos();
  escutarLista();
  if (selecionado) selecionar(selecionado);
  registrar("início", `lista limitada a ${TAMANHO_DA_LISTA} pedidos por consulta`, "pronto", false);
}

iniciar();
