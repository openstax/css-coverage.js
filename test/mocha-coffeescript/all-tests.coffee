define ['jquery', './dummy-project/app'], ($, dummyProject) ->

  describe 'Unit Tests for a dummy project that changes the DOM (but never fails)', () ->

    afterEach () ->
      # Clean up the DOM after each test to verify the coverage data is not reset
      $('h3').remove()
      $('blockquote').remove()

    it 'adds a <h3> element (check CSS coverage to see it is not unmatched)', () ->
      dummyProject.doSomethingComplex()
      # At the end of the test, there should be a <h3> element in the DOM.

    it 'adds a <blockquote> element (check CSS coverage to see it is not unmatched)', () ->
      dummyProject.doSomethingElseComplex()
