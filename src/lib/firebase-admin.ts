import 'server-only';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

function adminApp() {
  const publicProjectId = (process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? '').trim();
  const projectId = (process.env.FIREBASE_ADMIN_PROJECT_ID ?? publicProjectId).trim();
  const useEmulators = process.env.NEXT_PUBLIC_USE_EMULATORS === 'true';
  if (!projectId || (!useEmulators && projectId.startsWith('demo-'))) throw new Error('FIREBASE_ADMIN_PROJECT_ID não configurado para o backend.');
  if (publicProjectId && projectId !== publicProjectId) throw new Error('O projeto Firebase do backend precisa corresponder ao projeto Firebase do app web.');

  if (useEmulators) {
    process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099';
    process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
  }

  const existing = getApps().find((app) => app.name === 'prov-admin');
  if (existing) return existing;

  if (useEmulators) return initializeApp({ projectId }, 'prov-admin');

  const clientEmail = (process.env.FIREBASE_ADMIN_CLIENT_EMAIL ?? '').trim();
  const privateKey = (process.env.FIREBASE_ADMIN_PRIVATE_KEY ?? '').replace(/\\n/g, '\n').trim();
  if (!clientEmail || !privateKey) {
    throw new Error('Configure FIREBASE_ADMIN_CLIENT_EMAIL e FIREBASE_ADMIN_PRIVATE_KEY no ambiente do backend.');
  }

  return initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
    projectId,
  }, 'prov-admin');
}

export function adminAuth() {
  return getAuth(adminApp());
}

export function adminDb() {
  return getFirestore(adminApp());
}

export { FieldValue };
