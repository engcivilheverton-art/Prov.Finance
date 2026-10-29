import { getApp, getApps, initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';

const usarEmuladores = process.env.NEXT_PUBLIC_USE_EMULATORS === 'true';

const app = getApps().length
  ? getApp()
  : initializeApp({
      apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? 'demo-key',
      authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? 'demo-prov-financeiro',
      appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    });

export const auth = getAuth(app);
export const db = getFirestore(app);

// Conecta aos emuladores uma única vez (o hot reload reexecuta este módulo).
const g = globalThis as typeof globalThis & { __emuladoresConectados?: boolean };
if (usarEmuladores && typeof window !== 'undefined' && !g.__emuladoresConectados) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  g.__emuladoresConectados = true;
}
