const fs = require('fs')
const ReadyResource = require('ready-resource')
const safetyCatch = require('safety-catch')
const watchFile = require('./lib/watch-file.js')
const watchFallback = require('./lib/watch-fallback.js')
const watchRecursive = require('./lib/watch-recursive.js')

// Native recursive watching is not supported on Linux based platforms
const isLinux = process.platform === 'linux' || process.platform === 'android'
const watchDirectory = isLinux ? watchFallback : watchRecursive

module.exports = class RecursiveWatch extends ReadyResource {
  constructor (filename, onchange) {
    super()

    this.filename = filename
    this._onchange = onchange

    this._unwatch = null

    this.ready().catch(safetyCatch)
  }

  async _open () {
    let st = null

    try {
      st = await fs.promises.lstat(this.filename)
    } catch (err) {
      if (err.code === 'ENOENT') return
      throw err
    }

    const watch = st.isDirectory() ? watchDirectory : watchFile
    this._unwatch = watch(this.filename, this._onchange)
  }

  async _close () {
    if (this._unwatch) {
      await this._unwatch()
      this._unwatch = null
    }
  }

  get watching () {
    return !!this._unwatch
  }
}
