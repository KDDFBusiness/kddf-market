// Badge « Garantie KDDF » : affiché sur la page produit et sur la page commande.
export default function GuaranteeBadge() {
  return (
    <p className="rounded-xl border border-jade/30 bg-jade/10 px-4 py-3 text-xs text-jade-soft">
      🛡️ <span className="font-semibold">Garantie KDDF</span> - 7 jours pour changer d&apos;avis. Si produit non conforme, remboursement.
    </p>
  );
}
