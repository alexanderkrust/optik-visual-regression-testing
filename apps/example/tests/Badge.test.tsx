import { test } from "vitest"
import { render } from "@testing-library/react"
import { optikSnapshot } from "@optik/vitest/browser"
import { Badge } from "../src/components/Badge"

test("Badge — all variants", async () => {
  render(
    <div style={{ display: "flex", gap: 8, padding: 16 }}>
      <Badge>Default</Badge>
      <Badge variant="success">Success</Badge>
      <Badge variant="warning">Warning</Badge>
      <Badge variant="danger">Danger</Badge>
    </div>,
  )
  await optikSnapshot("Badge/all-variants")
})
