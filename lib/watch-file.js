const fs = require('fs')
const Watch = require('./watch.js')
const same = require('./same.js')

module.exports = function watchFile (filename, onchange) {
  let prev = null
  let prevTime = 0
  let actives = 0

  let closed = false
  let close = null
  const closing = new Promise(resolve => { close = resolve })

  const watcher = new Watch(filename, null, function () {
    actives++

    fs.lstat(filename, function (_, st) {
      actives--

      if (closed) {
        oncleanup()
        return
      }

      const now = Date.now()
      if (now - prevTime > 2000 || !same(st, prev)) onchange(filename)
      prevTime = now
      prev = st
    })
  })

  return async function unwatch () {
    if (closed) return closing
    closed = true

    await watcher.close()
    oncleanup()

    return closing
  }

  function oncleanup () {
    if (actives === 0) close()
  }
}
