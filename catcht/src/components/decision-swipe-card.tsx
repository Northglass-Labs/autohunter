"use client";

import { setDispositionAction } from "@/app/actions";
import { swipeDecision } from "@/lib/queue-controls";
import { useRouter } from "next/navigation";
import {
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useRef,
  useState,
} from "react";

type ListingView = "finds" | "pending" | "interested" | "ignored";

interface Gesture {
  pointerId: number;
  startX: number;
  startY: number;
}

export function DecisionSwipeCard({
  listingId,
  view,
  children,
}: {
  listingId: string;
  view: ListingView;
  children: ReactNode;
}) {
  const router = useRouter();
  const surface = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const [dragging, setDragging] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const enabled = view === "finds" || view === "pending";

  function setOffset(value: number) {
    surface.current?.style.setProperty("--swipe-offset", `${value}px`);
  }

  function start(event: ReactPointerEvent<HTMLDivElement>) {
    if (!enabled || committing || !event.isPrimary || event.button !== 0) return;
    const target = event.target as Element;
    if (target.closest("a, button, input, select, textarea, summary, details, form")) return;
    gesture.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY };
    setDragging(true);
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic test events and older touch browsers may not expose pointer capture.
    }
  }

  function move(event: ReactPointerEvent<HTMLDivElement>) {
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId || committing) return;
    const deltaX = event.clientX - current.startX;
    const deltaY = event.clientY - current.startY;
    if (Math.abs(deltaY) > Math.abs(deltaX) * 1.15) {
      setOffset(0);
      return;
    }
    if (Math.abs(deltaX) > 5) event.preventDefault();
    setOffset(Math.max(-140, Math.min(140, deltaX)));
  }

  function finish(event: ReactPointerEvent<HTMLDivElement>) {
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId || committing) return;
    gesture.current = null;
    setDragging(false);
    const decision = swipeDecision({
      view,
      deltaX: event.clientX - current.startX,
      deltaY: event.clientY - current.startY,
      cardWidth: event.currentTarget.getBoundingClientRect().width,
    });
    if (!decision) {
      setOffset(0);
      return;
    }

    setCommitting(true);
    setOffset(decision === "interested" ? event.currentTarget.clientWidth + 40 : -(event.currentTarget.clientWidth + 40));
    setAnnouncement(decision === "interested" ? "Marked Interested" : "Marked Pass");
    void setDispositionAction(listingId, decision)
      .then(() => router.refresh())
      .catch(() => {
        setAnnouncement("Decision was not saved. Try the button instead.");
        setCommitting(false);
        setOffset(0);
      });
  }

  function cancel() {
    gesture.current = null;
    setDragging(false);
    if (!committing) setOffset(0);
  }

  return (
    <div
      ref={surface}
      className="decision-swipe"
      data-dragging={dragging || undefined}
      data-committing={committing || undefined}
      onPointerDown={start}
      onPointerMove={move}
      onPointerUp={finish}
      onPointerCancel={cancel}
      aria-label={enabled ? "Swipe right for Interested or left for Pass" : undefined}
    >
      {enabled ? (
        <div className="swipe-underlay" aria-hidden="true">
          <span className="interested">Interested</span>
          <span className="passed">Pass</span>
        </div>
      ) : null}
      <div className="swipe-card-content">{children}</div>
      <span className="sr-only" aria-live="polite">{announcement}</span>
    </div>
  );
}
