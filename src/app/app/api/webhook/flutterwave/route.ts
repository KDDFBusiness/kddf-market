// Webhook Flutterwave : POST /api/webhook/flutterwave
// Dashboard Flutterwave > Settings > Webhooks : URL = cette adresse, "Secret hash" = valeur de FLW_SECRET_HASH.
// Le corps n'est jamais cru sur parole : on relit le paiement chez Flutterwave (verify_by_reference). Répond toujours 200.
import { NextResponse } from "next/server";
import { isValidFlutterwaveHash } from "@/lib/flutterwave";
import { syncFapshiTransaction } from "@/lib/fulfillment";
import { REF_PREFIX } from "@/lib/payments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OK = (): NextResponse => NextResponse.json({ received: true }, { status: 200 });

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

export async function POST(req: Request): Promise<NextResponse> {
  try {
    if (!isValidFlutterwaveHash(req.headers.get("verif-hash"))) {
      console.warn("[flutterwave-webhook] en-tête verif-hash invalide ou absent : requête ignorée");
      return OK();
    }
    const body: unknown = await req.json().catch(() => null);
    const data = isRecord(body) && isRecord(body.data) ? body.data : null;
    const txRef = data && typeof data.tx_ref === "string" ? data.tx_ref : null;
    if (!txRef) return OK();
    const result = await syncFapshiTransaction(`${REF_PREFIX.flutterwave}${txRef}`, { source: "webhook", minAgeSeconds: 2 });
    console.log("[flutterwave-webhook]", txRef, "| résultat :", result);
  } catch (e) {
    console.error("[flutterwave-webhook] erreur interne :", e instanceof Error ? e.message : e);
  }
  return OK();
}
