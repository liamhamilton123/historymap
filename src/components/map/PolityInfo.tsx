import { POLITY_STATUS, DEFAULT_STATUS, type PolityStatus } from '~/lib/mapStyle';
import { OPEN_ENDED } from '~/lib/time';

/**
 * The properties the info panel reads off a clicked feature. They are exactly
 * the fields data/scripts/build-polities.mjs writes — nothing is joined or
 * looked up, so a feature on the map is self-describing.
 */
export type PolitySelection = {
  polity: string;
  name: string;
  color: string;
  status: string;
  from: number;
  to: number;
  fromDate: string;
  toDate: string | null;
  label: string | null;
  source: string | null;
};

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** `YYYY[-MM[-DD]]` as prose, at whatever precision the data gives. */
function formatDate(iso: string): string {
  const [year, month, day] = iso.split('-');
  if (!month) return year!;
  const name = MONTHS[Number(month) - 1] ?? month;
  return day ? `${Number(day)} ${name} ${year}` : `${name} ${year}`;
}

/** Whole years between two instants, floored — "lasted 68 years". */
function duration(from: number, to: number): string {
  const years = Math.floor(to - from);
  if (years < 1) return 'under a year';
  return `${years} year${years === 1 ? '' : 's'}`;
}

type PolityInfoProps = {
  selection: PolitySelection;
  onClose: () => void;
};

/**
 * Names whatever the reader clicked, and says over what span it held that
 * ground. Positioned clear of the close button above it, the controls on the
 * right and the timeline below, so nothing it shows covers a control.
 */
export default function PolityInfo({ selection, onClose }: PolityInfoProps) {
  const status =
    POLITY_STATUS[selection.status as PolityStatus] ?? POLITY_STATUS[DEFAULT_STATUS];
  const ongoing = selection.to >= OPEN_ENDED;
  const ended = selection.toDate ? formatDate(selection.toDate) : 'present';

  return (
    <aside
      className="absolute top-16 left-4 z-[5] w-[min(19rem,calc(100vw-2rem))] max-h-[calc(100dvh-16rem)] overflow-y-auto rounded-xl border border-ink/12 bg-panel/72 p-4 shadow-panel backdrop-blur-[10px] backdrop-saturate-[140%]"
      aria-label={`About ${selection.name}`}
    >
      <div className="flex items-start gap-2.5">
        <span
          className="mt-1 size-3 shrink-0 rounded-[3px] border border-ink/20"
          style={{ backgroundColor: selection.color }}
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <h2 className="font-serif text-[19px] leading-tight text-ink">{selection.name}</h2>
          {/* Only worth showing when the map calls this ground something else. */}
          {selection.label && selection.label !== selection.name && (
            <p className="mt-0.5 text-[11px] text-ink-faint">shown as {selection.label}</p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="-mt-1 -mr-1 grid size-7 shrink-0 cursor-pointer place-items-center rounded-lg text-ink-faint transition-colors hover:bg-ink/8 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          aria-label="Close panel"
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
            <path d="m3 3 10 10M13 3 3 13" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <dl className="mt-3 space-y-2 border-t border-ink/12 pt-3 text-[12px]">
        <div>
          <dt className="text-[10px] font-medium tracking-[0.14em] text-ink-faint uppercase">Span</dt>
          <dd className="mt-0.5 text-ink-dim tabular-nums">
            {formatDate(selection.fromDate)} — {ended}
            <span className="text-ink-faint">
              {' · '}
              {ongoing ? 'ongoing' : duration(selection.from, selection.to)}
            </span>
          </dd>
        </div>
        <div>
          <dt className="text-[10px] font-medium tracking-[0.14em] text-ink-faint uppercase">Status</dt>
          <dd className="mt-0.5 text-ink-dim">{status.title}</dd>
        </div>
        {selection.source && (
          <div>
            <dt className="text-[10px] font-medium tracking-[0.14em] text-ink-faint uppercase">Note</dt>
            <dd className="mt-0.5 leading-relaxed text-ink-dim">{selection.source}</dd>
          </div>
        )}
      </dl>
    </aside>
  );
}
