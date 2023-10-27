const path = require('path')
const Watch = require('./watch.js')

module.exports = function watchRecursive (directory, onchange) {
  const watcher = new Watch(directory, { recursive: true }, function (change, filename) {
    if (!filename) return // Filename not always given by fs.watch

    onchange(path.join(directory, filename))
  })

  return function unwatch () {
    return watcher.close()
  }
}
