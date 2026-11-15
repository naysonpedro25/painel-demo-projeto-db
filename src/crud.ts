// CRUD da coleção "pedidos" no Cloud Firestore.

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "./firebase";
import { calcularTotais, dataDaEtapa, paraPedido } from "./apoio";
import type { Item, NovoPedido, Pedido, Status } from "./tipos";

// ---------------------------------------------------------------- CREATE

// Grava um pedido novo e devolve o ID que o Firestore gerou.
export async function criarPedido(novo: NovoPedido): Promise<string> {
  const itens = [{ seq: 1, categoria: novo.categoria, preco: novo.preco, frete: novo.frete }];
  const totais = calcularTotais(itens);

  const ref = await addDoc(collection(db, "pedidos"), {
    status: "created",
    data_compra: serverTimestamp(),
    cliente: { nome: novo.nome, cidade: novo.cidade, estado: novo.estado },
    itens,
    pagamentos: [{ seq: 1, tipo: novo.pagamento, parcelas: novo.parcelas, valor: totais.geral }],
    totais,
    origem: "demo",
  });
  return ref.id;
}

// ------------------------------------------------------------------ READ

// Lê um pedido pelo ID. Devolve null se o documento não existe.
export async function lerPedido(id: string): Promise<Pedido | null> {
  const snap = await getDoc(doc(db, "pedidos", id));
  return snap.exists() ? paraPedido(snap) : null;
}

// Consulta: os 15 pedidos mais recentes de um estado, em um status.
export async function listarPedidos(estado: string, status: Status): Promise<Pedido[]> {
  const consulta = query(
    collection(db, "pedidos"),
    where("cliente.estado", "==", estado),
    where("status", "==", status),
    orderBy("data_compra", "desc"),
    limit(15)
  );
  const snap = await getDocs(consulta);
  return snap.docs.map(paraPedido);
}

// Tempo real: chama aoMudar agora e de novo a cada alteração do pedido.
export function observarPedido(
  id: string,
  aoMudar: (pedido: Pedido | null) => void,
  aoErrar?: (erro: Error) => void
) {
  return onSnapshot(
    doc(db, "pedidos", id),
    (snap) => aoMudar(snap.exists() ? paraPedido(snap) : null),
    aoErrar
  );
}

// ---------------------------------------------------------------- UPDATE

// Muda o status do pedido e marca a data da etapa.
export async function atualizarStatus(id: string, status: Status): Promise<void> {
  await updateDoc(doc(db, "pedidos", id), { status, ...dataDaEtapa(status) });
}

// Transação: adiciona um item e recalcula os totais como uma operação só.
export async function adicionarItem(id: string, novo: Item): Promise<void> {
  const ref = doc(db, "pedidos", id);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("Este pedido não existe mais.");

    const itens = [...snap.data().itens, novo];
    const totais = calcularTotais(itens);

    tx.update(ref, { itens, totais });
  });
}

// ---------------------------------------------------------------- DELETE

// Apaga o pedido.
export async function apagarPedido(id: string): Promise<void> {
  await deleteDoc(doc(db, "pedidos", id));
}
