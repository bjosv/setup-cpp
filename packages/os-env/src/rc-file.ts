import { promises } from "fs"
import { grantUserWriteAccess } from "admina"
import { info, warning } from "ci-log"
import memoize from "micro-memoize"
import { pathExists } from "path-exists"
import { untildifyUser } from "untildify-user"
const { appendFile, readFile, writeFile } = promises

async function sourceRC_raw(rcPath: string) {
  const sourceRcString =
    `\n# source .cpprc if SOURCE_CPPRC is not set to 0\nif [[ "$SOURCE_CPPRC" != 0 && -f "${rcPath}" ]]; then source "${rcPath}"; fi\n`

  try {
    await Promise.all([
      addRCHeader(rcPath),
      sourceRcInProfile(sourceRcString),
      sourceRCInBashrc(sourceRcString),
    ])
  } catch (err) {
    warning(`Failed to add ${sourceRcString} to .profile or .bashrc. You should add it manually: ${err}`)
  }
}

/**
 * handles adding conditions to source rc file from .bashrc and .profile
 */
export const sourceRC = memoize(sourceRC_raw, { isPromise: true })

async function addRCHeader(rcPath: string) {
  // a variable that prevents source_cpprc from being called from .bashrc and .profile
  const rcHeader = "# Automatically Generated by os-env\nexport SOURCE_CPPRC=0"

  if (await pathExists(rcPath)) {
    const rcContent = await readFile(rcPath, "utf8")
    if (!rcContent.includes(rcHeader)) {
      // already executed setupCppInProfile
      await appendFile(rcPath, `\n${rcHeader}\n`)
      info(`Added ${rcHeader} to ${rcPath}`)
    }
  }
}

async function sourceRCInBashrc(sourceRcString: string) {
  const bashrcPath = untildifyUser("~/.bashrc")
  if (await pathExists(bashrcPath)) {
    const bashrcContent = await readFile(bashrcPath, "utf-8")
    if (!bashrcContent.includes(sourceRcString)) {
      await appendFile(bashrcPath, sourceRcString)
      info(`${sourceRcString} was added to ${bashrcPath}`)
    }
  }
}

async function sourceRcInProfile(sourceRcString: string) {
  const profilePath = untildifyUser("~/.profile")
  if (await pathExists(profilePath)) {
    const profileContent = await readFile(profilePath, "utf-8")
    if (!profileContent.includes(sourceRcString)) {
      await appendFile(profilePath, sourceRcString)
      info(`${sourceRcString} was added to ${profilePath}`)
    }
  }
}

export async function finalizeRC(rcPath: string) {
  if (await pathExists(rcPath)) {
    const entries = (await readFile(rcPath, "utf-8")).split("\n")

    const uniqueEntries = [...new Set(entries.reverse())].reverse() // remove duplicates, keeping the latest entry

    await writeFile(rcPath, uniqueEntries.join("\n"))

    await grantUserWriteAccess(rcPath)
  }
}
