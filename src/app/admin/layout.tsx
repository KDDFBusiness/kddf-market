import { notFound } from "next/navigation";
import Link from "next/link";
import { getMyProfile, getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

const LINKS: [string, string][] = [
  ["/admin", "Tableau de bord"],
  ["/admin/sellers", "Vendeurs"],
  ["/admin/orders", "Commandes"],
  ["/admin/withdrawals", "Retraits"],
  ["/admin/products", "Produits à valider"],
  ["/admin/support", "Messages"],
];

// Toutes les pages /admin n'existent que pour l'administrateur (les autres reçoivent une 404).
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) notFound();
  const profile = await getMyProfile(user.id);
  if (profile?.role !== "admin") notFound();
  return (
    <div className="space-y-6">
      <nav aria-label="Administration" className="no-scrollbar flex gap-2 overflow-x-auto">
        {LINKS.map(([href, label]) => <Link key={href} href={href} className="btn-ghost shrink-0 !px-4 !py-2">{label}</Link>)}
      </nav>
      {children}
    </div>
  );
}
