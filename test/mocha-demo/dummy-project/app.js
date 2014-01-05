define(['jquery'], function($) {
  var $body = $('body');

  return {
    doSomethingComplex: function() {
      $body.append('<h3>Something Complex</h3>');
    },

    doSomethingElseComplex: function() {
      $body.append('<blockquote>Something Else Complex</blockquote>');
    },

    unusedFunction: function(className) {
      console.log('This line should never be run');
    },

  };
});
