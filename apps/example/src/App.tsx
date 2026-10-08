import { Button } from "./components/Button"
import { Badge } from "./components/Badge"
import { Card } from "./components/Card"

export default function App() {
  return (
    <div style={{ maxWidth: 800, margin: "0 auto", padding: "48px 24px" }}>
      <header style={{ marginBottom: 48 }}>
        <h1 style={{ fontSize: 32, fontWeight: 700, marginBottom: 8 }}>
          Optik Example App
        </h1>
        <p style={{ color: "#64748b" }}>
          A playground for visual regression testing.
        </p>
      </header>

      <section style={{ marginBottom: 48 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>
          Buttons
        </h2>
        <div
          style={{
            display: "flex",
            gap: 12,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <Button variant="primary">Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="destructive">Destructive</Button>
          <Button variant="primary" size="sm">
            Small
          </Button>
          <Button variant="primary" size="lg">
            Large
          </Button>
          <Button variant="primary" disabled>
            Disabled
          </Button>
        </div>
      </section>

      <section style={{ marginBottom: 48 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>
          Badges
        </h2>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Badge>Default</Badge>
          <Badge variant="success">Success</Badge>
          <Badge variant="warning">Warning</Badge>
          <Badge variant="danger">Danger</Badge>
        </div>
      </section>

      <section>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>
          Cards
        </h2>
        <div
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}
        >
          <Card title="Deployment" description="Last deployed 2 minutes ago.">
            <div style={{ display: "flex", gap: 8 }}>
              <Badge variant="success">Live</Badge>
              <Badge>v1.4.2</Badge>
            </div>
          </Card>
          <Card title="Build" description="CI pipeline completed.">
            <div style={{ display: "flex", gap: 8 }}>
              <Badge variant="success">Passed</Badge>
              <Badge>42 tests</Badge>
            </div>
          </Card>
        </div>
      </section>
    </div>
  )
}
