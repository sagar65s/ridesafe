type RideSafeLogoProps = {
  tone?: "light" | "dark"
  compact?: boolean
  height?: number
  className?: string
}

/** The supplied RideSafe brand asset, reused consistently across every portal. */
export default function RideSafeLogo({ compact = false, height = 34, className }: RideSafeLogoProps) {
  const width = compact ? height : Math.round(height * 2.55)
  return (
    <span
      className={className}
      role="img"
      aria-label="RideSafe"
      style={{ display:'inline-flex',width,height,overflow:'hidden',alignItems:'center',justifyContent:'center',flexShrink:0,borderRadius:8,background:'#fff',padding:compact?2:4 }}
    >
      <Image src="/ridesafe-logo-display.png" alt="" width={width} height={height} priority style={{width:'100%',height:'100%',objectFit:compact?'cover':'contain'}}/>
    </span>
  )
}
import Image from 'next/image'
