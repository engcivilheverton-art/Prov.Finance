'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import { auth } from '@/lib/firebase';

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  entrarComEmail: (email: string, senha: string) => Promise<void>;
  criarConta: (nome: string, email: string, senha: string) => Promise<void>;
  entrarComGoogle: () => Promise<void>;
  recuperarSenha: (email: string) => Promise<void>;
  sair: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      entrarComEmail: async (email, senha) => {
        await signInWithEmailAndPassword(auth, email, senha);
      },
      criarConta: async (nome, email, senha) => {
        const cred = await createUserWithEmailAndPassword(auth, email, senha);
        if (nome) await updateProfile(cred.user, { displayName: nome });
        setUser(auth.currentUser);
      },
      entrarComGoogle: async () => {
        await signInWithPopup(auth, new GoogleAuthProvider());
      },
      recuperarSenha: async (email) => {
        await sendPasswordResetEmail(auth, email);
      },
      sair: async () => {
        await firebaseSignOut(auth);
      },
    }),
    [user, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve ser usado dentro de <AuthProvider>');
  return ctx;
}

/** Traduz códigos de erro do Firebase Auth para mensagens em português. */
export function mensagemDeErroAuth(erro: unknown): string {
  const codigo = (erro as { code?: string })?.code ?? '';
  switch (codigo) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'E-mail ou senha incorretos.';
    case 'auth/email-already-in-use':
      return 'Já existe uma conta com este e-mail.';
    case 'auth/weak-password':
      return 'A senha precisa ter pelo menos 6 caracteres.';
    case 'auth/invalid-email':
      return 'E-mail inválido.';
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return 'Login com Google cancelado.';
    case 'auth/popup-blocked':
      return 'O navegador bloqueou a janela do Google. Libere pop-ups e tente de novo.';
    case 'auth/too-many-requests':
      return 'Muitas tentativas. Aguarde alguns minutos e tente de novo.';
    case 'auth/network-request-failed':
      return 'Sem conexão com o servidor de autenticação.';
    default:
      return 'Não foi possível concluir. Tente novamente.';
  }
}
