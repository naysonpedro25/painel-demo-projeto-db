// Funções de apoio usadas pelo crud.ts e pela tela.
// Nada aqui fala com o banco: são cálculos e conversões.

import { serverTimestamp, type DocumentData, type DocumentSnapshot } from "firebase/firestore";
import type { Item, Pedido, Status } from "./tipos";

/** Ordem em que um pedido avança. Cancelado e indisponível ficam fora da sequência. */
export const SEQUENCIA: Status[] = ["created", "approved", "shipped", "delivered"];

/** Erro de regra de negócio, com mensagem pronta para mostrar na tela. */
export class ErroDeRegra extends Error {}

const arredondar = (valor: number) => Math.round(valor * 100) / 100;

/** Soma preço e frete dos itens. O resultado é gravado no campo "totais" do pedido. */
export function calcularTotais(itens: Item[]) {
  const totalItens = itens.reduce((soma, i) => soma + (i.preco || 0), 0);
  const totalFrete = itens.reduce((soma, i) => soma + (i.frete || 0), 0);
  return {
    qtd_itens: itens.length,
    itens: arredondar(totalItens),
    frete: arredondar(totalFrete),
    geral: arredondar(totalItens + totalFrete),
  };
}

/** Converte o documento do Firestore em um Pedido, preenchendo o que estiver faltando. */
export function paraPedido(snap: DocumentSnapshot<DocumentData>): Pedido {
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

/** Campo de data que cada etapa preenche, com a hora do servidor. */
export function dataDaEtapa(status: Status): Record<string, unknown> {
  const campo = { approved: "aprovado_em", shipped: "enviado_em", delivered: "entregue_em" }[status as string];
  return campo ? { [campo]: serverTimestamp() } : {};
}

/** Próximo status na sequência, ou null se o pedido já chegou ao fim. */
export function proximoStatus(atual: Status): Status | null {
  if (atual === "canceled" || atual === "unavailable") return null;
  // No dataset, "invoiced" e "processing" ficam entre aprovado e enviado.
  const posicao = atual === "invoiced" || atual === "processing" ? 1 : SEQUENCIA.indexOf(atual);
  return SEQUENCIA[posicao + 1] ?? null;
}

/** Extrai do erro o link que o Firestore gera para criar o índice que falta. */
export function linkDoIndice(erro: unknown): string | null {
  const mensagem = erro instanceof Error ? erro.message : String(erro);
  const achado = mensagem.match(/https:\/\/console\.firebase\.google\.com\S+/);
  return achado ? achado[0] : null;
}
