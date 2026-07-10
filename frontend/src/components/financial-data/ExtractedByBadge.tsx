const EXTRACTED_BY_BADGES: Record<string, { label: string; className: string }> = {
  manual_override: {
    label: "Manually Overridden",
    className: "bg-amber-50 text-amber-700",
  },
  manual_entry: {
    label: "Manually Added",
    className: "bg-purple-50 text-purple-700",
  },
};

export function ExtractedByBadge({ extractedBy }: { extractedBy: string }) {
  const badge = EXTRACTED_BY_BADGES[extractedBy];
  if (!badge) return null;
  return (
    <span className={`ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${badge.className}`}>
      {badge.label}
    </span>
  );
}
