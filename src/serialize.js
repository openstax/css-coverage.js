const path = require('path')

function toLcov (files, sourceMapPath, lcovFile) {
  const ret = [] // each line in the lcov file. Joined at the end of the function
  for (const fileName in files) {
    let nonZero = 0 // For summary info
    let allCounter = 0
    const fileNamePrefix = sourceMapPath ? path.dirname(sourceMapPath) : ''
    const destFile = path.relative(path.dirname(lcovFile), path.resolve(fileNamePrefix, fileName))
    ret.push(`SF:${destFile}`)
    files[fileName].forEach(function (entry) {
      const startLine = entry.startLine
      const endLine = entry.endLine
      const count = entry.count
      for (let line = startLine; line <= endLine; line++) {
        ret.push(`DA:${line},${count}`)
        if (count > 0) {
          nonZero += 1
        }
        allCounter += 1
      }
    })
    // Include summary info for the file
    ret.push(`LH:${nonZero}`)
    ret.push(`LF:${allCounter}`)
    ret.push(`end_of_record`)
  }
  return ret.join('\n')
}

// https://github.com/gotwarlost/istanbul/blob/master/coverage.json.md
function toJson (files, sourceMapPath, coverageFile) {
  const ret = {}
  for (const fileName in files) {
    const coverageEntry = { l: {}, s: {}, statementMap: {} }

    const fileNamePrefix = sourceMapPath ? path.dirname(sourceMapPath) : ''
    const destFile = path.relative(path.dirname(coverageFile), path.resolve(fileNamePrefix, fileName))

    files[fileName].forEach(function (entry) {
      const startLine = entry.startLine
      const endLine = entry.endLine
      const startColumn = entry.startColumn || 0
      const endColumn = entry.endColumn || 0
      const count = entry.count

      const statementId = `${startLine}`
      coverageEntry.s[statementId] = count
      coverageEntry.l[statementId] = count

      coverageEntry.statementMap[statementId] = {
        start: { line: startLine, column: startColumn },
        end: { line: endLine, column: endColumn }
      }
    })
    ret[destFile] = coverageEntry
  }
  return JSON.stringify(ret, null, 4)
}

module.exports = {
  toLcov,
  toJson
}
