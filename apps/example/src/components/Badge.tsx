type Variant = "default" | "success" | "warning" | "danger"

interface BadgeProps {
  variant?: Variant
  children: React.ReactNode
}

const styles: Record<Variant, React.CSSProperties> = {
  default: { background: "#e2e8f0", color: "#475569" },
  success: { background: "#dcfce7", color: "#166534" },
  warning: { background: "#fef9c3", color: "#854d0e" },
  danger: { background: "#fee2e2", color: "#991b1b" },
}

export function Badge({ variant = "default", children }: BadgeProps) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "2px 8px",
        borderRadius: "999px",
        fontSize: "12px",
        fontWeight: 500,
        ...styles[variant],
      }}
    >
      {children}
    </span>
  )
}
