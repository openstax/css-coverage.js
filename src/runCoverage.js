const fs = require('fs')
const path = require('path')
const puppeteer = require('puppeteer')
const SourceMapConsumer = require('source-map').SourceMapConsumer
const cssTree = require('css-tree')
require('dotenv').config()

const bunyan = require('bunyan')
const BunyanFormat = require('bunyan-format')

let theLogger = null

// Delay so tests can quiet it
function logger () {
  if (!theLogger) {
    theLogger = bunyan.createLogger({
      name: 'css-coverage',
      level: process.env.LOG_LEVEL || 'info',
      stream: new BunyanFormat({ outputMode: process.env.LOG_FORMAT || 'short' })
    })
  }
  return theLogger
}

async function doStuff (cssFile, htmlFile, ignoreDeclarations, ignoreSourceMap) {
  const { ast, cssContent, cssRules, cssDeclarations } = prepare(cssFile, ignoreDeclarations)
  return runCoverage(htmlFile, cssFile, ignoreSourceMap, cssContent, cssRules, cssDeclarations, ast)
}

function prepare (cssFile, ignoreDeclarations) {
  const cssContent = fs.readFileSync(cssFile, 'utf8')

  let ast
  try {
    ast = cssTree.parse(cssContent, { filename: cssFile, positions: true })
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
          if (ignoreDeclarations && ignoreDeclarations.indexOf(declaration.property.toLowerCase()) >= 0) {
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

  return { ast, cssContent, cssRules, cssDeclarations }
}

async function initializeSourceMapConsumer (cssFile, ignoreSourceMap, cssContent) {
  // Check if there is a sourceMappingURL
  let sourceMapPath
  if (!ignoreSourceMap && /sourceMappingURL=([^ ]*)/.exec(cssContent)) {
    sourceMapPath = /sourceMappingURL=([^ ]*)/.exec(cssContent)[1]
    sourceMapPath = path.resolve(path.dirname(cssFile), sourceMapPath)
    logger().debug('Using sourceMappingURL at ' + sourceMapPath)
    const sourceMapStr = fs.readFileSync(sourceMapPath)
    const sourceMap = JSON.parse(sourceMapStr)
    const sourceMapConsumer = await new SourceMapConsumer(sourceMap)

    // sourceMapConsumer.eachMapping(function (m) { console.log(m.generatedLine, m.source); });

    return { sourceMapConsumer, sourceMapPath }
  }
}

async function runCoverage (htmlFile, cssFile, ignoreSourceMap, cssContent, cssRules, cssDeclarations, ast) {
  const url = `file://${path.resolve(htmlFile)}`

  logger().debug('Starting puppeteer...')
  const browser = await puppeteer.launch({
    args: ['--no-sandbox'],
    devtools: process.env.NODE_ENV === 'development'
  })
  const page = await browser.newPage()

  logger().info(`Opening (X)HTML file (may take a few minutes)`)
  logger().trace(`Opening "${url}"`)
  await page.goto(url)
  logger().debug(`Opened "${url}"`)

  const browserLog = logger().child({ browser: 'console' })
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
      case 'debug':
        browserLog.debug(msg.text())
        break
      case 'trace':
        browserLog.trace(msg.text())
        break
      default:
        browserLog.error(msg.type(), msg.text())
        break
    }
  })
  page.on('pageerror', msgText => {
    logger().fatal('browser-ERROR', msgText)
    throw new Error(msgText)
  })

  logger().debug(`Adding sizzleJS`)
  await page.mainFrame().addScriptTag({
    path: require.resolve('sizzle')
  })

  logger().debug(`Calculating coverage`)
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
      console.trace(`Checking selector: "${JSON.stringify(selectors)}"`)

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

      console.debug(`Found ${count} matches for ${JSON.stringify(selectors)}`)

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

  logger().debug('Closing browser')
  await browser.close()

  logger().debug('Finished evaluating selectors. Generating LCOV string...')

  return generateLcovStr(cssFile, ignoreSourceMap, cssContent, cssRules, cssDeclarations, ast, coverageOutput, supportedDeclarations)
}

async function generateLcovStr (cssFile, ignoreSourceMap, cssContent, cssRules, cssDeclarations, ast, coverageOutput, supportedDeclarations) {
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
  if (ignoreSourceMap || !/sourceMappingURL=([^ ]*)/.test(cssContent)) {
    sourceMapConsumer = null
    sourceMapPath = 'noSourceMapProvided'
  } else {
    const realConsumer = await initializeSourceMapConsumer(cssFile, ignoreSourceMap, cssContent)
    sourceMapConsumer = realConsumer.sourceMapConsumer
    sourceMapPath = realConsumer.sourceMapPath
  }

  function getStartInfoOrNull (orig) {
    let startInfo = sourceMapConsumer.originalPositionFor({ line: orig.line, column: orig.column - 1 })
    // const endInfo = sourceMapConsumer.originalPositionFor({line: origEnd.line, column: origEnd.column - 2})

    // When there is no match, startInfo.source is null.
    // Try fiddling with the column
    if (!startInfo.source) {
      startInfo = sourceMapConsumer.originalPositionFor({ line: orig.line, column: orig.column })
    }
    if (startInfo.source) {
      logger().trace('matched this one', JSON.stringify(startInfo))
      return startInfo
    } else {
      return null
    }
  }

  function getStartInfo (orig) {
    const startInfo = getStartInfoOrNull(orig)
    if (!startInfo.source /* || startInfo.source !== endInfo.source */) {
      logger().error('css', JSON.stringify(orig))
      // logger().error('sourceStart', JSON.stringify(startInfo));
      // logger().error('sourceEnd', JSON.stringify(endInfo));
      throw new Error('BUG: sourcemap might be invalid. Maybe try regenerating it?')
    }
    return startInfo
  }

  const files = {} // key is filename, value is [{startLine, endLine, count}]

  function addCoverageRaw (fileName, count, startLine, endLine, startColumn, endColumn) {
    // add it to the files
    if (!files[fileName]) {
      files[fileName] = []
    }
    files[fileName].push({ startLine, endLine, startColumn, endColumn, count })
  }

  function addCoverage (count, origStart, origEnd) {
    if (sourceMapConsumer) {
      // From https://github.com/mozilla/source-map#sourcemapconsumerprototypeoriginalpositionforgeneratedposition
      // Could have been {line: rule.position.start.line, column: rule.positoin.start.column}
      const startInfo = getStartInfo(origStart)
      const endInfo = getStartInfoOrNull(origEnd) || startInfo
      addCoverageRaw(startInfo.source, count, startInfo.line, endInfo.line, startInfo.column, endInfo.column)
    } else {
      // No sourceMap available
      const startLine = origStart.line
      const endLine = startLine // Just do the selector (startLine)
      addCoverageRaw(cssFile, count, startLine, endLine, origStart.column, origStart.column)
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
      addCoverage(0, loc.start, loc.end)
    }
  }

  return { coverage: files, sourceMapPath }
}

module.exports = {
  doStuff,
  logger
}
