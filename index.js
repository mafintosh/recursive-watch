const fs = require('fs')
const path = require('path')
const Xache = require('xache')
const safetyCatch = require('safety-catch')

// + generic reusable watch maker
// + global watchers map

// Native recursive watching is not supported on Linux based platforms
const isLinux = process.platform === 'linux' || process.platform === 'android'
const watchDirectory = isLinux ? watchFallback : watchRecursive

module.exports = class Watch {
  constructor (filename, onchange) {
    this.filename = filename
    this.onchange = onchange

    this.unwatch = null

    this._opening = this._ready()
    this._closing = null

    this._opening.catch(safetyCatch)
  }

  ready () {
    return this._opening
  }

  async _ready () {
    // + temp
    let st = null
    try { // eslint-disable-line no-useless-catch
      st = await fs.promises.lstat(this.filename)
    } catch (error) {
      // + auto-destroy on error
      // if (!this.closed) throw error
      // if (this.closed) return
      throw error
    }
    if (!st || this.closed) return // +

    const watch = st.isDirectory() ? watchDirectory : watchFile
    this.unwatch = watch(this.filename, this.onchange)

    this.opened = true
  }

  async close () {
    if (this._closing) return this._closing
    this._closing = this._close()
    return this._closing
  }

  async _close () {
    if (this.closed) return
    this.closed = true

    if (!this.opened) await this._opening.catch(safetyCatch)

    if (this.unwatch) {
      await this.unwatch()
      this.unwatch = null
    }
  }
}

function watchRecursive (directory, onchange) {
  let closed = false
  let close = null
  const closing = new Promise(resolve => { close = resolve })

  const watcher = fs.watch(directory, { recursive: true }, function (change, filename) {
    if (!filename) return // Filename not always given by fs.watch

    onchange(path.join(directory, filename))
  })

  watcher.on('error', noop)
  watcher.on('close', () => close())

  return function () {
    if (closed) return closing
    closed = true

    watcher.close()

    return closing
  }
}

function watchFile (filename, onchange) {
  let prev = null
  let prevTime = 0
  let actives = 0

  let closed = false
  let close = null
  const closing = new Promise(resolve => { close = resolve })

  actives++

  const watcher = fs.watch(filename, function () {
    actives++

    fs.lstat(filename, function (_, st) {
      actives--

      if (closed) {
        oncleanup()
        return // + should still report the last pending changes?
      }

      const now = Date.now()
      if (now - prevTime > 2000 || !same(st, prev)) onchange(filename)
      prevTime = now
      prev = st
    })
  })

  watcher.on('error', noop)
  watcher.on('close', () => {
    actives--
    oncleanup()
  })

  return function unwatch () {
    if (closed) return closing
    closed = true

    watcher.close()
    oncleanup()

    return closing
  }

  function oncleanup () {
    if (closed && actives === 0) close()
  }
}

function watchFallback (directory, onchange) {
  let loaded = false
  const queued = []
  const prevs = new Xache({ maxSize: 30, maxAge: 2000 }) // + why 30?

  const watchers = new Map()
  let actives = 0

  let closed = false
  let close = null
  const closing = new Promise(resolve => { close = resolve })

  visit('.', function () {
    loaded = true
  })

  return function () {
    if (closed) return closing
    closed = true

    for (const [, watcher] of watchers) {
      watcher.close()
    }

    return closing
  }

  function emit (name) {
    queued.push(name)
    if (queued.length === 1) update()
  }

  function update () {
    const filename = queued[0]

    if (closed) {
      /* const watcher = watchers.get(filename)

      if (watcher) {
        watcher.close()
        watchers.delete(filename)
      }

      queued.shift()
      if (queued.length) update() */

      return
    }

    actives++

    fs.lstat(filename, function (err, st) {
      actives--

      if (closed) {
        /* queued.shift()
        if (queued.length) update() */

        oncleanup()
        return
      }

      const watcher = watchers.get(filename)

      if (err && watcher) {
        watcher.close()
        watchers.delete(filename)
      }

      /* if (closed) {
        queued.shift()
        if (queued.length) update()
        return
      } */

      const prevSt = prevs.get(filename)
      if (!prevSt || !same(st, prevSt)) onchange(filename)
      prevs.put(filename, st)

      visit(path.relative(directory, filename), function () {
        queued.shift()
        if (queued.length) update()
      })
    })
  }

  function visit (next, cb) {
    const dir = path.join(directory, next)

    actives++

    fs.lstat(dir, function (err, st) {
      actives--
      oncleanup()

      if (err || !st.isDirectory()) return cb()
      if (closed) return cb()
      if (watchers.get(dir)) return cb()
      if (loaded) emit(dir)

      const watcher = fs.watch(dir, function (change, filename) {
        filename = path.join(next, filename)
        emit(path.join(directory, filename))
      })

      watcher.on('error', noop)
      watcher.on('close', () => {
        watchers.delete(dir)
        oncleanup()
      })

      watchers.set(dir, watcher)

      actives++

      fs.readdir(dir, function (err, list) {
        actives--
        oncleanup()

        if (err) return cb(err)

        loop()

        function loop () {
          if (!list.length) return cb()
          if (closed) return cb()
          visit(path.join(next, list.shift()), loop)
        }
      })
    })
  }

  function oncleanup () {
    if (closed && actives === 0) close()
  }
}

function noop () {}

function same (a, b) {
  if (!a || !b) return false

  return a.dev === b.dev &&
    a.mode === b.mode &&
    a.nlink === b.nlink &&
    a.uid === b.uid &&
    a.gid === b.gid &&
    a.rdev === b.rdev &&
    a.blksize === b.blksize &&
    a.ino === b.ino &&
    // a.size === b.size && DONT TEST - is a lying value
    // a.blocks === b.blocks && DONT TEST - is a lying value
    a.atime.getTime() === b.atime.getTime() &&
    a.mtime.getTime() === b.mtime.getTime() &&
    a.ctime.getTime() === b.ctime.getTime()
}
