import { info } from "@actions/core"
import { execa, execaSync } from "execa"
import { pathExists } from "path-exists"
import { addExeExt, dirname, join } from "patha"
import which from "which"
import { addPythonBaseExecPrefix, setupPython } from "../../python/python"
import { addPath } from "../env/addEnv"
import { InstallationInfo } from "./setupBin"
import { getVersion } from "../../versions/versions"
import { ubuntuVersion } from "../env/ubuntu_version"
import memoize from "micro-memoize"
import { isArch } from "../env/isArch"
import { setupPacmanPack } from "./setupPacmanPack"
import { hasDnf } from "../env/hasDnf"
import { setupDnfPack } from "./setupDnfPack"
import { isUbuntu } from "../env/isUbuntu"
import { setupAptPack } from "./setupAptPack"
import { untildifyUser } from "untildify-user"
import { mkdirp } from "mkdirp"

export type SetupPipPackOptions = {
  /** Whether to use pipx instead of pip */
  usePipx?: boolean
  /** Whether to install the package as a user */
  user?: boolean
  /** Whether to upgrade the package */
  upgrade?: boolean
  /** Whether the package is a library */
  isLibrary?: boolean
}

/** A function that installs a package using pip */
export async function setupPipPack(
  name: string,
  version?: string,
  options: SetupPipPackOptions = {},
): Promise<InstallationInfo> {
  return setupPipPackWithPython(await getPython(), name, version, options)
}

export async function setupPipPackWithPython(
  givenPython: string,
  name: string,
  version?: string,
  options: SetupPipPackOptions = {},
): Promise<InstallationInfo> {
  const { usePipx = true, user = true, upgrade = false, isLibrary = false } = options

  const isPipx = usePipx && !isLibrary && (await hasPipx(givenPython))
  const pip = isPipx ? "pipx" : "pip"

  const hasPackage = await pipHasPackage(givenPython, name)
  if (hasPackage) {
    try {
      info(`Installing ${name} ${version ?? ""} via ${pip}`)

      const nameAndVersion = version !== undefined && version !== "" ? `${name}==${version}` : name
      const upgradeFlag = upgrade ? (isPipx ? ["upgrade"] : ["install", "--upgrade"]) : ["install"]
      const userFlag = !isPipx && user ? ["--user"] : []

      const env = process.env

      if (isPipx && user) {
        const pipxHome = await getPipxHome()
        await mkdirp(pipxHome)

        // install to user home
        env.PIPX_HOME = pipxHome

        const pipxBinDir = getPipxBinDir()
        await addPath(pipxBinDir)
        await mkdirp(pipxBinDir)

        env.PIPX_BIN_DIR = pipxBinDir
      }

      execaSync(givenPython, ["-m", pip, ...upgradeFlag, ...userFlag, nameAndVersion], {
        stdio: "inherit",
        env,
      })
    } catch (err) {
      info(`Failed to install ${name} via ${pip}: ${err}.`)
      if ((await setupPipPackSystem(name)) === null) {
        throw new Error(`Failed to install ${name} via ${pip}: ${err}.`)
      }
    }
  } else {
    if ((await setupPipPackSystem(name)) === null) {
      throw new Error(`Failed to install ${name} as it was not found via ${pip} or the system package manager`)
    }
  }

  const execPaths = await addPythonBaseExecPrefix(givenPython)
  const binDir = await findBinDir(execPaths, name)

  await addPath(binDir)

  return { binDir }
}

export async function hasPipx(givenPython: string) {
  return (await execa(givenPython, ["-m", "pipx", "--help"], { stdio: "ignore", reject: false })).exitCode === 0
}

async function getPipxHome_raw() {
  // Based on https://pipx.pypa.io/stable/installation/
  const compatHome = untildifyUser("~/.local/pipx")
  if (await pathExists(compatHome)) {
    return compatHome
  }

  switch (process.platform) {
    case "win32":
      return untildifyUser("~/AppData/Local/pipx")
    case "darwin":
      return untildifyUser("~/Library/Application Support/pipx")
    default:
      return untildifyUser("~/.local/share/pipx")
  }
}
const getPipxHome = memoize(getPipxHome_raw, { isPromise: true })

function getPipxBinDir() {
  return untildifyUser("~/.local/bin")
}

async function getPython_raw(): Promise<string> {
  const pythonBin = (await setupPython(getVersion("python", undefined, await ubuntuVersion()), "", process.arch)).bin
  if (pythonBin === undefined) {
    throw new Error("Python binary was not found")
  }
  return pythonBin
}
const getPython = memoize(getPython_raw, { isPromise: true })

async function pipHasPackage(python: string, name: string) {
  const result = await execa(python, ["-m", "pip", "-qq", "index", "versions", name], {
    stdio: "ignore",
    reject: false,
  })
  return result.exitCode === 0
}

async function findBinDir(dirs: string[], name: string) {
  const exists = await Promise.all(dirs.map((dir) => pathExists(join(dir, addExeExt(name)))))
  const dirIndex = exists.findIndex((exist) => exist)
  if (dirIndex !== -1) {
    const foundDir = dirs[dirIndex]
    return foundDir
  }

  const whichDir = which.sync(addExeExt(name), { nothrow: true })
  if (whichDir !== null) {
    return dirname(whichDir)
  }

  return dirs[dirs.length - 1]
}

export function setupPipPackSystem(name: string) {
  if (process.platform === "linux") {
    info(`Installing ${name} via the system package manager`)
    if (isArch()) {
      return setupPacmanPack(`python-${name}`)
    } else if (hasDnf()) {
      return setupDnfPack([{ name: `python3-${name}` }])
    } else if (isUbuntu()) {
      return setupAptPack([{ name: `python3-${name}` }])
    }
  }
  return null
}
