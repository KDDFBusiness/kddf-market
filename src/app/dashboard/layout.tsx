import Link from "next/link";

const links = [
  ["/dashboard", "Vue d'ensemble"],
  ["/dashboard/products", "Catalogue"],
  ["/dashboard/affiliates", "Affiliation"],
  ["/dashboard/settings", "Boutique"],
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <nav className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0" aria-label="Espace créateur">
        {links.map(([href, label]) => (
          <Link key={href} href={href} className="btn-ghost shrink-0 !px-4 !py-2">{label}</Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
