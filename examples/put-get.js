'use strict';

var flow = {
  before: [],      // operations to do before anything
  beforeMain: [],  // operations to do before each iteration
  main: [  // the main flow for each iteration, #{INDEX} is unique iteration counter token
    { put: 'http://localhost:8000/foo_#{INDEX}', json: 'mydata_#{INDEX}' },
    { get: 'http://localhost:8000/foo_#{INDEX}' }
  ],
  afterMain: [{ del: 'http://localhost:8000/foo_#{INDEX}' }],   // operations to do after each iteration
  after: []        // operations to do after everything is done
};

module.exports = flow;