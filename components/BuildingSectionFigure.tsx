type Props = { compact?: boolean; active?: "building" | "unit" | "memory" };

/** A restrained, code-native diagram of the verified 18-storey demo building. */
export function BuildingSectionFigure({ compact = false, active = "building" }: Props) {
  const floors = Array.from({ length: 18 }, (_, index) => 18 - index);
  return <svg className={`building-section-figure ${compact ? "compact" : ""}`} viewBox="0 0 420 620" role="img" aria-label="筑生样板楼A座18层建筑身体地图，16层1602卫生间被定位">
    <defs>
      <linearGradient id="building-face" x1="0" x2="1" y1="0" y2="1"><stop stopColor="#f8f6f0" /><stop offset="1" stopColor="#deded8" /></linearGradient>
      <linearGradient id="building-core" x1="0" x2="0" y1="0" y2="1"><stop stopColor="#24272a" /><stop offset="1" stopColor="#101113" /></linearGradient>
    </defs>
    <rect x="93" y="34" width="228" height="538" rx="2" fill="url(#building-face)" stroke="#202224" strokeWidth="2" />
    <rect x="241" y="55" width="45" height="496" fill="url(#building-core)" />
    {floors.map((floor) => {
      const y = 55 + (18 - floor) * 27.55;
      const selected = floor === 16;
      return <g key={floor}>
        <line x1="94" x2="320" y1={y} y2={y} stroke="#aeb0ac" strokeWidth="1" />
        <rect x="112" y={y + 7} width="22" height="12" fill={selected ? "#d42121" : "#6a8f90"} opacity={selected ? 1 : .72} />
        <rect x="161" y={y + 7} width="22" height="12" fill={selected ? "#d42121" : "#6a8f90"} opacity={selected ? 1 : .72} />
        <rect x="194" y={y + 7} width="22" height="12" fill={selected ? "#d42121" : "#6a8f90"} opacity={selected ? 1 : .72} />
        {selected ? <><rect x="99" y={y + 2} width="218" height="23" fill="none" stroke="#d42121" strokeWidth="2" /><text x="332" y={y + 18} fill="#d42121" fontSize="13" fontWeight="700">16F · 1602</text></> : null}
      </g>;
    })}
    <path d="M263 72v462" stroke={active === "memory" ? "#d42121" : "#448c91"} strokeWidth="5" strokeLinecap="round" />
    <circle cx="263" cy="115" r="7" fill="#d42121" />
    <line x1="62" x2="352" y1="572" y2="572" stroke="#202224" strokeWidth="4" />
    <text x="96" y="604" fill="#676b6d" fontSize="12">筑生样板楼A座 · 18层 · 126个空间</text>
  </svg>;
}
