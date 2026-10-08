import { expect } from "vitest"
import { toMatchSnapshot } from "./matcher.js"

expect.extend(toMatchSnapshot)
