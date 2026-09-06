export default function Avatar({ lv, variant = 0 }: { lv: number; variant?: number }) {
  const v = Math.min(2, Math.max(0, variant))
  return (
    <svg
      className={`avatar av${v} lv${lv}`}
      viewBox="0 0 240 250"
      role="img"
      aria-labelledby="avatarLabel"
    >
      <title id="avatarLabel">アバターの状態</title>
      <g fill="var(--gold)" data-show="4">
        <path className="sparkle" d="M46 70l4 10 10 4-10 4-4 10-4-10-10-4 10-4z" />
        <path className="sparkle" d="M196 96l3 8 8 3-8 3-3 8-3-8-8-3 8-3z" />
        <path className="sparkle" d="M180 40l3 7 7 3-7 3-3 7-3-7-7-3 7-3z" />
      </g>
      <g data-show="0" stroke="#9CA3AA" fill="none" strokeWidth="2" strokeLinecap="round">
        <path d="M182 86q8-8 16-2M186 96q9-6 16 1" />
        <circle cx="196" cy="72" r="3" fill="#7E858B" stroke="none" />
        <path d="M192 68q-6-4-9 0M200 68q6-4 9 0" />
      </g>
      <ellipse cx="120" cy="236" rx="56" ry="8" fill="#0F141A" opacity=".08" />
      <g className="figure">
        <path data-show="4" d="M86 152l-30 74q64 11 128 0l-30-74z" fill="var(--gold)" opacity=".9" />
        <rect x="98" y="198" width="15" height="34" rx="7" fill="var(--skin)" />
        <rect x="127" y="198" width="15" height="34" rx="7" fill="var(--skin)" />
        <path data-show="4 3 2 1" d="M84 152q36-15 72 0l10 56H74z" fill="var(--cloth)" />
        <path
          data-show="0"
          d="M84 152q36-15 72 0l10 56-13-9-10 11-12-10-11 10-13-11-11 9-13-10z"
          fill="var(--cloth)"
        />
        <g data-show="1 0">
          <rect x="128" y="170" width="24" height="21" rx="3" fill="#A7ADB3" transform="rotate(8 140 180)" />
          <path d="M128 178h26M140 168v24" stroke="#7C838A" strokeWidth="1.4" transform="rotate(8 140 180)" />
        </g>
        <path d="M86 158q-16 16-14 40" stroke="var(--skin)" strokeWidth="14" strokeLinecap="round" fill="none" />
        <path d="M154 158q16 16 14 40" stroke="var(--skin)" strokeWidth="14" strokeLinecap="round" fill="none" />
        <rect x="110" y="132" width="20" height="20" fill="var(--skin)" />
        <circle cx="120" cy="104" r="38" fill="var(--skin)" />
        <path d="M82 96q6-44 38-44t38 44q-14-20-38-20t-38 20z" fill="var(--hair)" />
        <path data-show="4" d="M97 54l-3-20 12 9 8-15 8 15 12-9-3 20z" fill="var(--gold)" />
        <g data-show="4 3 2">
          <circle cx="106" cy="105" r="5" fill="var(--edge)" />
          <circle cx="134" cy="105" r="5" fill="var(--edge)" />
          <circle data-show="4" cx="108" cy="103" r="1.8" fill="#fff" />
          <circle data-show="4" cx="136" cy="103" r="1.8" fill="#fff" />
        </g>
        <g data-show="1 0" stroke="var(--edge)" strokeWidth="3" fill="none" strokeLinecap="round">
          <path d="M100 108q6-7 12 0M128 108q6-7 12 0" />
        </g>
        <path data-show="4 3" d="M109 120q11 12 22 0" stroke="var(--edge)" strokeWidth="3" fill="none" strokeLinecap="round" />
        <path data-show="2" d="M111 124h18" stroke="var(--edge)" strokeWidth="3" fill="none" strokeLinecap="round" />
        <path data-show="1 0" d="M109 128q11-10 22 0" stroke="var(--edge)" strokeWidth="3" fill="none" strokeLinecap="round" />
        <path data-show="1" d="M162 96q6 9 6 13a6 6 0 01-12 0q0-4 6-13z" fill="#5FA8D3" />
      </g>
    </svg>
  )
}
