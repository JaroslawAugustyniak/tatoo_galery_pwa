export default function ProgressBar({ percent, label, indeterminate }: { percent: number; label?: string; indeterminate?: boolean }) {
  return (
    <div>
      {label && <div className="mb-1 flex justify-between text-sm text-neutral-300"><span>{label}</span>{!indeterminate && <span>{Math.round(percent)}%</span>}</div>}
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={indeterminate ? undefined : Math.round(percent)}
        className="h-2 overflow-hidden rounded-full bg-neutral-800"
      >
        <div
          className={`h-full rounded-full bg-white transition-[width] duration-200 ${indeterminate ? "w-full animate-pulse" : ""}`}
          style={indeterminate ? undefined : { width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
