module.exports = (grunt) ->

  fs = require('fs')
  pkg = require('./package.json')

  # Project configuration.
  grunt.initConfig
    pkg: pkg

    # Compile CoffeeScript to JavaScript
    coffee:
      compile:
        options:
          sourceMap: false # true
        files:
          'build/css-coverage-coffee.js': ['src/blanket-css-coverage.coffee']

    concat:
      dist:
        src: [
            'node_modules/css-polyfills/dist/css-polyfills.js'
            'build/css-coverage-coffee.js'
        ]
        dest: 'css-coverage.js'

    # Release a new version and push upstream
    bump:
      options:
        commit: true
        push: true
        pushTo: ''
        commitFiles: ['package.json', 'bower.json', 'dist/css-coverage.js']
        # Files to bump the version number of
        files: ['package.json', 'bower.json']


  # Dependencies
  # ============
  for name of pkg.dependencies when name.substring(0, 6) is 'grunt-'
    grunt.loadNpmTasks(name)
  for name of pkg.devDependencies when name.substring(0, 6) is 'grunt-'
    if grunt.file.exists("./node_modules/#{name}")
      grunt.loadNpmTasks(name)

  # Tasks
  # =====

  # Default
  # -----
  grunt.registerTask 'default', [
    'coffee'
    'concat:dist'
  ]
