import { OptikClient } from "@optik/core"

/** Client for the token and server set by optikConfig() (env vars reach workers too). */
export function client(): OptikClient {
  return new OptikClient({ token: process.env._OPTIK_TOKEN ?? "" })
}
