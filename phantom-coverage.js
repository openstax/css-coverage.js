var system = require('system');
// var path = require('path'); // Not available in PhantomJS
// var fs = require('fs');
var page = require('webpage').create();

var sizzlePath = system.args[1];
var htmlPath = system.args[2];
var cssJSON = system.args[3];

// redirect all `console.log` messages to stdout because the LCOV file will be sent to stdout
page.onConsoleMessage = function(msg) {
  // console.log.apply(console.log, arguments);
  console.log(msg);
}
page.open('file://' + htmlPath, function(status) {
  if (status === 'success') {
    page.includeJs(sizzlePath, function() {
      page.evaluate(function(cssJSON) {
        // This is the meat of the code. It runs inside the browser


        var rules = JSON.parse(cssJSON);

        // Add default do-nothing for selectors used in cnx-easybake
        var PSEUDOS = ['deferred', 'pass', 'match', 'after', 'before', 'outside'];
        PSEUDOS.forEach(function(pseudo) {
          window.Sizzle.selectors.match[pseudo] = RegExp(':?:?' + pseudo);
          window.Sizzle.selectors.find[pseudo] = function(match, context, isXML) { return context; };
          window.Sizzle.selectors.pseudos[pseudo] = function(elem) { return elem; };
        });

        rules.forEach(function(selectors) {
          var count = 0;
          // selectors could be null (maybe if it's a comment?)
          if (selectors) {
            selectors.forEach(function(selector) {
              // HACK: Remove those pseudos from the selector manually
              PSEUDOS.forEach(function(pseudo) {
                // special-case :pass(1) and :match("regexp") because they have arguments (and Sizzle handles them correctly)
                if (pseudo !== 'pass' && pseudo !== 'match') {
                  selector = selector.replace(RegExp('::?' + pseudo), '');
                  // TODO: replaceAll instead of just replace
                }
              });

              try {
                var matches = window.Sizzle(selector);
                count += matches.length;
              } catch (e) {
                // If we cannot select it then we cannot cover it
                console.warn('Skipping selector that could not be matched using SizzleJS: ' + selector)
              }
            });
          }
          console.log(JSON.stringify([count, selectors]));
        });
      }, cssJSON);
      phantom.exit();
    });
  } else {
    console.error('PhantomJS Open Status: ' + status);
    phantom.exit();
    system.exit(1);
  }
});
