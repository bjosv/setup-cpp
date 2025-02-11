import type { Opts } from "../cli-options.js"
import type { Inputs } from "../tool.js"
import { DefaultUbuntuVersion, DefaultVersions } from "./default_versions.js"

/** Get the default version if passed true or undefined, otherwise return the version itself */
export function getVersion(name: string, version: string | undefined, osVersion: number[] | null = null) {
  if (isVersionDefault(version) && process.platform === "linux" && osVersion !== null && name in DefaultUbuntuVersion) {
    return getDefaultLinuxVersion(osVersion, DefaultUbuntuVersion[name]!)
  } else if (isVersionDefault(version) && name in DefaultVersions) {
    return DefaultVersions[name] ?? ""
  } else if (version === "true") {
    return ""
  }
  return version ?? ""
}

function isVersionDefault(version: string | undefined) {
  return version === "true" || version === undefined
}

/// choose the default linux version based on ubuntu version
function getDefaultLinuxVersion(osVersion: number[], toolLinuxVersions: Record<number, string>) {
  const osVersionMaj = osVersion[0]

  // find which version block the os version is in
  const satisfyingVersion = Object.keys(toolLinuxVersions)
    .map((v) => Number.parseInt(v, 10))
    .sort((a, b) => b - a) // sort in descending order
    .find((v) => osVersionMaj >= v)

  return satisfyingVersion === undefined ? "" : toolLinuxVersions[satisfyingVersion]
}

/**
 * Sync the versions for the given inputs
 *
 * If the return is false, it means that versions don't match the target version
 */
export function syncVersions(opts: Opts, tools: Inputs[]): boolean {
  const toolsInUse = tools.filter((tool) => opts[tool] !== undefined)
  const toolsNonDefaultVersion = toolsInUse.filter((tool) => !isVersionDefault(opts[tool]))

  const targetVersion = toolsNonDefaultVersion.length >= 1 ? opts[toolsNonDefaultVersion[0]] : "true"

  if (toolsNonDefaultVersion.some((tool) => opts[tool] !== targetVersion)) {
    // error if any explicit versions don't match the target version
    return false
  }

  for (const tool of toolsInUse) {
    opts[tool] = targetVersion
  }

  return true
}
