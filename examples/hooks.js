'use strict';

var assert = require('assert');

/*
 * Example of a flow which uses an afterHook to store data
 * from an action, that will be used by a subsequent action.
 *
 * The data is being stored in all.env which is global to the
 * run. So an array or object can be created and data is
 * stored uniquely by using all.env.index
 *
 * A beforeHook can be used on a subsequent action to retrieve
 * the data by all.env.index and use it to modify any of the
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
          // save location by index
          if (!all.env.locationByIndex) all.env.locationByIndex = [];
          all.env.locationByIndex[all.env.index] = all.response.headers.location;
          return all;
        }
      ]
    },
    {
      get: 'http://localhost:8000/LOCATION',
      beforeHooks: [
        function (all) {
          // use previously saved location in our URI
          var location = all.env.locationByIndex[all.env.index];
          all.requestOptions.uri = all.requestOptions.uri.replace('/LOCATION', location);
          return all;
        }
      ],
      afterHooks: [
        // verify data from what we expected
        function (all) {
          assert.equal(all.body, 'hello'+all.env.index);
          return all;
        }
      ]
    }
  ],
  afterMain: [],   // operations to do after each iteration
  after: []        // operations to do after everything is done
};

module.exports = flow;