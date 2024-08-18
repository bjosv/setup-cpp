import { tmpdir } from "os"
import { addPath } from "envosman"
import { execaSync } from "execa"
import { DownloaderHelper } from "node-downloader-helper"
import { dirname } from "patha"
import which from "which"
import { rcOptions } from "../cli-options.js"

/* eslint-disable require-atomic-updates */
let binDir: string | undefined

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function setupBrew(_version: string, _setupDir: string, _arch: string) {
  // brew is only available on darwin and linux
  if (!["darwin", "linux"].includes(process.platform)) {
    return undefined
  }

  // check if the function has already been called
  if (typeof binDir === "string") {
    return { binDir }
  }

  // check if brew is already installed
  const maybeBinDir = await which("brew", { nothrow: true })
  if (maybeBinDir !== null) {
    binDir = dirname(maybeBinDir)
    return { binDir }
  }

  // download the installation script
  const dl = new DownloaderHelper("https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh", tmpdir(), {
    fileName: "install-brew.sh",
  })
  dl.on("error", (err) => {
    throw new Error(`Failed to download the brew installer script: ${err}`)
  })
  await dl.start()

  // brew installation is not thread-safe
  execaSync("/bin/bash", [dl.getDownloadPath()], {
    stdio: "inherit",
    env: {
      NONINTERACTIVE: "1",
    },
  })

  // add the bin directory to the PATH
  binDir = getBrewPath()
  await addPath(binDir, rcOptions)

  return { binDir }
}

/**
 * Get the path where brew is installed
 * @returns {string} The path where brew is installed
 *
 * Based on the installation script from https://brew.sh
 */
export function getBrewPath() {
  if (process.platform === "darwin") {
    if (process.arch === "arm64") {
      return "/opt/homebrew/bin/"
    } else {
      return "/usr/local/bin/"
    }
  }

  if (process.platform === "linux") {
    return "/home/linuxbrew/.linuxbrew/bin/"
  }

  throw new Error("Unsupported platform for brew")
}
