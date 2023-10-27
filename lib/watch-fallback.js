const fs = require('fs')
const path = require('path')
const Xache = require('xache')
const Watch = require('./watch.js')
const same = require('./same.js')

module.exports = function watchFallback (directory, onchange) {
  let loaded = false
  const queued = []
  const prevs = new Xache({ maxSize: 30, maxAge: 2000 })

  const watchers = new Map()
  let actives = 0

  let closed = false
  let close = null
  const closing = new Promise(resolve => { close = resolve })

  visit('.', function () {
    loaded = true
  })

  return async function unwatch () {
    if (closed) return closing
    closed = true

    for (const [, watcher] of watchers) {
      await watcher.close()
    }

    return closing
  }

  function emit (name) {
    queued.push(name)
    if (queued.length === 1) update()
  }

  function update () {
    if (closed) return

    const filename = queued[0]

    actives++

    fs.lstat(filename, function (err, st) {
      actives--

      if (closed) {
        oncleanup()
        return
      }

      const watcher = watchers.get(filename)

      if (err && watcher) {
        watcher.close()
        watchers.delete(filename)
      }

      const prevSt = prevs.get(filename)
      if (!prevSt || !same(st, prevSt)) onchange(filename)
      prevs.set(filename, st)

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

      const watcher = new Watch(dir, null, function (change, filename) {
        filename = path.join(next, filename)
        emit(path.join(directory, filename))
      })

      watcher.watcher.on('close', () => {
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
