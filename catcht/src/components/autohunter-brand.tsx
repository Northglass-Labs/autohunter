import { INSTANCE_CONFIG } from "@/lib/instance-config";

export function AutoHunterMark({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" role="img" aria-label="AutoHunter">
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M7 42 20.3 6h7.4L41 42h-8l-2.45-7.1h-13.1L15 42H7Zm12.7-13.7h8.6L24 15.75 19.7 28.3Z"
        clipRule="evenodd"
      />
      <path fill="currentColor" d="M12 29.7h26.5v3.4H12z" />
      <circle cx="41.5" cy="31.4" r="3.4" fill="currentColor" />
    </svg>
  );
}

export function AutoHunterLockup({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`autohunter-lockup ${compact ? "compact" : ""}`}>
      <span className="autohunter-symbol" aria-hidden="true"><AutoHunterMark /></span>
      <span className="autohunter-wordmark">
        <strong>{INSTANCE_CONFIG.appName}</strong>
        <small>{INSTANCE_CONFIG.endorsement}</small>
      </span>
    </span>
  );
}
