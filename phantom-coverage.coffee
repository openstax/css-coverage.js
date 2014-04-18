system = require('system')
fs = require('fs')
page = require("webpage").create()


if system.args.length < 3
  console.error """This program takes 3 or 4 arguments:"

    1. The absolute path to this directory" # (I know, it's annoying but I need it to load the jquery, mathjax, and the like
    2. Input CSS/LESS file (ie '/path/to/style.css')
    3. Absolute path to Input html file (ie '/path/to/file.xhtml)
    4. Output LCOV file (optional)

    Exit code: 0 for success, negative then that is the uncovered count, positive is some other error

  """
  phantom.exit 1

programDir = system.args[1]

cssFile = system.args[2]
address = system.args[3]

lcovPath = system.args[4]

if lcovPath
  lcovFile = fs.open(lcovPath, 'w')

# Verify address is an absolute path
# TODO: convert relative paths to absolute ones
if /^https?:\/\//.test(address)
else if /^file:\/\//.test(address)
else if /^\//.test(address)
  address = "file://#{address}"
else
  console.error "Path to HTML file does not seem to be an absolute path. For now it needs to start with a '/'"
  phantom.exit 1


page.onConsoleMessage = (msg) ->
  console.log(msg)


OPEN_FILES = {}

page.onAlert = (msg) ->
  try
    msg = JSON.parse(msg)
  catch err
    console.log "Could not parse: #{msg}"
    return

  switch msg.type
    when 'PHANTOM_END'
      lcovFile?.close()
      phantom.exit(msg.code)
    when 'COVERAGE'
      lcovFile?.write(msg.msg)


console.log "Reading CSS file at: #{cssFile}"
lessFile = fs.read(cssFile, 'utf-8')
lessFilename = "file://#{cssFile}"

console.log "Opening page at: #{address}"
startTime = new Date().getTime()




page.open encodeURI(address), (status) ->
  if status != 'success'
    console.error "File not FOUND!!"
    phantom.exit(1)

  console.log "Loaded? #{status}. Took #{((new Date().getTime()) - startTime) / 1000}s"

  loadScript = (path) ->
    if page.injectJs(path)
    else
      console.error "Could not find #{path}"
      phantom.exit(1)

  loadScript(programDir + '/lib/phantomjs-hacks.js')
  loadScript(programDir + '/node_modules/css-polyfills/dist/css-polyfills.js')

  needToKeepWaiting = page.evaluate((lessFile, lessFilename) ->

    less = @CSSPolyfills.less
    AbstractSelectorVisitor = @CSSPolyfills.AbstractSelectorVisitor

    rootNode = document.documentElement

    # Squirrel away the Mixin Definitions so later we can pull out the line number from the ruleset
    # `debugInfo` gets added to the Ruleset later
    mixinDefinitions = []
    #mixinCalls = {}
    mixinFrames = [] # Ties the definition `.mixin-name(){}` to the namespaces for the eval `#foo>#bar>.mixin-name();`

    # Monitor the Mixin.Calls to see which definitions get called
    MixinDefinition_eval = less.tree.mixin.Definition::eval
    less.tree.mixin.Definition::eval = (env, args, important) ->
      @__coverage_called ?= 0
      @__coverage_called += 1

      sel = mixinFrames[mixinFrames.length-1].selector.toCSS()
      node = @
      params = []
      for param in node.params
        if param.name # TODO: Should use instanceof
          params.push(param.name)
        else if param.value
          params.push(param.value.toCSS(less))

      params.push('...') if node.variadic
      params = params.join('; ')
      console.log("MixinCall #{sel}(#{params})")

      MixinDefinition_eval.apply(@, arguments)

    MixinCall_eval = less.tree.mixin.Call::eval
    less.tree.mixin.Call::eval = (env) ->
      #mixinCalls[@selector.toCSS()] = @selector
      mixinFrames.push {selector: @selector}
      ret = MixinCall_eval.apply(@, arguments)
      mixinFrames.pop()
      return ret


    class CoverageVisitor
      isPreEvalVisitor: true

      constructor: () ->
        @_visitor = new less.tree.visitor(@)
      run: (root) -> @_visitor.visit(root)

      visitMixinDefinition: (node) ->
        mixinDefinitions.push(node)
        # params = []
        # for param in node.params
        #   if param.name # TODO: Should use instanceof
        #     params.push(param.name)
        #   else if param.value
        #     params.push(param.value.toCSS(less))
        #
        # params.push('...') if node.variadic
        # params = params.join('; ')
        # console.log("MixinCall #{sel}(#{params})")



    # Disable all plugins, just do coverage stats
    poly = new CSSPolyfills {
      plugins: []
      lessPlugins: [new CoverageVisitor()]
      # pseudoExpanderClass: null
      # canonicalizerClass: null
      doNotIncludeDefaultPlugins: true
    }

    uncoveredCount = 0

    coverage = {} # path -> line -> count

    poly.on 'selector.end', (selector, debugInfo, matchFn) ->
      fileName = debugInfo.fileName
      line = debugInfo.lineNumber
      try
        # sometimes the selector can be a page selector like `@footnotes` that
        # the browser does not understand. Ignore it.
        matches = matchFn().length
      catch e
        matches = 0

      if 0 >= matches
        uncoveredCount += 1
        console.log("Uncovered: {#{selector}}")

        coverage[fileName] ?= {}
        coverage[fileName][line] ?= 0
      else
        console.log("Covered: #{matches}: {#{selector}}")
        coverage[fileName] ?= {}
        coverage[fileName][line] ?= 0
        coverage[fileName][line] += matches

    outputter = (msg) ->
      alert JSON.stringify({type:'COVERAGE', msg:"#{msg}\n"})

    poly.run rootNode, lessFile, lessFilename, (err, newCSS) ->
      throw new Error(err) if err

      for mixinDef in mixinDefinitions

        debugInfo = mixinDef.debugInfo
        if not debugInfo
          for rule in mixinDef.rules
            # Annoyingly, some Rulesets do not have debugInfo attached.
            debugInfo ?= rule.debugInfo

        if debugInfo
          fileName = debugInfo.fileName
          line = debugInfo.lineNumber

          coverage[fileName] ?= {}
          coverage[fileName][line] ?= 0
          coverage[fileName][line] += mixinDef.__coverage_called or 0
        else
          console.log("No debugInfo for mixin. You need to patch the less.js part in dist/css-polyfills.js. See comment for more info")
          # Search for ` definition:` and add the following:
          # After `save();` add `var debugInfo = getDebugInfo(i, input, env);`
          #
          # Replace `return new(tree.mixin.Definition)(name, params, ruleset, cond, variadic);` with the following:
          #
          #     var def = new(tree.mixin.Definition)(name, params, ruleset, cond, variadic);
          #     if (env.dumpLineNumbers) {
          #         def.debugInfo = debugInfo;
          #     }
          #     return def;

      outputter("TN:")
      for fileName, info of coverage
        outputter("SF:#{fileName.replace(/^file:\/\//, '')}")
        counter = 0
        nonZero = 0
        for line, count of info
          outputter("DA:#{line},#{count}")
          if count > 0
            nonZero += 1
          counter += 1

        outputter("LH:#{nonZero}")
        outputter("LF:#{counter}")

        outputter("end_of_record")


      alert JSON.stringify({type:'PHANTOM_END', code:uncoveredCount})

  , lessFile, lessFilename)

  if not needToKeepWaiting
    phantom.exit()
