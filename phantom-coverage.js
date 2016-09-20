var system = require('system');
// var path = require('path'); // Not available in PhantomJS
// var fs = require('fs');
var page = require('webpage').create();

var rootPath = system.args[1];
var htmlPath = system.args[2];
var cssJSON = system.args[3];

var sizzlePath = rootPath + '/node_modules/sizzle/dist/sizzle.js';


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
        rules.forEach(function(selectors) {
          var count = 0;
          selectors.forEach(function(selector) {
            count += window.Sizzle(selector).length;
          });
          console.log('Count: ' + count + ' selector: ' + selectors);
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
