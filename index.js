var os = require('os')
var fs = require('fs')
var path = require('path')
var Cache = require('ttl')

var isLinux = os.platform() === 'linux' // native recursive watching not supported here
var watchDirectory = isLinux ? watchFallback : watchRecursive

module.exports = watch

function watch (name, onchange) {
  console.log('watch', name)

  var clear = null
  var stopped = false
  var destroy = null

  const destroying = new Promise(resolve => {
    destroy = resolve
  })

  fs.lstat(name, function (_, st) {
    console.log('watch -> fs.lstat', name, { stopped })

    if (!st || stopped) {
      stopped = true
      destroy()
      return
    }

    const unwatch = st.isDirectory() ? watchDirectory(name, onchange) : watchFile(name, onchange)

    clear = function () {
      unwatch()
      destroy()
    }
  })

  return function () {
    if (stopped) return destroying
    stopped = true

    if (clear) clear()

    return destroying
  }
}

function watchFile (filename, onchange) {
  var prev = null
  var prevTime = 0
  var actives = 0
  var cleanup = false
  var destroy = null

  const destroying = new Promise(resolve => {
    destroy = resolve
  })

  console.log('watchFile', filename)

  var w = fs.watch(filename, function () {
    console.log('watchFile fs.watch onchange', filename, { cleanup })

    actives++

    fs.lstat(filename, function (_, st) {
      console.log('watchFile fs.watch -> fs.lstat', filename, { cleanup })

      if (--actives === 0 && cleanup) {
        destroy()
        return
      }

      var now = Date.now()
      if (now - prevTime > 2000 || !same(st, prev)) onchange(filename)
      prevTime = now
      prev = st
    })
  })

  return function () {
    console.log('watchFile cleanup')

    if (cleanup) return destroying
    cleanup = true

    w.close()

    if (actives === 0) destroy()

    return destroying
  }
}

function watchRecursive (directory, onchange) {
  console.log('watchRecursive', directory)

  var cleanup = false

  var w = fs.watch(directory, {recursive: true}, function (change, filename) {
    console.log('watchRecursive fs.watch', { cleanup })
    if (!filename) return // filename not always given (https://nodejs.org/api/fs.html#fs_filename_argument)
    onchange(path.join(directory, filename))
  })

  return function () {
    cleanup = true
    w.close()
  }
}

function watchFallback (directory, onchange) {
  var watching = {}
  var loaded = false
  var queued = []
  var prevs = new Cache({ttl: 2e3, capacity: 30})
  var cleanup = false

  visit('.', function () {
    loaded = true
  })

  return function () {
    cleanup = true

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

    if (cleanup) {
      const w = watching[filename]

      if (w) {
        w.close()
        delete watching[filename]
      }

      queued.shift()
      if (queued.length) update()

      return
    }

    fs.lstat(filename, function (err, st) {
      var w = watching[filename]

      if ((err || cleanup) && w) {
        w.close()
        delete watching[filename]
      }

      if (cleanup) {
        queued.shift()
        if (queued.length) update()
        return
      }

      var prevSt = prevs.get(filename)
      if (!prevSt || !same(st, prevSt)) onchange(filename)
      prevs.put(filename, st)

      visit(path.relative(directory, filename), function () {
        queued.shift()
        if (queued.length) update()
      })
    })
  }

  function visit (next, cb) {
    var dir = path.join(directory, next)

    console.log('visit fs.lstat', { cleanup })

    fs.lstat(dir, function (err, st) {
      if (err || !st.isDirectory()) return cb()
      if (cleanup) return cb()
      if (watching[dir]) return cb()
      if (loaded) emit(dir)

      console.log('visit fs.lstat fs.watch', { cleanup })

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
          if (cleanup) return cb()
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
    // a.size === b.size && DONT TEST - is a lying value
    // a.blocks === b.blocks && DONT TEST - is a lying value
    a.atime.getTime() === b.atime.getTime() &&
    a.mtime.getTime() === b.mtime.getTime() &&
    a.ctime.getTime() === b.ctime.getTime()
}
