#!/usr/bin/env node

const RecursiveWatch = require('./')

if (!process.argv[2]) {
  console.error('Usage: recursive-watch [path]')
  process.exit(1)
}

const watcher = new RecursiveWatch(process.argv[2], function (filename) {
  console.log(filename, 'has changed')
})

watcher.ready().then(() => {
  console.log('Watcher ready')
})
