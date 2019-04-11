# CSS Coverage!

[![Greenkeeper badge](https://badges.greenkeeper.io/philschatz/css-coverage.js.svg)](https://greenkeeper.io/)

Generates coverage information of your CSS files and creates reports using the optional source maps.

## How is this different from other CSS coverage tools?

- gives coverage information on your source files (SASS/LESS/Stylus/etc), not just the compiled CSS file
- provides a command line script to run against individual test files


## What can I do with `css-coverage`?

You can use the command line version to:

- test a CSS and HTML file one at a time
- use `css-coverage` as part of a build (like in GruntJS)
- generate a LCOV Report for use in services like [Coveralls](http://coveralls.io) or HTML reports using `lcov`


### Can I make Reports?

You can also generate LCOV Files for Coveralls or just HTML reports:

    # Run CSS Coverage and generate a LCOV report (with verbose output)
    css-coverage --css ./test/test.css --html ./test/test.html --lcov ./css.lcov

    # Optionally Generate an HTML report
    genhtml ./css.lcov --output-directory ./coverage


## Commandline Options

```txt
Usage: css-coverage [options]

Generate coverage info for a CSS file against an HTML file. This supports loading sourcemaps by using the sourceMappingURL=FILENAME.map CSS comment

Options:
  --html [path/to/file.html]               path to a local HTML file
  --css [path/to/file.css]                 path to a local CSS file
  --lcov [path/to/output.lcov]             the LCOV output file
  --verbose                                verbose/debugging output
  --ignore-source-map                      disable loading the sourcemap if one is found
  --ignore-declarations [move-to,content]  A comma-separated list of declarations to ignore
  -h, --help                               output usage information
```
