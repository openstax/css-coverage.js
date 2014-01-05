define ['jquery', 'less', 'cs!polyfill-path/index'], ($, less, CSSPolyfills) ->


  # Instrument the LESS loader so we can get the source file contents for coverage reports
  oldFileLoader = less.Parser.fileLoader
  less.Parser.fileLoader = (path, currentFileInfo, cb, env, modifyVars) ->
    # Add the CSS file to the set of files BlanketJS is waiting to load.
    # Meaning, it is NOT ok to start mocha.
    window.blanket.requiringFile(path)

    instrumentedCallback = (e, contents, fullPath, newFileInfo) ->
      # Remove the CSS file from the set of files BlanketJS is waiting to load.
      # Meaning, it is OK to start mocha.
      window.blanket.requiringFile(path, true)

      window._$blanket[fullPath] = {
        source: contents.split('\n')
      }
      cb(e, contents, fullPath, newFileInfo)

    oldFileLoader(path, currentFileInfo, instrumentedCallback, env, modifyVars)


  cssCoverage = new class CSSCoverage

    constructor: () ->
      $links = $('link[rel="stylesheet/coverage"]')
      href = $links.attr('href')
      if $links.length != 1 or not href
        throw new Error('BUG: to use CSS Coverage you must specify exactly one <link rel="stylesheet/css-polyfills" href="..."> element in the HTML file')

      # Do not start Mocha until the CSS file has been loaded.
      # Add the CSS file to the set of files BlanketJS is waiting to load.
      window.blanket.requiringFile(href)

      $.ajax(href)
      .done (cssStr) =>

        # Disable all plugins, just do coverage stats
        @poly = new CSSPolyfills {
          plugins: []
          # lessPlugins: [new CoverageVisitor()]
          # pseudoExpanderClass: null
          # canonicalizerClass: null
          doNotIncludeDefaultPlugins: true
        }

        # `window._$blanket` is a {path -> line -> count} object

        # Insert the root CSS file to instrument
        window._$blanket ?= {}
        window._$blanket[href] = {}
        window._$blanket[href].source = cssStr.split('\n')

        @poly.on 'selector.end', (selector, matches, debugInfo) =>
          fileName = debugInfo.fileName
          line = debugInfo.lineNumber
          if 0 >= matches
            # window._$blanket[fileName] ?= {}
            window._$blanket[fileName][line] ?= 0
          else
            # window._$blanket[fileName] ?= {}
            window._$blanket[fileName][line] ?= 0
            window._$blanket[fileName][line] += matches

        @poly.parse cssStr, href, (err, lessTree) =>
          throw new Error("ERROR: Could not parse CSS file '#{@href}'") if err
          @lessTree = lessTree

          # Remove the CSS file from the set of files BlanketJS is waiting to load.
          # Meaning, it is OK to start mocha.
          window.blanket.requiringFile(href, true)


    onTestDone: () ->
      # When a test has completed, update coverage by running CSSPolyfills
      @poly.runTree $('html'), @lessTree, (err, newCssStr) ->
        # After CSSPolyfills is done running, remove all the `js-polyfill` classes
        $('.js-polyfill-autoclass').each (i, el) ->
          $el = $(el)
          cls = $el.attr('class')
          $el.attr('class', cls.replace(/js-polyfill-.*/g, ''))

    onTestsDone: () ->
      # When all tests have completed output coverage info
      # By piggy-backing on BlanketJS this is already done for free


  throw new Exception('mocha library does not exist in global namespace!')  unless mocha

  # Mocha Events:
  #
  #   - `start`  execution started
  #   - `end`  execution complete
  #   - `suite`  (suite) test suite execution started
  #   - `suite end`  (suite) all tests (and sub-suites) have finished
  #   - `test`  (test) test execution started
  #   - `test end`  (test) test completed
  #   - `hook`  (hook) hook execution started
  #   - `hook end`  (hook) hook complete
  #   - `pass`  (test) test passed
  #   - `fail`  (test, err) test failed
  #
  OriginalReporter = mocha._reporter
  class CSSCoverageReporter extends OriginalReporter
    constructor: (runner) ->
      runner.on 'end', () ->
        cssCoverage.onTestsDone()

      runner.on 'test end', (test) ->
        cssCoverage.onTestDone test.parent.tests.length, test.state is 'passed'


      # NOTE: this is an instance of BlanketReporter
      super(arguments...)

  mocha.reporter(CSSCoverageReporter)
