// Operações de CRUD sobre a coleção "pedidos" do Firestore.
//
// Este arquivo não conhece a tela: só fala com o banco. O painel (main.ts)
// importa estas funções. Cada função corresponde a uma letra do CRUD:
//
//   Create  criarPedido
//   Read    lerPedido, listarPedidos, observarPedidos, observarPedido, resumirPedidos
//   Update  avancarStatus, cancelarPedido, adicionarItem, avaliarPedido
//   Delete  apagarPedido, apagarPedidosDaDemo

import {
  addDoc,
  collection,
  count,
  deleteDoc,
  doc,
  getAggregateFromServer,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  sum,
  updateDoc,
  where,
  type DocumentData,
  type DocumentSnapshot,
  type FirestoreError,
  type Query,
  type QueryConstraint,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "./firebase";
import type { Filtros, Item, NovoItem, NovoPedido, Pedido, Status } from "./tipos";

const COLECAO = "pedidos";

/** Quantos pedidos a lista mostra. Cada documento devolvido conta como uma leitura na cota. */
export const TAMANHO_DA_LISTA = 15;

/** Ordem em que um pedido avança. Cancelado e indisponível ficam fora da sequência. */
export const SEQUENCIA: Status[] = ["created", "approved", "shipped", "delivered"];

const CAMPO_DE_DATA: Partial<Record<Status, string>> = {
  approved: "aprovado_em",
  shipped: "enviado_em",
  delivered: "entregue_em",
};

/** Erro de regra de negócio, com mensagem pronta para mostrar na tela. */
export class ErroDeRegra extends Error {}

const arredondar = (valor: number) => Math.round(valor * 100) / 100;

/** Converte o documento do Firestore em um Pedido, preenchendo o que estiver faltando. */
function paraPedido(snap: DocumentSnapshot<DocumentData>): Pedido {
  const d = snap.data({ serverTimestamps: "estimate" }) ?? {};
  return {
    ...(d as Omit<Pedido, "id">),
    id: snap.id,
    status: (d.status ?? "created") as Status,
    cliente: d.cliente ?? {},
    itens: Array.isArray(d.itens) ? d.itens : [],
    pagamentos: Array.isArray(d.pagamentos) ? d.pagamentos : [],
    totais: {
      qtd_itens: d.totais?.qtd_itens ?? 0,
      itens: d.totais?.itens ?? 0,
      frete: d.totais?.frete ?? 0,
      geral: d.totais?.geral ?? 0,
    },
  };
}

function calcularTotais(itens: Item[]) {
  const totalItens = itens.reduce((soma, i) => soma + (i.preco || 0), 0);
  const totalFrete = itens.reduce((soma, i) => soma + (i.frete || 0), 0);
  return {
    qtd_itens: itens.length,
    itens: arredondar(totalItens),
    frete: arredondar(totalFrete),
    geral: arredondar(totalItens + totalFrete),
  };
}

function validarValor(nome: string, valor: number, minimo: number) {
  if (!Number.isFinite(valor) || valor < minimo) {
    throw new ErroDeRegra(`${nome} inválido: informe um número maior ou igual a ${minimo}.`);
  }
}

// ---------------------------------------------------------------- Create

/** Cria um pedido novo e devolve o ID gerado pelo Firestore. */
export async function criarPedido(novo: NovoPedido): Promise<string> {
  validarValor("Preço", novo.preco, 0.01);
  validarValor("Frete", novo.frete, 0);
  if (!novo.estado) throw new ErroDeRegra("Escolha o estado do cliente.");

  const itens: Item[] = [
    { seq: 1, categoria: novo.categoria, preco: arredondar(novo.preco), frete: arredondar(novo.frete) },
  ];
  const totais = calcularTotais(itens);

  const ref = await addDoc(collection(db, COLECAO), {
    status: "created",
    data_compra: serverTimestamp(),
    cliente: {
      nome: novo.nome.trim() || "Cliente da demo",
      cidade: novo.cidade.trim().toLowerCase(),
      estado: novo.estado,
    },
    itens,
    pagamentos: [{ seq: 1, tipo: novo.pagamento, parcelas: novo.parcelas, valor: totais.geral }],
    totais,
    origem: "demo",
  });
  return ref.id;
}

// ------------------------------------------------------------------ Read

/** Lê um pedido uma única vez. Devolve null se o documento não existe. */
export async function lerPedido(id: string): Promise<Pedido | null> {
  const snap = await getDoc(doc(db, COLECAO, id));
  return snap.exists() ? paraPedido(snap) : null;
}

function filtrosDaConsulta(filtros: Filtros): QueryConstraint[] {
  const partes: QueryConstraint[] = [];
  if (filtros.estado) partes.push(where("cliente.estado", "==", filtros.estado));
  if (filtros.status) partes.push(where("status", "==", filtros.status));
  return partes;
}

/**
 * Monta a consulta da lista. Com "ordenada", pede os pedidos mais recentes
 * primeiro; combinada com filtros, essa ordenação exige um índice composto.
 */
function consultaDaLista(filtros: Filtros, ordenada: boolean): Query<DocumentData> {
  const partes = filtrosDaConsulta(filtros);
  if (ordenada) partes.push(orderBy("data_compra", "desc"));
  partes.push(limit(TAMANHO_DA_LISTA));
  return query(collection(db, COLECAO), ...partes);
}

/** Lista os pedidos uma única vez, sem ficar escutando alterações. */
export async function listarPedidos(filtros: Filtros): Promise<Pedido[]> {
  const snap = await getDocs(consultaDaLista(filtros, true));
  return snap.docs.map(paraPedido);
}

/** Extrai do erro o link que o Firestore gera para criar o índice que falta. */
export function linkDoIndice(erro: unknown): string | null {
  const mensagem = erro instanceof Error ? erro.message : String(erro);
  const achado = mensagem.match(/https:\/\/console\.firebase\.google\.com\S+/);
  return achado ? achado[0] : null;
}

const faltaIndice = (erro: FirestoreError) => erro.code === "failed-precondition";

export interface EscutaDaLista {
  aoMudar: (pedidos: Pedido[], info: { doCache: boolean; ordenada: boolean }) => void;
  /** Chamado quando a consulta ordenada não tem índice composto e a lista caiu para a versão sem ordenação. */
  aoFaltarIndice: (link: string | null) => void;
  aoErrar: (erro: FirestoreError) => void;
}

/**
 * Escuta a lista em tempo real (onSnapshot). Se faltar o índice composto,
 * troca sozinha para a mesma consulta sem ordenação, que não precisa dele.
 * Devolve a função que cancela a escuta.
 */
export function observarPedidos(filtros: Filtros, escuta: EscutaDaLista): Unsubscribe {
  let cancelar: Unsubscribe = () => {};
  let cancelado = false;

  const escutar = (ordenada: boolean) => {
    cancelar = onSnapshot(
      consultaDaLista(filtros, ordenada),
      { includeMetadataChanges: true },
      (snap) =>
        escuta.aoMudar(snap.docs.map(paraPedido), { doCache: snap.metadata.fromCache, ordenada }),
      (erro) => {
        if (cancelado) return;
        if (ordenada && faltaIndice(erro)) {
          escuta.aoFaltarIndice(linkDoIndice(erro));
          escutar(false);
        } else {
          escuta.aoErrar(erro);
        }
      }
    );
  };

  escutar(true);
  return () => {
    cancelado = true;
    cancelar();
  };
}

/** Escuta um único pedido em tempo real. Recebe null quando o documento é apagado. */
export function observarPedido(
  id: string,
  aoMudar: (pedido: Pedido | null) => void,
  aoErrar: (erro: FirestoreError) => void
): Unsubscribe {
  return onSnapshot(
    doc(db, COLECAO, id),
    (snap) => aoMudar(snap.exists() ? paraPedido(snap) : null),
    aoErrar
  );
}

/**
 * Agregação: conta os pedidos e soma o faturamento dos filtros atuais.
 * É calculada no servidor e não funciona em tempo real nem offline,
 * por isso o painel recalcula só quando o botão é clicado.
 */
export async function resumirPedidos(filtros: Filtros): Promise<{ quantidade: number; faturamento: number }> {
  const consulta = query(collection(db, COLECAO), ...filtrosDaConsulta(filtros));
  const snap = await getAggregateFromServer(consulta, {
    quantidade: count(),
    faturamento: sum("totais.geral"),
  });
  const dados = snap.data();
  return { quantidade: dados.quantidade, faturamento: arredondar(dados.faturamento) };
}

// ---------------------------------------------------------------- Update

/** Próximo status na sequência, ou null se o pedido já chegou ao fim. */
export function proximoStatus(atual: Status): Status | null {
  if (atual === "canceled" || atual === "unavailable") return null;
  // No dataset, "invoiced" e "processing" ficam entre aprovado e enviado.
  const posicao = atual === "invoiced" || atual === "processing" ? 1 : SEQUENCIA.indexOf(atual);
  return SEQUENCIA[posicao + 1] ?? null;
}

/**
 * Avança o pedido para o próximo status. Usa transação porque o novo valor
 * depende do valor atual: se dois lojistas clicarem ao mesmo tempo, o pedido
 * avança uma etapa de cada vez, sem pular nenhuma.
 */
export async function avancarStatus(id: string): Promise<Status> {
  const ref = doc(db, COLECAO, id);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new ErroDeRegra("Este pedido não existe mais.");

    const proximo = proximoStatus(paraPedido(snap).status);
    if (!proximo) throw new ErroDeRegra("Este pedido não tem próxima etapa.");

    const campoDeData = CAMPO_DE_DATA[proximo];
    tx.update(ref, {
      status: proximo,
      ...(campoDeData ? { [campoDeData]: serverTimestamp() } : {}),
    });
    return proximo;
  });
}

/** Cancela um pedido que ainda não foi entregue. */
export async function cancelarPedido(id: string): Promise<void> {
  const ref = doc(db, COLECAO, id);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new ErroDeRegra("Este pedido não existe mais.");
    const status = paraPedido(snap).status;
    if (status === "delivered") throw new ErroDeRegra("Pedido entregue não pode ser cancelado.");
    if (status === "canceled") throw new ErroDeRegra("Este pedido já está cancelado.");
    tx.update(ref, { status: "canceled" });
  });
}

/**
 * Adiciona um item e recalcula os totais na mesma transação.
 * É o exemplo de transação do slide: lê o pedido, calcula e grava;
 * se outro usuário alterar o pedido no meio, o Firestore refaz tudo.
 */
export async function adicionarItem(id: string, novo: NovoItem): Promise<void> {
  validarValor("Preço", novo.preco, 0.01);
  validarValor("Frete", novo.frete, 0);

  const ref = doc(db, COLECAO, id);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new ErroDeRegra("Este pedido não existe mais.");

    const pedido = paraPedido(snap);
    if (["shipped", "delivered", "canceled", "unavailable"].includes(pedido.status)) {
      throw new ErroDeRegra("Só é possível adicionar itens antes do envio do pedido.");
    }

    const maiorSeq = pedido.itens.reduce((maior, i) => Math.max(maior, i.seq || 0), 0);
    const itens: Item[] = [
      ...pedido.itens,
      {
        seq: maiorSeq + 1,
        categoria: novo.categoria,
        preco: arredondar(novo.preco),
        frete: arredondar(novo.frete),
      },
    ];
    tx.update(ref, { itens, totais: calcularTotais(itens) });
  });
}

/** Grava a avaliação do cliente. Só vale para pedido entregue, com nota de 1 a 5. */
export async function avaliarPedido(id: string, nota: number, comentario: string): Promise<void> {
  if (!Number.isInteger(nota) || nota < 1 || nota > 5) {
    throw new ErroDeRegra("A nota deve ser um número inteiro de 1 a 5.");
  }
  const atual = await lerPedido(id);
  if (!atual) throw new ErroDeRegra("Este pedido não existe mais.");
  if (atual.status !== "delivered") throw new ErroDeRegra("Só é possível avaliar um pedido entregue.");

  const avaliacao: Record<string, unknown> = { nota, criada_em: serverTimestamp() };
  if (comentario.trim()) avaliacao.comentario = comentario.trim();
  await updateDoc(doc(db, COLECAO, id), { avaliacao });
}

// ---------------------------------------------------------------- Delete

/** Apaga um pedido. Apagar um documento que não existe não gera erro no Firestore. */
export async function apagarPedido(id: string): Promise<void> {
  await deleteDoc(doc(db, COLECAO, id));
}

/** Apaga os pedidos criados pelo painel (origem "demo"), até 50 por vez. Devolve quantos apagou. */
export async function apagarPedidosDaDemo(): Promise<number> {
  const snap = await getDocs(query(collection(db, COLECAO), where("origem", "==", "demo"), limit(50)));
  await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
  return snap.size;
}

