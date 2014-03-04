define ['jquery', './dummy-project/app'], ($, dummyProject) ->

  describe 'a dummy project that is tested for CSS coverage after each test', () ->

    afterEach () ->
      # Clean up the DOM after each test to verify the coverage data is not reset
      $('h3').remove()
      $('blockquote').remove()

    it 'adds a <h3> element (check CSS coverage to see it is not RED)', () ->
      dummyProject.doSomethingComplex()
      # At the end of the test, there should be a <h3> element in the DOM.

    it 'adds a <blockquote> element (check CSS coverage to see it is not RED)', () ->
      dummyProject.doSomethingElseComplex()
