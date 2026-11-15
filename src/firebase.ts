import { initializeApp } from "firebase/app";
import { getFirestore, type Firestore } from "firebase/firestore";
import { firebaseConfig } from "./firebase-config";

const obrigatorios = [firebaseConfig.apiKey, firebaseConfig.projectId, firebaseConfig.appId];

/** Falso enquanto o firebase-config.ts ainda tem os valores de exemplo. */
export const configPreenchida = obrigatorios.every(
  (valor) => Boolean(valor) && !valor.startsWith("COLE_")
);

/** Conexão com o Firestore. Só é criada quando a configuração foi preenchida. */
export const db: Firestore = configPreenchida
  ? getFirestore(initializeApp(firebaseConfig))
  : (null as unknown as Firestore);
