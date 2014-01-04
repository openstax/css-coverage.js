# CSS Coverage!

Generates coverage information of your CSS (or LESS) files.

# Install and Run

You can install locally or globally. Installing globally will give you access to `css-coverage` from the command line.

Locally:

    npm install

    # Run CSS Coverage
    node ./bin/css-coverage -s ./test/test.css -h ./test/test.html

Globally:

    npm install -g .
    # Run CSS Coverage
    css-coverage -s ./test/test.css -h ./test/test.html


# Generate LCOV Reports

You can also generate LCOV data for use in services like <http://coveralls.io> or HTML reports using `lcov`:

    # Run CSS Coverage and generate a LCOV report (with verbose output)
    node ./bin/css-coverage -v -s ./test/test.css -h ./test/test.html -l ./css.lcov

    # Optionally Generate an HTML report
    genhtml ./css.lcov --output-directory ./coverage

# Test HTML on a Website

You can generate CSS coverage of a website by providing a URL instead of a local file in the `-h` command line argument.

**Note:** LESS files that use `@import` do not work in this case (yet).


This project uses the <https://github.com/philschatz/css-polyfills.js> project.
