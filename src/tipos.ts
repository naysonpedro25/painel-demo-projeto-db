import type { Timestamp } from "firebase/firestore";

/** Valores de status que existem no dataset do Olist. */
export type Status =
  | "created"
  | "approved"
  | "invoiced"
  | "processing"
  | "shipped"
  | "delivered"
  | "canceled"
  | "unavailable";

export interface Item {
  seq: number;
  produto_id?: string;
  categoria?: string;
  categoria_en?: string;
  vendedor_id?: string;
  preco: number;
  frete: number;
}

export interface Pagamento {
  seq: number;
  tipo: string;
  parcelas: number;
  valor: number;
}

export interface Avaliacao {
  nota: number;
  titulo?: string;
  comentario?: string;
  criada_em?: Timestamp | null;
}

export interface Totais {
  qtd_itens: number;
  itens: number;
  frete: number;
  geral: number;
}

/** Um documento da coleção "pedidos", como o script de importação gravou. */
export interface Pedido {
  id: string;
  status: Status;
  data_compra?: Timestamp | null;
  aprovado_em?: Timestamp | null;
  enviado_em?: Timestamp | null;
  entregue_em?: Timestamp | null;
  previsao_entrega?: Timestamp | null;
  cliente: { id?: string; nome?: string; cidade?: string; estado?: string };
  itens: Item[];
  pagamentos: Pagamento[];
  avaliacao?: Avaliacao;
  totais: Totais;
  /** "demo" nos pedidos criados pelo painel; ausente nos pedidos importados. */
  origem?: string;
}

export interface Filtros {
  estado: string;
  status: string;
}

export interface NovoPedido {
  nome: string;
  cidade: string;
  estado: string;
  categoria: string;
  preco: number;
  frete: number;
  pagamento: string;
  parcelas: number;
}

export interface NovoItem {
  categoria: string;
  preco: number;
  frete: number;
}
