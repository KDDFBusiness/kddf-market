"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { submitProductReview } from "@/components/productReviewsActions";

const MAX_BYTES = 5 * 1024 * 1024;

export default function ProductReviewForm({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState("");
  const [ok, setOk] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setMessage("");
    if (rating === 0) {
      setMessage("Choisissez une note de 1 à 5 étoiles.");
      return;
    }
    setLoading(true);
    try {
      let photoUrl: string | null = null;
      if (file) {
        if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > MAX_BYTES) {
          setMessage("Photo refusée : choisissez une image JPG, PNG ou WebP de 5 Mo maximum.");
          setLoading(false);
          return;
        }
        const supabase = createClient();
        const { data: auth } = await supabase.auth.getUser();
        if (!auth.user) throw new Error("not-logged");
        const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
        const path = `${auth.user.id}/reviews/${crypto.randomUUID()}.${ext}`;
        const up = await supabase.storage.from("covers").upload(path, file, { contentType: file.type });
        if (up.error) throw new Error(up.error.message);
        photoUrl = supabase.storage.from("covers").getPublicUrl(path).data.publicUrl;
      }
      const res = await submitProductReview({ orderId, rating, comment, photoUrl });
      setOk(res.ok);
      setMessage(res.message);
      if (res.ok) router.refresh();
    } catch (err) {
      setOk(false);
      setMessage(err instanceof Error && err.message === "not-logged" ? "Vous n'êtes pas connecté.\nConnectez-vous puis réessayez." : "L'envoi de la photo a échoué.\nVérifiez votre connexion, ou publiez l'avis sans photo.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="glass space-y-3 p-5">
      <p className="label !mb-0">Laisser un avis</p>
      <div className="flex gap-1" role="radiogroup" aria-label="Note de 1 à 5 étoiles">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={rating === n}
            aria-label={`${n} étoile${n > 1 ? "s" : ""}`}
            onClick={() => setRating(n)}
            className={`text-3xl leading-none transition ${n <= rating ? "text-amber-400" : "text-zinc-600 hover:text-amber-300"}`}
          >
            ★
          </button>
        ))}
      </div>
      <textarea rows={3} maxLength={1000} className="input" placeholder="Votre commentaire" value={comment} onChange={(e) => setComment(e.target.value)} />
      <div>
        <label className="label" htmlFor="rv-photo">Photo du produit reçu (facultatif)</label>
        <input id="rv-photo" type="file" accept="image/jpeg,image/png,image/webp" className="input" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </div>
      <button className="btn-primary" disabled={loading || rating === 0}>{loading ? "Patientez…" : "Publier mon avis"}</button>
      {message && <p role="status" className={`whitespace-pre-line text-xs ${ok ? "text-jade-soft" : "text-red-300"}`}>{message}</p>}
    </form>
  );
}
