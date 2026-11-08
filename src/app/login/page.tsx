"use client";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [mode, setMode] = useState<"login" | "signup">(params.get("mode") === "signup" ? "signup" : "login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMsg("");
    const supabase = createClient();
    if (mode === "signup") {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName },
          emailRedirectTo: `${window.location.origin}/dashboard`,
        },
      });
      if (error) setMsg(error.message);
      else if (!data.session) setMsg("Compte créé. Vérifiez votre email pour confirmer votre inscription.");
      else { router.push("/dashboard"); router.refresh(); }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setMsg("Identifiants incorrects.");
      else { router.push(params.get("next") || "/dashboard"); router.refresh(); }
    }
    setLoading(false);
  }

  return (
    <form onSubmit={submit} className="glass mx-auto mt-12 max-w-md space-y-4 p-6 sm:p-8">
      <h1 className="font-display text-2xl font-bold text-white">{mode === "signup" ? "Créer mon compte" : "Connexion"}</h1>
      {mode === "signup" && (
        <div>
          <label className="label" htmlFor="fn">Nom complet</label>
          <input id="fn" className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
        </div>
      )}
      <div>
        <label className="label" htmlFor="em">Email</label>
        <input id="em" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </div>
      <div>
        <label className="label" htmlFor="pw">Mot de passe</label>
        <input id="pw" type="password" minLength={8} className="input" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </div>
      {msg && <p role="status" className="rounded-xl bg-white/5 px-4 py-2.5 text-sm text-zinc-300">{msg}</p>}
      <button className="btn-primary w-full" disabled={loading}>{loading ? "…" : mode === "signup" ? "S'inscrire" : "Se connecter"}</button>
      <button type="button" className="w-full text-center text-xs text-zinc-400 hover:text-white" onClick={() => setMode(mode === "signup" ? "login" : "signup")}>
        {mode === "signup" ? "J'ai déjà un compte" : "Pas encore de compte ? Créer une boutique"}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return <Suspense><LoginForm /></Suspense>;
}
