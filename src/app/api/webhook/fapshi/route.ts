// Webhook Fapshi : POST /api/webhook/fapshi
// À configurer dans le dashboard Fapshi (URL du webhook + secret facultatif, renvoyé dans l'en-tête x-wh-secret).
//
// Ce endpoint est volontairement GÉNÉRIQUE :
//   1) il écrit dans les logs Vercel TOUT le corps reçu (pour voir le format réel) ;
//   2) il cherche l'identifiant de transaction et le statut sans dépendre d'une structure précise ;
//   3) il répond TOUJOURS 200, même si le format n'est pas reconnu (Fapshi ne renvoie pas en boucle).
//
// Le statut annoncé par le webhook n'est PAS cru sur parole : syncFapshiTransaction() relit le statut chez Fapshi
//   - SUCCESSFUL (ou SUCCESS / PAID) -> commande payée, solde "en attente" du vendeur (et de l'affilié) crédité,
//                                       transaction mise à jour (transId, montant, statut), emails envoyés
//   - FAILED / EXPIRED               -> commande marquée "failed" (ou "expired")
// Le même endpoint reçoit aussi les paiements de BOOST de produit (même traitement).
import { NextResponse } from "next/server";
import { isValidWebhookSecret } from "@/lib/fapshi";
import { syncFapshiTransaction } from "@/lib/fulfillment";
import { createAdminClient } from "@/lib/supabase/admin";
import { asRow } from "@/lib/db";
import { isUuid } from "@/lib/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OK = (): NextResponse => NextResponse.json({ received: true }, { status: 200 });

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/** Cherche un champ par son nom (majuscules ignorées), à la racine puis un niveau plus bas (data, transaction...). */
function pick(body: unknown, names: string[]): string | null {
  if (!isRecord(body)) return null;
  const wanted = names.map((n) => n.toLowerCase());
  const scan = (obj: Record<string, unknown>): string | null => {
    for (const [key, value] of Object.entries(obj)) {
      if (wanted.includes(key.toLowerCase()) && (typeof value === "string" || typeof value === "number")) {
        return String(value);
      }
    }
    return null;
  };
  const top = scan(body);
  if (top) return top;
  for (const value of Object.values(body)) {
    if (isRecord(value)) {
      const nested = scan(value);
      if (nested) return nested;
    }
  }
  return null;
}

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const raw = await req.text();

    // 1) Journal demandé : le corps COMPLET, tel que reçu, pour voir le vrai format de Fapshi.
    console.log("[fapshi-webhook] body reçu :", raw);
    // Noms des en-têtes seulement (jamais leurs valeurs : x-wh-secret est un secret).
    console.log("[fapshi-webhook] en-têtes présents :", Array.from(req.headers.keys()).join(", "));

    if (!isValidWebhookSecret(req.headers.get("x-wh-secret"))) {
      console.warn("[fapshi-webhook] secret x-wh-secret invalide ou absent : requête ignorée");
      return OK();
    }

    // 2) Lecture souple du corps : JSON, sinon formulaire (a=b&c=d)
    let body: unknown = null;
    try {
      body = JSON.parse(raw);
    } catch {
      const params = new URLSearchParams(raw);
      if (Array.from(params.keys()).length > 0) body = Object.fromEntries(params.entries());
    }

    const status = (pick(body, ["status", "state", "transStatus"]) ?? "").toUpperCase();
    let transId = pick(body, ["transId", "trans_id", "transactionId", "transaction_id"]);

    // Sans transId, on retrouve la transaction grâce à notre identifiant de commande (externalId)
    if (!transId) {
      const externalId = pick(body, ["externalId", "external_id"]);
      if (isUuid(externalId)) {
        const { data } = await createAdminClient()
          .from("transactions")
          .select("fapshi_trans_id")
          .eq("order_id", externalId)
          .maybeSingle();
        transId = asRow<{ fapshi_trans_id: string | null }>(data)?.fapshi_trans_id ?? null;
        if (!transId) {
          // Ce n'est pas une commande : essai avec un boost de produit
          const { data: boost } = await createAdminClient().from("product_boosts").select("fapshi_trans_id").eq("id", externalId).maybeSingle();
          transId = asRow<{ fapshi_trans_id: string | null }>(boost)?.fapshi_trans_id ?? null;
        }
      }
    }

    if (!transId) {
      console.warn("[fapshi-webhook] format non reconnu (aucun transId) : rien à faire. Statut lu :", status || "(aucun)");
      return OK();
    }

    // 3) Vérification chez Fapshi puis action (paid / failed / expired)
    const result = await syncFapshiTransaction(transId, { source: "webhook", minAgeSeconds: 2 });
    console.log("[fapshi-webhook] transId", transId, "| statut annoncé :", status || "(aucun)", "| résultat :", result);
  } catch (e) {
    // Même en cas d'erreur interne on répond 200 : le rattrapage (page de retour + tâche planifiée) validera le paiement.
    console.error("[fapshi-webhook] erreur interne :", e instanceof Error ? e.message : e);
  }
  return OK();
}
