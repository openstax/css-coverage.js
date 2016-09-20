Each entry needs to contain:

`selectors` (id is not necessary; the index is the id)

Example: `[['body'], ['div.foo']]`

**Note:** It's a 2-dimensional array because each rule can have multiple selectors

Then, PhantomJS will output:

`count` (id is not necessary; the index is the id)

and css-coverage will translate that back (using sourcemap) to `file, lineStart, lineEnd`
