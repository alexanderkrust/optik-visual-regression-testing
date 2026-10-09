// Runs in the browser (Vitest browser mode). Screenshots are taken here and
// handed to the `optikSubmit` command, which uploads them from Node.
import { commands, page } from "vitest/browser"
import type { Locator } from "vitest/browser"
import type { SnapshotResult } from "./submit.js"

declare module "vitest/browser" {
  interface BrowserCommands {
    optikSubmit: (
      name: string,
      base64: string,
      options?: { trim?: boolean },
    ) => Promise<SnapshotResult>
  }
}

declare module "vitest" {
  interface Matchers<
    R extends void | Promise<void> = void | Promise<void>,
    T = unknown,
  > {
    toMatchVisualSnapshot(snapshotName: string): Promise<void>
  }
}

type Screenshottable = typeof page | Locator | Element

async function capture(target?: Screenshottable): Promise<string> {
  if (!target || target === page) {
    return page.screenshot({ save: false })
  }
  return page.screenshot({ save: false, element: target as Locator | Element })
}

function toBase64(bytes: Uint8Array): string {
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

/** A snapshot fails while it differs from the last approved baseline. */
function changeMessage(name: string, result: SnapshotResult) {
  return (
    `Visual snapshot "${name}" differs from the approved baseline ` +
    `(${((result.diffScore ?? 0) * 100).toFixed(2)}% of pixels changed).\n` +
    `Review it: ${result.reviewUrl}`
  )
}

// ------------------------------------------------------------------ expect matcher

/**
 * Vitest `expect` matcher. Accepts:
 *  - `Uint8Array`              — PNG bytes you already have
 *  - `page`, a Locator or Element — the matcher takes the screenshot itself
 *
 * @example
 * await expect(page).toMatchVisualSnapshot('home/full')
 * await expect(page.getByRole('button')).toMatchVisualSnapshot('Button/default')
 */
export const toMatchSnapshot = {
  async toMatchVisualSnapshot(
    this: unknown,
    received: Uint8Array | Screenshottable,
    snapshotName: string,
  ): Promise<{ pass: boolean; message: () => string }> {
    try {
      const base64 =
        received instanceof Uint8Array
          ? toBase64(received)
          : await capture(received)
      const result = await commands.optikSubmit(snapshotName, base64)

      if (result.failTest) {
        return { pass: false, message: () => changeMessage(snapshotName, result) }
      }

      return {
        pass: true,
        message: () => `Visual snapshot "${snapshotName}" matches baseline`,
      }
    } catch (err) {
      return { pass: false, message: () => (err as Error).message }
    }
  },
}

// ------------------------------------------------------------------ helper function

/**
 * What a component test rendered: the single visible element in <body>
 * (e.g. the container of @testing-library's `render`), or <body> when there
 * are several. Falls back to the full page if nothing visible was rendered.
 */
function renderedContent(): Element | undefined {
  const visible = (el: Element) => {
    const rect = el.getBoundingClientRect()
    return rect.width > 0 && rect.height > 0
  }
  const children = [...document.body.children].filter(
    (el) => !["SCRIPT", "STYLE", "TEMPLATE", "LINK"].includes(el.tagName) && visible(el),
  )
  if (children.length === 1) return children[0]
  if (children.length > 1 && visible(document.body)) return document.body
  return undefined
}

/**
 * Takes a screenshot and submits it to Optik. By default it captures the
 * rendered component (see `renderedContent`) instead of the whole viewport and
 * crops empty space on the right and bottom; pass `element` to capture
 * something specific (not cropped).
 *
 * @example
 * import { optikSnapshot } from '@optik/vitest/browser'
 * await optikSnapshot('Button/primary')
 * await optikSnapshot('Card/header', page.getByRole('heading'))
 */
export async function optikSnapshot(
  name: string,
  element?: Locator | Element,
): Promise<void> {
  const target = element ?? renderedContent()
  const result = await commands.optikSubmit(name, await capture(target), {
    trim: !element,
  })

  if (result.failTest) {
    throw new Error(changeMessage(name, result))
  }
}
