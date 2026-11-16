export const metadata = { title: "Hors connexion" };

export default function OfflinePage() {
  return (
    <div className="glass mx-auto mt-16 max-w-md space-y-3 p-8 text-center">
      <p className="text-4xl">📡</p>
      <h1 className="font-display text-2xl font-bold text-white">Vous êtes hors connexion</h1>
      <p className="text-sm text-zinc-400">Reconnectez-vous à Internet pour parcourir le catalogue et payer en toute sécurité.</p>
    </div>
  );
}
