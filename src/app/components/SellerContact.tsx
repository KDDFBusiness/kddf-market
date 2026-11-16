import { getSellerContact } from "@/lib/contact";

// Boutons de contact du vendeur (WhatsApp / Appeler / Email).
// À n'afficher QU'APRÈS paiement d'un produit PHYSIQUE : l'appelant a déjà vérifié la commande payée.
export default async function SellerContact({ sellerId, productTitle, title = "Contacter le vendeur" }: { sellerId: string; productTitle: string; title?: string }) {
  const c = await getSellerContact(sellerId);
  if (!c.whatsapp && !c.phone && !c.email) return null;
  const message = `Bonjour, j'ai acheté ${productTitle} sur KDDF Market, pour la livraison`;
  return (
    <div className="glass space-y-3 p-5">
      <p className="label !mb-0">{title}</p>
      <div className="flex flex-wrap gap-2">
        {c.whatsapp && (
          <a className="btn-jade !px-4 !py-2" target="_blank" rel="noopener noreferrer" href={`https://wa.me/${c.whatsapp}?text=${encodeURIComponent(message)}`}>
            WhatsApp
          </a>
        )}
        {c.phone && <a className="btn-ghost !px-4 !py-2" href={`tel:${c.phone}`}>Appeler</a>}
        {c.email && <a className="btn-ghost !px-4 !py-2" href={`mailto:${c.email}?subject=${encodeURIComponent(`Commande : ${productTitle}`)}`}>Email</a>}
      </div>
    </div>
  );
}
