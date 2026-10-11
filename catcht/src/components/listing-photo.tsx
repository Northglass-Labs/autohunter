"use client";

import { useState } from "react";

// A dealer photo that fails to load falls back to the same placeholder as a listing without one.
export function ListingPhoto({ src, alt, mark, label }: { src: string; alt: string; mark: string; label: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div className="image-placeholder">
        <span aria-hidden="true">{mark}</span>
        {label}
      </div>
    );
  }
  return (
    // Dynamic dealer hosts cannot be safely enumerated for Next's image proxy.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} loading="lazy" referrerPolicy="no-referrer" draggable={false} onError={() => setFailed(true)} />
  );
}
