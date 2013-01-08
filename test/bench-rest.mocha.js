'use strict';

var chai = require('chai');
var http = require('http');
var benchrest = require('../'); // require('bench-rest');
var t = chai.assert;
var httpServer;

suite('bench-rest');

before(function (done) {
  // Start an HTTP server
  httpServer = http.createServer(function (request, response) {
    // Every request gets the same "Hello Connect" response.
    response.writeHead(200, {"Content-Type": "text/plain"});
    response.end("Hello World");
  }).listen(8000);
  done();
});

after(function (done) {
  httpServer.close(function () { done(); });
});

test('simple', function (done) {
  var flow = {
    main: [{ get: 'http://localhost:8000' }]
  };
  var runOptions = {
    limit: 10,
    requests: 100
  };
  var errors = [];
  benchrest(flow, runOptions)
    .on('error', function (err) { errors.push(err); })
    .on('end', function (stats, errorCount) {
      if (errorCount) done(errors[0] || 'unknown error');
      done();
    });
});