var os = require('os')
var fs = require('fs')
var path = require('path')

var isLinux = os.platform() === 'linux' // native recursive watching not supported here
var watchDirectory = isLinux ? watchFallback : watchRecursive

module.exports = watch

function watch (name, onchange) {
  var clear = null
  var stopped = false

  fs.lstat(name, function (_, st) {
    if (!st || stopped) return
    clear = st.isDirectory() ? watchDirectory(name, onchange) : watchFile(name, onchange)
  })

  return function () {
    if (stopped) return
    stopped = true
    clear()
  }
}

function watchFile (filename, onchange) {
  var prev = null
  var prevTime = 0

  var w = fs.watch(filename, function () {
    fs.lstat(filename, function (_, st) {
      var now = Date.now()
      if (now - prevTime > 2000 || !same(st, prev)) onchange(filename)
      prevTime = now
      prev = st
    })
  })

  return function () {
    w.close()
  }
}

function watchRecursive (directory, onchange) {
  var w = fs.watch(directory, {recursive: true}, function (change, filename) {
    onchange(path.join(directory, filename))
  })

  return function () {
    w.close()
  }
}

function watchFallback (directory, onchange) {
  var watching = {}
  var loaded = false
  var queued = []
  var prev = {name: null, stat: null, time: 0}

  visit('.', function () {
    loaded = true
  })

  return function () {
    Object.keys(watching).forEach(function (dir) {
      watching[dir].close()
    })
  }

  function emit (name) {
    queued.push(name)
    if (queued.length === 1) update()
  }

  function update () {
    var filename = queued[0]

    fs.lstat(filename, function (err, st) {
      var w = watching[filename]

      if (err && w) {
        w.close()
        delete watching[filename]
      }

      var now = Date.now()

      if (prev.name !== filename || !same(st, prev.stat) || now - prev.time > 2000) onchange(filename)

      prev.time = now
      prev.name = filename
      prev.stat = st

      visit(path.relative(directory, filename), function () {
        queued.shift()
        if (queued.length) update()
      })
    })
  }

  function visit (next, cb) {
    var dir = path.join(directory, next)

    fs.lstat(dir, function (err, st) {
      if (err || !st.isDirectory()) return cb()
      if (watching[dir]) return cb()
      if (loaded) emit(dir)

      var w = fs.watch(dir, function (change, filename) {
        filename = path.join(next, filename)
        emit(path.join(directory, filename))
      })

      w.on('error', noop)
      watching[dir] = w

      fs.readdir(dir, function (err, list) {
        if (err) return cb(err)

        loop()

        function loop () {
          if (!list.length) return cb()
          visit(path.join(next, list.shift()), loop)
        }
      })
    })
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
    a.size === b.size &&
    a.blocks === b.blocks &&
    a.atime.getTime() === b.atime.getTime() &&
    a.mtime.getTime() === b.mtime.getTime() &&
    a.ctime.getTime() === b.ctime.getTime()
}
