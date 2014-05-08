'use strict';

var assert = require('assert');

/*
 * Example of a flow which uses an afterHook to store data
 * from an action, that will be used by a subsequent action.
 *
 * The data is being stored in all.iterCtx which is available
 * to each action in the iteration.
 *
 * A beforeHook can be used on a subsequent action to retrieve
 * the data from all.iterCtx and use it to modify any of the
 * request parameters.
 */


var flow = {
  before: [],      // operations to do before anything
  beforeMain: [],  // operations to do before each iteration
  main: [  // the main flow for each iteration, #{INDEX} is unique iteration counter token
    {
      post: 'http://localhost:8000',
      body: 'hello#{INDEX}',
      afterHooks: [
        function (all) {
          // save location
          // all.iterCtx obj is where you can keep data for an iteration
          all.iterCtx.location = all.response.headers.location;
          return all; // always return all if you want it to continue
        }
      ]
    },
    {
      get: 'http://localhost:8000/LOCATION',
      beforeHooks: [
        function (all) {
          // use previously saved location in our URI
          var location = all.iterCtx.location;
          all.requestOptions.uri = all.requestOptions.uri.replace('/LOCATION', location);
          return all; // always return all if you want it to continue
        }
      ],
      afterHooks: [
        // verify data from what we expected
        function (all) {
          assert.equal(all.body, 'hello'+all.env.index);
          return all; // always return all if you want it to continue
        }
      ]
    }
  ],
  afterMain: [],   // operations to do after each iteration
  after: []        // operations to do after everything is done
};

module.exports = flow;