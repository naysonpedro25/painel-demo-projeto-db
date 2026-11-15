// Lista de pedidos em tempo real e limpeza dos pedidos de teste.
// Fica fora do crud.ts porque trata um caso que só interessa à tela:
// quando falta o índice composto, a lista troca sozinha para uma consulta
// sem ordenação, em vez de parar de funcionar.

import {
  collection,
  deleteDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
  type FirestoreError,
  type QueryConstraint,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "./firebase";
import { linkDoIndice, paraPedido } from "./apoio";
import type { Filtros, Pedido } from "./tipos";

/** Quantos pedidos a lista mostra. Cada documento devolvido conta como uma leitura na cota. */
export const TAMANHO_DA_LISTA = 15;

function consultaDaLista(filtros: Filtros, ordenada: boolean) {
  const partes: QueryConstraint[] = [];
  if (filtros.estado) partes.push(where("cliente.estado", "==", filtros.estado));
  if (filtros.status) partes.push(where("status", "==", filtros.status));
  if (ordenada) partes.push(orderBy("data_compra", "desc"));
  partes.push(limit(TAMANHO_DA_LISTA));
  return query(collection(db, "pedidos"), ...partes);
}

export interface EscutaDaLista {
  aoMudar: (pedidos: Pedido[], info: { doCache: boolean; ordenada: boolean }) => void;
  aoFaltarIndice: (link: string | null) => void;
  aoErrar: (erro: FirestoreError) => void;
}

/** Escuta a lista em tempo real. Devolve a função que cancela a escuta. */
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
        if (ordenada && erro.code === "failed-precondition") {
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

/** Apaga os pedidos criados pelo painel (origem "demo"), até 50 por vez. Devolve quantos apagou. */
export async function apagarPedidosDaDemo(): Promise<number> {
  const snap = await getDocs(query(collection(db, "pedidos"), where("origem", "==", "demo"), limit(50)));
  await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
  return snap.size;
}
