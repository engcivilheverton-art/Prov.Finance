import 'server-only';
import { createHash } from 'node:crypto';
import { adminAuth, adminDb, FieldValue } from '@/lib/firebase-admin';
export { hasValidWebhookSignature } from '@/lib/webhook-signature';

export type VerifiedUser = { uid: string; email?: string; name?: string };
export type Subscription = {
  status: string;
  plan: string;
  preapprovalId?: string;
  checkoutUrl?: string;
  providerVersion?: number;
  updatedAt?: string;
};

export class InvalidFirebaseTokenError extends Error {}

export async function verifyFirebaseIdToken(token: string): Promise<VerifiedUser> {
  try {
    const claims = await adminAuth().verifyIdToken(token, true);
    return { uid: claims.uid, email: claims.email, name: claims.name };
  } catch {
    throw new InvalidFirebaseTokenError('Token Firebase inválido ou expirado.');
  }
}

const subscriptionRef = (uid: string) => adminDb().doc(`users/${uid}/assinatura/status`);

export async function readSubscription(uid: string): Promise<Subscription | null> {
  const snapshot = await subscriptionRef(uid).get();
  if (!snapshot.exists) return null;
  const data = snapshot.data() ?? {};
  return {
    status: typeof data.status === 'string' ? data.status : 'free',
    plan: typeof data.plan === 'string' ? data.plan : 'free',
    preapprovalId: typeof data.preapprovalId === 'string' ? data.preapprovalId : undefined,
    checkoutUrl: typeof data.checkoutUrl === 'string' ? data.checkoutUrl : undefined,
    providerVersion: typeof data.providerVersion === 'number' ? data.providerVersion : undefined,
    updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : undefined,
  };
}

export async function writeSubscription(uid: string, subscription: Subscription): Promise<void> {
  const ref = subscriptionRef(uid);
  await adminDb().runTransaction(async (transaction) => {
    const current = await transaction.get(ref);
    const currentVersion = current.get('providerVersion');
    if (typeof subscription.providerVersion === 'number' && typeof currentVersion === 'number' && subscription.providerVersion < currentVersion) return;
    transaction.set(ref, {
      status: subscription.status,
      plan: subscription.plan,
      ...(subscription.preapprovalId ? { preapprovalId: subscription.preapprovalId } : {}),
      ...(subscription.checkoutUrl ? { checkoutUrl: subscription.checkoutUrl } : {}),
      ...(typeof subscription.providerVersion === 'number' ? { providerVersion: subscription.providerVersion } : {}),
      updatedAt: new Date().toISOString(),
    }, { merge: true });
  });
}

export async function reserveSubscriptionCheckout(uid: string, plan: string, attemptId: string) {
  const db = adminDb();
  const ref = subscriptionRef(uid);
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const current = snapshot.data() ?? {};
    if (current.status === 'authorized') return { kind: 'active' as const };
    if (current.status === 'pending' && typeof current.preapprovalId === 'string' && typeof current.checkoutUrl === 'string' && current.plan === plan) {
      return { kind: 'existing' as const, preapprovalId: current.preapprovalId, checkoutUrl: current.checkoutUrl };
    }
    const startedAt = typeof current.checkoutStartedAt === 'number' ? current.checkoutStartedAt : 0;
    if (current.status === 'creating' && Date.now() - startedAt < 120_000) return { kind: 'busy' as const };
    transaction.set(ref, { status: 'creating', plan, checkoutAttemptId: attemptId, checkoutStartedAt: Date.now(), updatedAt: new Date().toISOString() }, { merge: true });
    return { kind: 'reserved' as const };
  });
}

export async function finishSubscriptionCheckout(uid: string, attemptId: string, subscription: Subscription): Promise<boolean> {
  const db = adminDb();
  const ref = subscriptionRef(uid);
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (snapshot.get('checkoutAttemptId') !== attemptId) return false;
    transaction.set(ref, {
      status: subscription.status,
      plan: subscription.plan,
      preapprovalId: subscription.preapprovalId,
      checkoutUrl: subscription.checkoutUrl,
      updatedAt: new Date().toISOString(),
      checkoutAttemptId: FieldValue.delete(),
      checkoutStartedAt: FieldValue.delete(),
    }, { merge: true });
    return true;
  });
}

export async function releaseSubscriptionCheckout(uid: string, attemptId: string): Promise<void> {
  const ref = subscriptionRef(uid);
  await adminDb().runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (snapshot.get('checkoutAttemptId') !== attemptId) return;
    transaction.set(ref, {
      status: 'free', plan: 'free', updatedAt: new Date().toISOString(),
      checkoutAttemptId: FieldValue.delete(), checkoutStartedAt: FieldValue.delete(),
    }, { merge: true });
  });
}

export async function recordSubscriptionWebhookEvent(input: {
  uid: string; preapprovalId: string; plan: string; status: string;
  providerVersion?: number; type: string; requestId: string; resourceId: string;
  paymentStatus?: string;
}): Promise<'applied' | 'duplicate' | 'ignored'> {
  const db = adminDb();
  const hash = createHash('sha256').update(`${input.type}:${input.requestId}`).digest('hex');
  const ref = subscriptionRef(input.uid);
  const eventRef = db.doc(`users/${input.uid}/assinatura/eventos/${hash}`);
  return db.runTransaction(async (transaction) => {
    const [event, subscription] = await Promise.all([transaction.get(eventRef), transaction.get(ref)]);
    if (event.exists) return 'duplicate';
    const current = subscription.data() ?? {};
    const sameContract = current.preapprovalId === input.preapprovalId && current.plan === input.plan;
    const currentVersion = current.providerVersion;
    const olderProviderState = typeof input.providerVersion === 'number' && typeof currentVersion === 'number' && input.providerVersion < currentVersion;
    const applied = sameContract && !olderProviderState;
    transaction.create(eventRef, {
      type: input.type,
      resourceId: input.resourceId,
      preapprovalId: input.preapprovalId,
      receivedAt: FieldValue.serverTimestamp(),
      result: applied ? 'applied' : 'ignored',
      ...(input.paymentStatus ? { paymentStatus: input.paymentStatus } : {}),
    });
    if (applied) {
      transaction.set(ref, {
        status: input.status,
        plan: input.plan,
        preapprovalId: input.preapprovalId,
        ...(typeof input.providerVersion === 'number' ? { providerVersion: input.providerVersion } : {}),
        updatedAt: new Date().toISOString(),
      }, { merge: true });
    }
    return applied ? 'applied' : 'ignored';
  });
}

export type FirestorePlainDocument = { id: string; fields: Record<string, unknown> };

export async function getFirestoreDocument(path: string): Promise<Record<string, unknown> | null> {
  const snapshot = await adminDb().doc(path).get();
  return snapshot.exists ? snapshot.data() ?? {} : null;
}

export async function listFirestoreCollection(path: string): Promise<FirestorePlainDocument[]> {
  const snapshot = await adminDb().collection(path).get();
  return snapshot.docs.map((document) => ({ id: document.id, fields: document.data() }));
}

export async function commitFirestoreDocuments(writes: { path: string; fields: Record<string, unknown>; createOnly?: boolean }[]): Promise<void> {
  const db = adminDb();
  const chunkSize = 400;
  const isAlreadyExists = (error: unknown) => {
    const code = (error as { code?: number | string } | null)?.code;
    return code === 6 || code === 'already-exists';
  };

  for (let offset = 0; offset < writes.length; offset += chunkSize) {
    let pending = writes.slice(offset, offset + chunkSize);
    // A create-only collision can happen if two imports of the same file race.
    // Re-read and retry just the documents that are still missing.
    for (let attempt = 0; pending.length > 0 && attempt < 3; attempt++) {
      const batch = db.batch();
      for (const { path, fields, createOnly } of pending) {
        const ref = db.doc(path);
        if (createOnly) batch.create(ref, fields);
        else batch.set(ref, fields, { merge: true });
      }
      try {
        await batch.commit();
        pending = [];
      } catch (error) {
        if (!pending.every((write) => write.createOnly) || !isAlreadyExists(error) || attempt === 2) {
          throw new Error('Não foi possível salvar os dados no Firestore.');
        }
        const snapshots = await Promise.all(pending.map(({ path }) => db.doc(path).get()));
        pending = pending.filter((_, index) => !snapshots[index].exists);
      }
    }
  }
}

