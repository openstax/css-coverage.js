# CSS Coverage!

Generates coverage information of your CSS (or LESS) files using the command line or in browser/GruntJS unit tests.

By hooking into [BlanketJS](http://blanketjs.org) you can use this with Jasmine, Mocha, QUnit, Coveralls, and tools like [grunt-blanket-mocha](https://github.com/ModelN/grunt-blanket-mocha).

## How is this different from other CSS coverage tools?

Code coverage tools use Unit Tests to "exercise" the code and show you what is not tested; this project hooks into those same tools and gives you CSS coverage information for free!

It also:

- gives coverage information on your source LESS files, not just the compiled CSS file
- provides a command line script to run against individual test files or pages hosted on a website

**TODO:** Coverage currently runs after every test but there will be a function you can call in the middle of a test

## Can I see it?

Check out the in-browser [mocha demo](http://philschatz.github.io/css-coverage.js/test/mocha-demo)! (see _"blanket.js results"_ for the CSS coverage)

### Screenshot

![image](https://f.cloud.github.com/assets/253202/2317474/4856dbea-a34e-11e3-92ae-70f53672cb93.png)


## What can I do with `css-coverage`?

You can use the command line version to:

- test a CSS and HTML file one at a time
- use `css-coverage` as part of a build (like in GruntJS)
- generate a LCOV Report for use in services like [Coveralls](http://coveralls.io) or HTML reports using `lcov`


### Can I make Reports?

You can also generate LCOV Files for Coveralls or just HTML reports:

    # Run CSS Coverage and generate a LCOV report (with verbose output)
    node ./bin/css-coverage -v -s ./test/test.css -h ./test/test.html -l ./css.lcov

    # Optionally Generate an HTML report
    genhtml ./css.lcov --output-directory ./coverage


### Can I test Coverage of an entire Website?

You can generate CSS coverage of a website by providing a URL instead of a local file in the `-h` command line argument.

**TODO:** Write an example using [CasperJS](http://casperjs.org)


## Can I run it with mocha, Jasmine, QUnit?

Yep! It integrates with [BlanketJS](http://blanketjs.org/) so you can see LESS/CSS coverage as well as JavaScript coverage.

All you need to do is add the following to your test harness HTML file (usually `test/index.html`:

1. include `<script src=".../css-polyfills/dist/css-polyfills.js"></script>`
2. include `<script src="./src/css-coverage.js"></script>` after BlanketJS
3. include `<link rel="stylesheet/coverage" href="path/to/css/file.[less|css]">` to specify which CSS files to cover

See the [mocha demo](http://philschatz.github.io/css-coverage.js/test/mocha-demo) for an example and <test/mocha-demo/index.html> for the code.


## How do I install it?

You can install locally or globally. Installing globally will give you access to `css-coverage` from the command line.

Locally (on the command line or in conjunction with [BlanketJS](http://blanketjs.org/)):

    npm install
    # Run CSS Coverage on the command line
    ./bin/css-coverage -s ./test/test.css -h ./test/test.html

Globally (on the command line):

    npm install -g .
    # Run CSS Coverage
    css-coverage -s ./test/test.css -h ./test/test.html


## How does this work?

This project uses <http://philschatz.com/css-polyfills.js/>.
