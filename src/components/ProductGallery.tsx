"use client";
import { useState } from "react";

// Grande photo + miniatures cliquables (produits physiques : 1 à 5 photos).
export default function ProductGallery({ images, title }: { images: string[]; title: string }) {
  const [index, setIndex] = useState(0);
  if (images.length === 0) {
    return <div className="aspect-[4/3] w-full rounded-2xl bg-gradient-to-br from-volt/30 via-ink-800 to-jade/20" />;
  }
  return (
    <div className="space-y-3">
      <div className="glass aspect-[4/3] overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={images[index]} alt={`${title} — photo ${index + 1}`} className="h-full w-full object-cover" />
      </div>
      {images.length > 1 && (
        <div className="no-scrollbar flex gap-2 overflow-x-auto">
          {images.map((src, i) => (
            <button
              key={src}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`Voir la photo ${i + 1}`}
              className={`h-16 w-16 shrink-0 overflow-hidden rounded-xl border-2 transition ${i === index ? "border-volt" : "border-white/10 opacity-70 hover:opacity-100"}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
