import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

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
          list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    }
  );

  const { data } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;
  const protectedArea = path.startsWith("/dashboard") || path.startsWith("/library");

  if (protectedArea && !data.user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/webhooks).*)"],
};
