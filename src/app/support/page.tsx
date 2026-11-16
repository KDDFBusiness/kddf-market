import SupportForm from "@/components/SupportForm";
import { getMyProfile, getSessionUser } from "@/lib/auth";
import { cleanText } from "@/lib/validate";

export const dynamic = "force-dynamic";
export const metadata = { title: "Aide & contact" };

export default async function SupportPage({ searchParams }: { searchParams: { ref?: string } }) {
  const user = await getSessionUser();
  const profile = user ? await getMyProfile(user.id) : null;
  const wa = (process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP ?? "").replace(/[^0-9]/g, "");
  const mail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "";
  // Référence d'erreur affichée par la page « Oups » : pré-remplie pour aider à retrouver le problème
  const ref = cleanText(searchParams.ref, 40).replace(/[^A-Za-z0-9_-]/g, "");

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="space-y-2">
        <h1 className="font-display text-3xl font-bold text-white">Aide &amp; contact</h1>
        <p className="text-sm text-zinc-400">Un problème sur le site ? Décrivez-le ci-dessous, avec des captures d&apos;écran si possible : nous le réglons au plus vite.</p>
      </div>

      {(wa || mail) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {wa && <a href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer" className="btn-jade">💬 WhatsApp</a>}
          {mail && <a href={`mailto:${mail}`} className="btn-ghost">✉️ {mail}</a>}
        </div>
      )}

      <SupportForm
        defaultName={profile?.full_name ?? ""}
        defaultEmail={user?.email ?? ""}
        defaultMessage={ref ? `(Référence de l'erreur : ${ref})\n\n` : ""}
      />
    </div>
  );
}
