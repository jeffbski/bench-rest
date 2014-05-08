'use strict';

var accum = require('accum');
var chai = require('chai');
var benchrest = require('../'); // require('bench-rest');
var http = require('http');

var t = chai.assert;
var httpServer;
var storedData = []; // simple store for POST data
var requests = []; // array for tracking requests to http server

/*
 * Demonstrates using all.iterCtx which is unique private storage
 * for each iteration
 */

suite('hooks-iter-ctx');

beforeEach(function (done) {
  storedData = [];
  // Start an HTTP server
  httpServer = http.createServer(function (request, response) {
    request.pipe(accum.string('utf8', function (str) { // accumululate any incoming data
      requests.push({ method: request.method, url: request.url, data: str }); // save these
      if (request.method === 'POST') { // save the data
        var storedLen = storedData.push(str);
        var storedIdx = storedLen - 1;
        response.writeHead(302, {"Location": "/stored/" + storedIdx });
        response.end();
      } else { // all other requests retrieve stored
        var m = /\/stored\/(\d+)/.exec(request.url);
        var idx = (m) ? parseInt(m[1], 10) : -1;
        response.writeHead(200, {"Content-Type": "text/plain"});
        response.end(storedData[idx]);
      }
    }));
  }).listen(8000);
  done();
});

afterEach(function (done) {
  httpServer.close(function () { done(); });
});


test('using location header from post for get', function (done) {
  var flow = {
    main: [
      {
        post: 'http://localhost:8000',
        body: 'hello#{INDEX}',
        afterHooks: [
          function (all) {
            // save this by index
            all.iterCtx.location = all.response.headers.location;
            return all;
          }
        ]
      },
      {
        get: 'http://localhost:8000/LOCATION',
        beforeHooks: [
          function (all) {
            var location = all.iterCtx.location;
            all.requestOptions.uri = all.requestOptions.uri.replace('/LOCATION', location);
            return all;
          }
        ],
        afterHooks: [
          function (all) {
            t.equal(all.body, 'hello'+all.env.index);
            return all;
          }
        ]
      }
    ]
  };
  var runOptions = {
    limit: 10,
    iterations: 100
  };
  var errors = [];
  requests.length = 0;

  benchrest(flow, runOptions)
    .on('error', function (err, ctxName) { errors.push(err); })
    .on('end', function (stats, errorCount) {
      if (errorCount) return done(errors[0] || 'unknown error');
      t.equal(requests.length, runOptions.iterations * flow.main.length);
      done();
    });
});

test('using location header from post for get, store in env', function (done) {
  var flow = {
    main: [
      {
        post: 'http://localhost:8000',
        body: 'hello#{INDEX}',
        afterHooks: [
          function (all) {
            // save this by index
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
            var location = all.env.locationByIndex[all.env.index];
            all.requestOptions.uri = all.requestOptions.uri.replace('/LOCATION', location);
            return all;
          }
        ],
        afterHooks: [
          function (all) {
            t.equal(all.body, 'hello'+all.env.index);
            return all;
          }
        ]
      }
    ]
  };
  var runOptions = {
    limit: 10,
    iterations: 100
  };
  var errors = [];
  requests.length = 0;

  benchrest(flow, runOptions)
    .on('error', function (err, ctxName) { errors.push(err); })
    .on('end', function (stats, errorCount) {
      if (errorCount) return done(errors[0] || 'unknown error');
      t.equal(requests.length, runOptions.iterations * flow.main.length);
      done();
    });
});