interface CardProps {
  title: string
  description?: string
  children?: React.ReactNode
}

export function Card({ title, description, children }: CardProps) {
  return (
    <div
      style={{
        background: '#fff',
        border: '1px solid #e2e8f0',
        borderRadius: '12px',
        padding: '24px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
      }}
    >
      <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: description ? '4px' : '16px' }}>
        {title}
      </h3>
      {description && (
        <p style={{ fontSize: '14px', color: '#64748b', marginBottom: '16px' }}>{description}</p>
      )}
      {children}
    </div>
  )
}
