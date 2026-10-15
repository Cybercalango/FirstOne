import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { Gem, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { lovable } from '@/integrations/lovable/index';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const REDIRECT_KEY = 'flor-da-pele-auth-redirect';

function safeRedirectPath(value: string | undefined) {
  if (value && value.startsWith('/') && !value.startsWith('//')) return value;
  return '/admin';
}

export const Route = createFileRoute('/auth')({
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: typeof search['redirect'] === 'string' ? search['redirect'] : undefined,
  }),
  head: () => ({
    meta: [
      { title: 'Entrar | Flor da Pele' },
      { name: 'description', content: 'Acesso à área de edição do catálogo Flor da Pele.' },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { redirect } = Route.useSearch();
  const navigate = useNavigate();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmSent, setConfirmSent] = useState(false);

  useEffect(() => {
    sessionStorage.setItem(REDIRECT_KEY, safeRedirectPath(redirect));
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        navigate({ to: safeRedirectPath(sessionStorage.getItem(REDIRECT_KEY) ?? redirect), replace: true });
      }
    });
  }, [navigate, redirect]);

  async function handleEmailSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: safeRedirectPath(sessionStorage.getItem(REDIRECT_KEY) ?? undefined), replace: true });
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        setConfirmSent(true);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível entrar. Tente novamente.');
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogle() {
    setBusy(true);
    sessionStorage.setItem(REDIRECT_KEY, safeRedirectPath(redirect));
    const result = await lovable.auth.signInWithOAuth('google', {
      redirect_uri: `${window.location.origin}/auth`,
    });
    if (result.error) {
      setBusy(false);
      toast.error('Não foi possível entrar com o Google. Tente novamente.');
    }
    // result.redirected: o navegador sai da página; nada mais a fazer.
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="items-center text-center">
          <Gem className="text-primary" size={28} />
          <CardTitle>Flor da Pele — Área de edição</CardTitle>
          <CardDescription>Entre para gerenciar as joias do catálogo.</CardDescription>
        </CardHeader>
        <CardContent>
          {confirmSent ? (
            <div className="space-y-4 text-center">
              <p className="text-sm text-muted-foreground">
                Enviamos um link de confirmação para <strong>{email}</strong>. Abra o e-mail e confirme
                para concluir o cadastro. A primeira conta criada vira administradora do catálogo.
              </p>
              <Button variant="outline" className="w-full" onClick={() => { setConfirmSent(false); setMode('signin'); }}>
                Voltar para o login
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <Button type="button" variant="outline" className="w-full" onClick={handleGoogle} disabled={busy}>
                Continuar com Google
              </Button>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="h-px flex-1 bg-border" /> ou com e-mail <span className="h-px flex-1 bg-border" />
              </div>
              <form onSubmit={handleEmailSubmit} className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="email">E-mail</Label>
                  <Input id="email" type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="password">Senha</Label>
                  <Input id="password" type="password" required minLength={6} autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} value={password} onChange={e => setPassword(e.target.value)} />
                </div>
                <Button type="submit" className="w-full" disabled={busy}>
                  {busy && <Loader2 className="animate-spin" />}
                  {mode === 'signin' ? 'Entrar' : 'Criar conta'}
                </Button>
              </form>
              <Button variant="link" className="w-full" onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}>
                {mode === 'signin' ? 'Ainda não tenho conta' : 'Já tenho conta'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
