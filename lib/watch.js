const fs = require('fs')
const ReadyResource = require('ready-resource')
const safetyCatch = require('safety-catch')

module.exports = class Watch extends ReadyResource {
  constructor (filename, opts, onchange) {
    super()

    this.filename = filename
    this._opts = opts || {}
    this._onchange = onchange

    this.watcher = null
    this._watcherClosed = false

    this.ready().catch(safetyCatch)
  }

  _open () {
    this.watcher = fs.watch(this.filename, this._opts, this._onchange)

    this.watcher.on('error', safetyCatch)
    this.watcher.on('close', () => {
      this._watcherClosed = true
    })
  }

  async _close () {
    let onclose = null

    if (!this._watcherClosed) {
      onclose = new Promise(resolve => this.watcher.once('close', resolve))
    }

    this.watcher.close()
    await onclose

    this.watcher = null
  }
}
