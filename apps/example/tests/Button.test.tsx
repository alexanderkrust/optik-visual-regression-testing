import { test } from "vitest"
import { render } from "@testing-library/react"
import { optikSnapshot } from "@optik/vitest/browser"
import { Button } from "../src/components/Button"

test("Button — primary", async () => {
  render(<Button variant="primary">Click me</Button>)
  await optikSnapshot("Button/primary")
})

test("Button — secondary", async () => {
  render(<Button variant="secondary">Click me</Button>)
  await optikSnapshot("Button/secondary")
})

test("Button — destructive", async () => {
  render(<Button variant="destructive">Delete</Button>)
  await optikSnapshot("Button/destructive")
})

test("Button — sizes", async () => {
  render(
    <div style={{ display: "flex", gap: 8, alignItems: "center", padding: 16 }}>
      <Button size="sm">Small</Button>
      <Button size="md">Medium</Button>
      <Button size="lg">Large</Button>
    </div>,
  )
  await optikSnapshot("Button/sizes")
})
