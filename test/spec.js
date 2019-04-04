/* eslint-env jest */
const fs = require('fs')
const path = require('path')
const tmp = require('tmp')
const { doStuff } = require('../src/runCoverage')
const { toLcov } = require('../src/serialize')

const HTML = `<html>
<body>
</body>
</html>`

async function helperLcov (html, css, ignoreDeclarations = []) {
  const dir = tmp.dirSync({ discardDescriptor: true }).name
  const htmlFile = path.join(dir, 'test.xhtml')
  const cssFile = path.join(dir, 'test.css')
  const ignoreSourceMap = true

  fs.writeFileSync(htmlFile, html)
  fs.writeFileSync(cssFile, css)

  const { coverage, sourceMapPath } = await doStuff(cssFile, htmlFile, ignoreDeclarations, ignoreSourceMap)
  const str = toLcov(coverage, sourceMapPath, cssFile)
  expect(str).toMatchSnapshot()
  return coverage
}

function checkExpectations (coverage, expectedLineCounts) {
  expect(Object.keys(coverage).length).toBe(1)
  const covEntries = coverage[Object.keys(coverage)[0]]

  // covEntries is: [ { count, startLine, startColumn, endLine, endColumn } ]
  for (const { line, count: expectedCount } of expectedLineCounts) {
    const entries = covEntries.filter(({ startLine }) => startLine === line)
    expect(entries.length).toBe(1)
    const { count: actualCount } = entries[0]
    expect({ line, count: actualCount }).toEqual({ line, count: expectedCount })
  }
}

describe('tests', () => {
  beforeEach(() => {
    process.env.LOG_LEVEL = 'error'
    tmp.setGracefulCleanup()
  })

  it('reports no coverage', async () => {
    const coverage = await helperLcov(HTML, `uncovered { color: blue; }`)
    checkExpectations(coverage, [ { line: 1, count: 0 } ])
  })

  it('reports coverage', async () => {
    const coverage = await helperLcov(HTML, `body { color: blue; }`)
    checkExpectations(coverage, [ { line: 1, count: 2 } ]) // BUG: count should be 1
  })

  it('reports no coverage on an invalid declaration', async () => {
    const coverage = await helperLcov(HTML,
      `body {
  prince-caption-page: all;
}`)
    checkExpectations(coverage, [ { line: 2, count: 0 } ])
  })

  it('reports no coverage on an invalid value', async () => {
    const coverage = await helperLcov(HTML,
      `body {
  display: prince-footnote;
}`)
    checkExpectations(coverage, [ { line: 2, count: 0 } ])
  })

  it('ignores declarations that are in the whitelist', async () => {
    await helperLcov(HTML,
      `body {
  prince-caption-page: all;
}`, ['prince-caption-page'])

    // the coverage should not be reported so nothing to check for
    // checkExpectations(coverage, [ {line: 2, count: 0} ])
  })
})
