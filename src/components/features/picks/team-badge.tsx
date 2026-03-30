export function TeamBadge({ shortName }: { shortName: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="font-medium">{shortName}</span>
    </div>
  )
}
