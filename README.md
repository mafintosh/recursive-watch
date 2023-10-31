# recursive-watch

Minimal recursive file watcher.

Uses the native recursive `fs.watch` option on macOS/Windows and basic recursive dir watching on Linux

```
npm install recursive-watch
```

## Usage

``` js
const RecursiveWatch = require('recursive-watch')

const watcher = new RecursiveWatch('./a-file-or-directory', function (filename) {
  console.log('something changed with', filename)
})
```

## API

#### `const watcher = new RecursiveWatch(path, onchange)`

Watch a directory or filename. Calls the `onchange` function if the path changed in anyway.

#### `await watcher.ready()`

Waits until it's fully watching the path.

#### `await watcher.close()`

Stops watching the path.

## License

MIT
