const fs = require('fs')
const path = require('path')
const commander = require('commander')
const { doStuff, logger } = require('./runCoverage')
const { toJson, toLcov } = require('./serialize')

const STATUS_CODE = {
  ERROR: 111,
  OK: 0
}

function parseFileName (filePath) {
  return path.resolve(process.cwd(), filePath)
}

function parseTokenList (tokenString) {
  return tokenString.split(',').map(token => token.trim().toLowerCase())
}

commander
  // .usage('[options]')
  .description(`Generate coverage info for a CSS file against an HTML file.

This supports loading sourcemaps by using the sourceMappingURL=FILENAME.map CSS comment.

Use the LOG_LEVEL environment variable for more verbose logging. Values: error,warn,info,debug,trace .`)
  .option('--html [path/to/file.html]', 'path to a local HTML file', parseFileName) // TODO: Support multiple
  .option('--css [path/to/file.css]', 'path to a local CSS file', parseFileName)
  .option('--lcov [path/to/output.lcov]', 'the LCOV output file', parseFileName)
  .option('--json [path/to/coverage.json]', 'the coverage.json file', parseFileName)
  .option('--ignore-source-map', 'disable loading the sourcemap if one is found')
  .option('--ignore-declarations [move-to,content]', 'A comma-separated list of declarations to ignore', parseTokenList)
  .parse(process.argv)

// Validate args
if (!commander.html && !commander.css) {
  commander.help()
}
if (commander.html) {
  if (!fs.statSync(commander.html).isFile()) {
    console.error('ERROR: Invalid argument. HTML file not found at ' + commander.html)
    process.exit(STATUS_CODE.ERROR)
  }
} else {
  console.error('ERROR: Missing argument. At least 1 HTML file must be specified')
  process.exit(STATUS_CODE.ERROR)
}
if (commander.css) {
  if (!fs.statSync(commander.css).isFile()) {
    console.error('ERROR: Invalid argument. CSS file not found at ' + commander.css)
    process.exit(STATUS_CODE.ERROR)
  }
} else {
  console.error('ERROR: Missing argument. A CSS file must be specified')
  process.exit(STATUS_CODE.ERROR)
}

doStuff(commander.css, commander.html, commander.ignoreDeclarations, commander.ignoreSourceMap)
  .then(({ coverage, sourceMapPath }) => {
    if (commander.lcov) {
      const str = toLcov(coverage, sourceMapPath, commander.lcov)
      fs.writeFileSync(commander.lcov, str)
    }
    if (commander.json) {
      const str = toJson(coverage, sourceMapPath, commander.json)
      fs.writeFileSync(commander.json, str)
    }

    logger.debug('Done writing LCOV string')
  }, err => {
    logger.fatal(err)
    process.exit(STATUS_CODE.ERROR)
  })
