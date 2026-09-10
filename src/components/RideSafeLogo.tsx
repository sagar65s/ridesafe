type RideSafeLogoProps = {
  tone?: "light" | "dark"
  compact?: boolean
  height?: number
  className?: string
}

/** A single, scalable brand mark used everywhere in the app. */
export default function RideSafeLogo({ compact = false, height = 34, className, tone = "light" }: RideSafeLogoProps) {

  const width = compact ? height : Math.round(height * 4.1)
  return (
    <svg
      className={className}
      role="img"
      aria-label="RideSafe"
      width={width}
      height={height}
      viewBox={compact ? '0 0 48 48' : '0 0 198 48'}
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'block', flexShrink: 0 }}
    >
      <g fill="none" stroke="#FFD60A" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 28h38v8H5z" fill="#FFD60A" stroke="#FFD60A" />
        <path d="M10 28l4-11h21l7 11" />
        <path d="M17 17v11M28 17v11M36 20v8" />
        <circle cx="14" cy="37" r="4" fill="#08080A" />
        <circle cx="35" cy="37" r="4" fill="#08080A" />
      </g>
      {!compact && (
        <text x="57" y="33" fill={tone === "dark" ? "#142c47" : "#FFFFFF"} fontFamily="Sora, Arial, sans-serif" fontSize="25" fontWeight="800" letterSpacing="-1">Ride<tspan fill="#FFD60A">Safe</tspan>
        </text>
      )}
    </svg>
  )
}


