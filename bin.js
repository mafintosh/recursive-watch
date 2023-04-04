#!/usr/bin/env node

const Watch = require('./')

if (!process.argv[2]) {
  console.error('Usage: recursive-watch [path]')
  process.exit(1)
}

const watcher = new Watch(process.argv[2], function (filename) {
  console.log(filename, 'has changed')
})

watcher.ready().then(() => {
  console.log('Watcher ready')
})
