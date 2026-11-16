import ThemeToggle from "@/components/ThemeToggle";
import SupportLink from "@/components/SupportLink";

// Appliqué à toutes les pages (sans toucher à layout.tsx) : applique le thème choisi avant l'affichage
// puis ajoute le bouton de choix du thème.
const APPLY_THEME = `(function(){try{var t=localStorage.getItem("kddf-theme")||"dark";var d=t==="system"?(matchMedia("(prefers-color-scheme: light)").matches?"light":"dark"):t;document.documentElement.setAttribute("data-theme",d)}catch(e){}})();`;

export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: APPLY_THEME }} />
      {children}
      <ThemeToggle />
      <SupportLink />
    </>
  );
}
