import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Options d'un cookie telles que Supabase les fournit
type CookieOptions = {
  path?: string;
  maxAge?: number;
  domain?: string;
  secure?: boolean;
  httpOnly?: boolean;
  sameSite?: "lax" | "strict" | "none";
  expires?: Date;
};

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  // Mémorise le code d'affilié (?ref=CODE) pendant 30 jours
  const ref = request.nextUrl.searchParams.get("ref");
  if (ref) {
    response.cookies.set("aff_ref", ref.slice(0, 32), {
      maxAge: 60 * 60 * 24 * 30,
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    });
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list: { name: string; value: string }[]) => {
          list.forEach(({ name, value }) => request.cookies.set(name, value));
          const carry = response.cookies.getAll();
          response = NextResponse.next({ request });
          carry.forEach((c) => response.cookies.set(c));
          // Supabase fournit aussi "options" (durée, domaine...) : absent du type ci-dessus, on le lit via un cast.
          list.forEach((c) => {
            const options = (c as { options?: CookieOptions }).options;
            response.cookies.set(c.name, c.value, options);
          });
        },
      },
    }
  );

  const { data } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;
  const protectedArea = path.startsWith("/dashboard") || path.startsWith("/library") || path.startsWith("/admin");

  if (protectedArea && !data.user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  // Le middleware ne s'exécute pas sur : fichiers statiques, PWA (sw.js, manifest, icônes, logos), webhooks et tâche planifiée.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|icons/|api/webhook|api/cron|.*\\.(?:png|jpg|jpeg|webp|svg|ico)$).*)",
  ],
};
