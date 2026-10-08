import type { ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'secondary' | 'destructive'
type Size = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  children?: React.ReactNode
}

const styles: Record<Variant, React.CSSProperties> = {
  primary: { background: '#6366f1', color: '#fff', border: 'none' },
  secondary: { background: '#f1f5f9', color: '#334155', border: '1px solid #e2e8f0' },
  destructive: { background: '#ef4444', color: '#fff', border: 'none' },
}

const sizes: Record<Size, React.CSSProperties> = {
  sm: { padding: '4px 12px', fontSize: '12px' },
  md: { padding: '8px 16px', fontSize: '14px' },
  lg: { padding: '12px 24px', fontSize: '16px' },
}

export function Button({ variant = 'primary', size = 'md', style, children, ...rest }: ButtonProps) {
  return (
    <button
      style={{
        borderRadius: '6px',
        fontWeight: 500,
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        ...styles[variant],
        ...sizes[size],
        ...style,
      }}
      {...rest}
    >
      {children}
    </button>
  )
}
