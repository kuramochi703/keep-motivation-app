export default function Logo({ width = 44 }: { width?: number }) {
  return (
    <svg
      className="logo"
      viewBox="0 0 120 120"
      width={width}
      height={width}
      role="img"
      aria-label="がんばり畑"
    >
      <circle className="logo-disk" cx="60" cy="60" r="58" />
      <path className="logo-soil" d="M16 94 Q60 87 104 94 L104 110 Q60 116 16 110 Z" />
      <path className="logo-stem" d="M60 96 C60 82 60 74 60 60" />
      <path className="logo-leaf-l" d="M60 78 C50 73 41 66 38 54 C52 52 59 64 60 78 Z" />
      <path className="logo-leaf-r" d="M60 68 C71 64 81 57 83 45 C71 44 64 56 60 68 Z" />
      <circle className="logo-sun" cx="88" cy="28" r="8" />
      <circle className="logo-sun-halo" cx="88" cy="28" r="13" />
    </svg>
  )
}