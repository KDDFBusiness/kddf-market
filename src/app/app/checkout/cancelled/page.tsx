import Link from "next/link";

export default function Cancelled() {
  return (
    <div className="glass mx-auto mt-16 max-w-md space-y-4 p-8 text-center">
      <h1 className="font-display text-2xl font-bold text-white">Paiement annulé</h1>
      <p className="text-sm text-zinc-400">Aucun montant n'a été débité. Vous pouvez reprendre votre achat à tout moment.</p>
      <Link href="/" className="btn-primary">Retour au catalogue</Link>
    </div>
  );
}
