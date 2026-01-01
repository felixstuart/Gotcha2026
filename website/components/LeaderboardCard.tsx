export function LeaderboardCard({
  position,
  name,
  tags,
}: {
  position: number;
  name: string;
  tags: number;
}) {
  const positionColor =
    position === 1
      ? "bg-amber-400"
      : position === 2
        ? "bg-slate-400"
        : position === 3
          ? "bg-amber-700"
          : "bg-slate-500";

  return (
    <div className="flex align-center space-x-4 items-center p-4 rounded-xl bg-slate-600">
      <div
        className={`rounded-full ${positionColor} p-4 flex w-4 h-4 items-center justify-center text-center`}
      >
        <h2>{position}</h2>
      </div>
      <h1 className="font-bold text-left flex-1">{name}</h1>
      <h2 className="text-right">{tags}</h2>
    </div>
  );
}
