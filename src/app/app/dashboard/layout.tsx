import Link from "next/link";
import InactivityAlerts from "@/components/InactivityAlerts";

const links: [string, string][] = [
  ["/dashboard", "Vue d'ensemble"],
  ["/dashboard/products", "Catalogue"],
  ["/dashboard/orders", "Commandes"],
  ["/dashboard/promote", "Promouvoir"],
  ["/dashboard/wallet", "Mes gains"],
  ["/dashboard/affiliates", "Affiliation"],
  ["/dashboard/shop", "Ma boutique"],
  ["/dashboard/settings", "Mon profil"],
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <nav className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0" aria-label="Espace créateur">
        {links.map(([href, label]) => (
          <Link key={href} href={href} className="btn-ghost shrink-0 !px-4 !py-2">{label}</Link>
        ))}
      </nav>
      <InactivityAlerts />
      {children}
    </div>
  );
}
