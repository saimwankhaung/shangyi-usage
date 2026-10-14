const path = require('node:path');
require('../app/setup-vscode.cjs').install(path.resolve(process.argv[2]))
  .then(result => console.log(JSON.stringify(result)))
  .catch(error => { console.error(error.message); process.exitCode = 1; });
