const fs = require('fs')
const path = require('path')
const puppeteer = require('puppeteer')
const commander = require('commander')
const SourceMapConsumer = require('source-map').SourceMapConsumer
const cssTree = require('css-tree')
require('dotenv').config()

const bunyan = require('bunyan')
const BunyanFormat = require('bunyan-format')

const log = bunyan.createLogger({
  name: 'css-coverage',
  level: process.env.LOG_LEVEL || 'info',
  stream: new BunyanFormat({ outputMode: process.env.LOG_FORMAT || 'short' })
})

function parseFileName (filePath) {
  return path.resolve(process.cwd(), filePath)
}

function parseTokenList (tokenString) {
  return tokenString.split(',').map(token => token.trim().toLowerCase())
}

const STATUS_CODE = {
  ERROR: 111,
  OK: 0
}

commander
  // .usage('[options]')
  .description('Generate coverage info for a CSS file against an HTML file. This supports loading sourcemaps by using the sourceMappingURL=FILENAME.map CSS comment')
  .option('--html [path/to/file.html]', 'path to a local HTML file', parseFileName) // TODO: Support multiple
  .option('--css [path/to/file.css]', 'path to a local CSS file', parseFileName)
  .option('--lcov [path/to/output.lcov]', 'the LCOV output file', parseFileName)
  .option('--verbose', 'verbose/debugging output')
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

const CSS_STR = fs.readFileSync(commander.css, 'utf8')
let ast
try {
  ast = cssTree.parse(CSS_STR, { filename: commander.css, positions: true })
} catch (e) {
  // CssSyntaxError
  console.error('CssSyntaxError: ' + e.message + ' @ ' + e.line + ':' + e.column)
  throw e
}

const cssRules = []
const cssDeclarations = {} // so it is serializable to the browser

cssTree.walkRules(ast, (rule) => {
  if (rule.type === 'Atrule') {
    // ignore
  } else if (rule.type === 'Rule') {
    const converted = rule.prelude.children.map((selector) => {
      rule.block.children.each(declaration => {
        if (commander.ignoreDeclarations && commander.ignoreDeclarations.indexOf(declaration.property.toLowerCase()) >= 0) {
          return // skip because it is ignored
        }
        // Append to a list of locations
        const key = cssTree.translate(declaration)
        let locs = cssDeclarations[key]
        locs = locs || []
        locs.push(declaration.loc)
        cssDeclarations[key] = locs
      })
      return cssTree.translate(selector)
    })
    cssRules.push(converted)
  } else {
    throw new Error('BUG: Forgot to handle this rule subtype: ' + rule.type)
  }
})

async function initializeSourceMapConsumer () {
  // Check if there is a sourceMappingURL
  let sourceMapPath
  if (!commander.ignoreSourceMap && /sourceMappingURL=([^ ]*)/.exec(CSS_STR)) {
    sourceMapPath = /sourceMappingURL=([^ ]*)/.exec(CSS_STR)[1]
    sourceMapPath = path.resolve(path.dirname(commander.css), sourceMapPath)
    if (commander.verbose) {
      console.error('Using sourceMappingURL at ' + sourceMapPath)
    }
    const sourceMapStr = fs.readFileSync(sourceMapPath)
    const sourceMap = JSON.parse(sourceMapStr)
    const sourceMapConsumer = await new SourceMapConsumer(sourceMap)

    // sourceMapConsumer.eachMapping(function (m) { console.log(m.generatedLine, m.source); });

    return { sourceMapConsumer, sourceMapPath }
  }
}

async function runCoverage () {
  const url = `file://${path.resolve(commander.html)}`

  log.debug('Starting puppeteer...')
  const browser = await puppeteer.launch({
    args: ['--no-sandbox'],
    devtools: process.env.NODE_ENV === 'development'
  })
  const page = await browser.newPage()

  log.info(`Opening (X)HTML file (may take a few minutes)`)
  log.debug(`Opening "${url}"`)
  await page.goto(url)
  log.debug(`Opened "${url}"`)

  const browserLog = log.child({ browser: 'console' })
  page.on('console', msg => {
    switch (msg.type()) {
      case 'error':
        // Loading an XHTML file with missing images is fine so we ignore
        // "Failed to load resource: net::ERR_FILE_NOT_FOUND" messages
        const text = msg.text()
        if (text !== 'Failed to load resource: net::ERR_FILE_NOT_FOUND') {
          browserLog.error(msg.text())
        }
        break
      case 'warning':
        browserLog.warn(msg.text())
        break
      case 'info':
        browserLog.info(msg.text())
        break
      case 'log':
        browserLog.debug(msg.text())
        break
      default:
        browserLog.error(msg.type(), msg.text())
        break
    }
  })
  page.on('pageerror', msgText => {
    log.fatal('browser-ERROR', msgText)
    process.exit(STATUS_CODE.ERROR)
  })

  log.debug(`Adding sizzleJS`)
  await page.mainFrame().addScriptTag({
    path: require.resolve('sizzle')
  })

  log.debug(`Calculating coverage`)
  const { matchedSelectors: coverageOutput, supportedDeclarations } = await page.evaluate((cssRules, cssDeclarations) => {
    // This is the meat of the code. It runs inside the browser
    console.log(`Starting evaluation`)
    const rules = cssRules

    // Add default do-nothing for selectors used in cnx-easybake
    const PSEUDOS = ['deferred', 'pass', 'match', 'after', 'before', 'outside', 'link', 'footnote-call', 'footnote-marker']
    PSEUDOS.forEach(function (pseudo) {
      window.Sizzle.selectors.match[pseudo] = RegExp(':?:?' + pseudo)
      window.Sizzle.selectors.find[pseudo] = function (match, context, isXML) { return context }
      window.Sizzle.selectors.pseudos[pseudo] = function (elem) { return elem }
    })

    const matchedSelectors = []
    rules.forEach(function (selectors) {
      console.log(`Checking selector: "${JSON.stringify(selectors)}"`)

      let count = 0
      // selectors could be null (maybe if it's a comment?)
      if (selectors) {
        selectors.forEach(function (selector) {
          // HACK: Remove those pseudos from the selector manually
          PSEUDOS.forEach(function (pseudo) {
            // special-case :pass(1) and :match("regexp") because they have arguments (and Sizzle handles them correctly)
            if (pseudo !== 'pass' && pseudo !== 'match') {
              selector = selector.replace(RegExp('::?' + pseudo), '')
              // TODO: replaceAll instead of just replace
            }
          })

          try {
            const matches = window.Sizzle(selector)
            count += matches.length
          } catch (e) {
            // If we cannot select it then we cannot cover it
            console.warn('Skipping selector that could not be matched using SizzleJS: ' + selector)
          }
        })
      }

      console.log(`Found ${count} matche(s)`)

      matchedSelectors.push([count, selectors])
    })

    console.log(`Finished checking selectors`)

    console.log(`Checking if declarations are understandable by the browser`)
    const supportedDeclarations = []
    for (const decl of cssDeclarations) {
      if (window.CSS.supports(decl)) {
        supportedDeclarations.push(decl)
      } else {
        console.warn(`Unsupported declaration ${decl}`)
      }
    }
    return { matchedSelectors, supportedDeclarations }
  }, cssRules, Object.keys(cssDeclarations))

  log.debug('Closing browser')
  await browser.close()

  log.debug('Finished evaluating selectors')
  log.info('Generating LCOV string...')

  const lcovStr = await generateLcovStr(coverageOutput, supportedDeclarations)
  if (commander.lcov) {
    fs.writeFileSync(commander.lcov, lcovStr)
  } else {
    console.log(lcovStr)
  }

  log.debug('Done writing LCOV string')
}

runCoverage()
  .then(null, err => {
    log.fatal(err)
    process.exit(STATUS_CODE.ERROR)
  })

async function generateLcovStr (coverageOutput, supportedDeclarations) {
  // coverageOutput is of the form:
  // [[1, ['body']], [400, ['div.foo']]]
  // where each entry is a pair of count, selectors

  const expected = cssRules.length
  const actual = coverageOutput.length
  if (expected !== actual) {
    throw new Error('BUG: count lengths do not match. Expected: ' + expected + ' Actual: ' + actual)
  }

  let sourceMapConsumer
  let sourceMapPath

  // Skip files that do not have a sourcemap
  if (commander.ignoreSourceMap || !/sourceMappingURL=([^ ]*)/.test(CSS_STR)) {
    sourceMapConsumer = null
    sourceMapPath = 'noSourceMapProvided'
  } else {
    const realConsumer = await initializeSourceMapConsumer()
    sourceMapConsumer = realConsumer.sourceMapConsumer
    sourceMapPath = realConsumer.sourceMapPath
  }

  function getStartInfo (origStart, origEnd) {
    const startInfo = sourceMapConsumer.originalPositionFor({ line: origStart.line, column: origStart.column - 1 })
    // const endInfo = sourceMapConsumer.originalPositionFor({line: origEnd.line, column: origEnd.column - 2})

    // When there is no match, startInfo.source is null
    if (!startInfo.source /* || startInfo.source !== endInfo.source */) {
      console.error('cssStart', JSON.stringify(origStart))
      origEnd && console.error('cssEnd', JSON.stringify(origEnd))
      // console.error('sourceStart', JSON.stringify(startInfo));
      // console.error('sourceEnd', JSON.stringify(endInfo));
      throw new Error('BUG: sourcemap might be invalid. Maybe try regenerating it?')
    } else {
      if (commander.verbose) {
        console.error('DEBUG: MATCHED this one', JSON.stringify(startInfo))
      }
    }
    return startInfo
  }

  const files = {} // key is filename, value is [{startLine, endLine, count}]
  const ret = [] // each line in the lcov file. Joined at the end of the function

  function addCoverageRaw (fileName, count, startLine, endLine) {
    // add it to the files
    if (!files[fileName]) {
      files[fileName] = []
    }
    files[fileName].push({ startLine: startLine, endLine: endLine, count: count })
  }

  function addCoverage (count, origStart, origEnd) {
    if (sourceMapConsumer) {
      // From https://github.com/mozilla/source-map#sourcemapconsumerprototypeoriginalpositionforgeneratedposition
      // Could have been {line: rule.position.start.line, column: rule.positoin.start.column}
      const startInfo = getStartInfo(origStart, origEnd)
      addCoverageRaw(startInfo.source, count, startInfo.line, startInfo.line)
    } else {
      // No sourceMap available
      const fileName = commander.css
      const startLine = origStart.line
      const endLine = startLine // Just do the selector (startLine)
      addCoverageRaw(fileName, count, startLine, endLine)
    }
  }

  let i = -1
  cssTree.walkRules(ast, (rule, item, list) => {
    if (rule.type !== 'Rule') {
      return // Skip AtRules
    }

    i += 1

    const count = coverageOutput[i][0]

    // From https://github.com/mozilla/source-map#sourcemapconsumerprototypeoriginalpositionforgeneratedposition
    // Could have been {line: rule.position.start.line, column: rule.positoin.start.column}
    const origStart = rule.loc.start
    const origEnd = rule.loc.end

    addCoverage(count, origStart, origEnd)
  })

  // Mark all the unsupported declarations
  const unsupportedDeclarations = Object.keys(cssDeclarations).filter(decl => supportedDeclarations.indexOf(decl) < 0)
  for (const decl of unsupportedDeclarations) {
    for (const loc of cssDeclarations[decl]) {
      addCoverage(0, loc.start)
    }
  }

  for (const fileName in files) {
    let nonZero = 0 // For summary info
    let allCounter = 0
    const fileNamePrefix = sourceMapPath ? path.dirname(sourceMapPath) : ''
    ret.push('SF:' + path.resolve(fileNamePrefix, fileName))

    files[fileName].forEach(function (entry) {
      const startLine = entry.startLine
      const endLine = entry.endLine
      const count = entry.count

      for (let line = startLine; line <= endLine; line++) {
        ret.push('DA:' + line + ',' + count)
        if (count > 0) {
          nonZero += 1
        }
        allCounter += 1
      }
    })

    // Include summary info for the file
    ret.push('LH:' + nonZero)
    ret.push('LF:' + allCounter)
    ret.push('end_of_record')
  }

  return ret.join('\n')
}
