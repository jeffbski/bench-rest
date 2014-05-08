'use strict';

var chai = require('chai');
var http = require('http');
var accum = require('accum');
var benchrest = require('../'); // require('bench-rest');
var t = chai.assert;
var httpServer;
var requests = []; // array for tracking requests to http server

suite('bench-rest');

before(function (done) {
  // Start an HTTP server
  httpServer = http.createServer(function (request, response) {
    request.pipe(accum.string('utf8', function (str) { // accumululate any incoming data
      requests.push({ method: request.method, url: request.url, data: str }); // save these
    }));
    if (request.url === '/makeError') { // create an unauthorized 401 error for this URL only
      response.writeHead(401, {"Content-Type": "text/plain"});
      response.end('Unauthorized');
    } else { // all other requests get 200 success with Hello World
      response.writeHead(200, {"Content-Type": "text/plain"});
      response.end("Hello World");
    }
  }).listen(8000);
  done();
});

after(function (done) {
  httpServer.close(function () { done(); });
});

test('simple get', function (done) {
  var flow = {
    main: [{ get: 'http://localhost:8000' }]
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
      t.equal(requests.length, runOptions.iterations);
      done();
    });
});

test('simple get with progress', function (done) {
  var flow = {
    main: [{ get: 'http://localhost:8000' }]
  };
  var runOptions = {
    limit: 10,
    iterations: 100,
    progress: 10  // for testing set low, normally set higher like 1000
  };
  var errors = [];
  requests.length = 0;
  var progressFired = false;
  benchrest(flow, runOptions)
    .on('error', function (err, ctxName) { errors.push(err); })
    .on('progress', function (stats, percent, concurrent) {
      progressFired = true;
      t.isNumber(stats.main.meter.count, 'should have number of iterations completed');
      t.isNumber(percent, 'should have percent complete');
      t.isNumber(concurrent, 'should have a concurrent connections count');
    })
    .on('end', function (stats, errorCount) {
      if (errorCount) return done(errors[0] || 'unknown error');
      t.equal(requests.length, runOptions.iterations);
      t.ok(progressFired, 'progress event should have fired');
      done();
    });
});


test('stats provides measured data with totalElapsed and main metrics', function (done) {
  var flow = {
    main: [{ get: 'http://localhost:8000' }]
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
      t.isNumber(stats.totalElapsed, 'should have total elapsed time in millisecs');
      t.equal(stats.main.meter.count, runOptions.iterations, 'should have count equal to the iterations completed');
      t.isNumber(stats.main.meter.mean, 'should have an average for iterations/sec');
      t.isNumber(stats.main.histogram.min, 'should have a min time in milliseconds for all iterations');
      t.isNumber(stats.main.histogram.max, 'should have a max time in milliseconds for all iterations');
      t.isNumber(stats.main.histogram.sum, 'should have a sum time in milliseconds for all iterations');
      t.isNumber(stats.main.histogram.mean, 'should have a mean time in milliseconds for all iterations');
      t.isNumber(stats.main.histogram.p95, 'should have a 95 percentile time in milliseconds for all iterations');
      done();
    });
});




test('simple put/get flow', function (done) {
  var flow = {
    main: [
      { put: 'http://localhost:8000/foo', json: 'mydata' },
      { get: 'http://localhost:8000/foo' }
    ]
  };
  var runOptions = {
    limit: 1,   // limiting to single at a time so can guarantee order for test verification
    iterations: 2
  };
  var errors = [];
  requests.length = 0;
  benchrest(flow, runOptions)
    .on('error', function (err, ctxName) { errors.push(err); })
    .on('end', function (stats, errorCount) {
      if (errorCount) return done(errors[0] || 'unknown error');
      t.equal(requests.length, runOptions.iterations * flow.main.length);
      t.deepEqual(requests[0], { method: 'PUT', url: '/foo', data: '"mydata"' });
      t.deepEqual(requests[1], { method: 'GET', url: '/foo', data: '' });
      t.deepEqual(requests[2], { method: 'PUT', url: '/foo', data: '"mydata"' });
      t.deepEqual(requests[3], { method: 'GET', url: '/foo', data: '' });
      done();
    });
});

test('put/get flow with token substitution', function (done) {
  var flow = {
    main: [
      { put: 'http://localhost:8000/foo_#{INDEX}', json: 'mydata_#{INDEX}' },
      { get: 'http://localhost:8000/foo_#{INDEX}' }
    ]
  };
  var runOptions = {
    limit: 1,   // limiting to single at a time so can guarantee order for test verification
    iterations: 2
  };
  var errors = [];
  requests.length = 0;
  benchrest(flow, runOptions)
    .on('error', function (err, ctxName) { errors.push(err); })
    .on('end', function (stats, errorCount) {
      if (errorCount) return done(errors[0] || 'unknown error');
      t.equal(requests.length, runOptions.iterations * flow.main.length);
      t.deepEqual(requests[0], { method: 'PUT', url: '/foo_0', data: '"mydata_0"' });
      t.deepEqual(requests[1], { method: 'GET', url: '/foo_0', data: '' });
      t.deepEqual(requests[2], { method: 'PUT', url: '/foo_1', data: '"mydata_1"' });
      t.deepEqual(requests[3], { method: 'GET', url: '/foo_1', data: '' });
      done();
    });
});


test('allow flow to be defined as single string URL implying GET', function (done) {
  var flow = 'http://localhost:8000';
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
      t.equal(requests.length, runOptions.iterations);
      done();
    });
});

test('allow flow to be defined as single operation', function (done) {
  var flow = { get: 'http://localhost:8000' };
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
      t.equal(requests.length, runOptions.iterations);
      done();
    });
});

test('allow flow to be defined as array of main operations', function (done) {
  var flow = [{ get: 'http://localhost:8000' }];
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
      t.equal(requests.length, runOptions.iterations);
      done();
    });
});




test('put/get flow with before, beforeMain, afterMain, after', function (done) {
  var flow = {
    before: [{ head: 'http://localhost:8000/beforeEverything' }],
    beforeMain: [{ head: 'http://localhost:8000/foo_#{INDEX}?beforeEachIteration' }],
    main: [
      { put: 'http://localhost:8000/foo_#{INDEX}', json: 'mydata_#{INDEX}' },
      { get: 'http://localhost:8000/foo_#{INDEX}' }
    ],
    afterMain: [{ del: 'http://localhost:8000/foo_#{INDEX}?afterEachIteration' }],
    after: [{ head: 'http://localhost:8000/afterEverything' }]
  };
  var runOptions = {
    limit: 1,   // limiting to single at a time so can guarantee order for test verification
    iterations: 2
  };
  var errors = [];
  requests.length = 0;
  benchrest(flow, runOptions)
    .on('error', function (err, ctxName) { errors.push(err); })
    .on('end', function (stats, errorCount) {
      if (errorCount) return done(errors[0] || 'unknown error');
      var totalRequests = runOptions.iterations *
        (flow.main.length + flow.beforeMain.length + flow.afterMain.length) +
        flow.before.length + flow.after.length;
      t.equal(requests.length, totalRequests);
      t.deepEqual(requests[0], { method: 'HEAD', url: '/beforeEverything', data: '' });
      t.deepEqual(requests[1], { method: 'HEAD', url: '/foo_0?beforeEachIteration', data: '' });
      t.deepEqual(requests[2], { method: 'PUT', url: '/foo_0', data: '"mydata_0"' });
      t.deepEqual(requests[3], { method: 'GET', url: '/foo_0', data: '' });
      t.deepEqual(requests[4], { method: 'DELETE', url: '/foo_0?afterEachIteration', data: '' });
      t.deepEqual(requests[5], { method: 'HEAD', url: '/foo_1?beforeEachIteration', data: '' });
      t.deepEqual(requests[6], { method: 'PUT', url: '/foo_1', data: '"mydata_1"' });
      t.deepEqual(requests[7], { method: 'GET', url: '/foo_1', data: '' });
      t.deepEqual(requests[8], { method: 'DELETE', url: '/foo_1?afterEachIteration', data: '' });
      t.deepEqual(requests[9], { method: 'HEAD', url: '/afterEverything', data: '' });
      done();
    });
});

test('errors should be emitted and errorCount should return total', function (done) {
  var flow = {
    main: [
      { get: 'http://localhost:8000/foo' },
      { put: 'http://localhost:8000/makeError', json: 'mydata' }
    ]
  };
  var runOptions = {
    limit: 2,
    iterations: 2
  };
  var errors = [];
  requests.length = 0;
  benchrest(flow, runOptions)
    .on('error', function (err, ctxName) { errors.push({ err: err, ctxName: ctxName }); })
    .on('end', function (stats, errorCount) {
      t.equal(errors.length, runOptions.iterations, 'should have one error per iteration');
      t.match(errors[0].err.message, /401/);
      t.equal(errors[0].ctxName, 'main');
      t.match(errors[1].err.message, /401/);
      t.equal(errors[1].ctxName, 'main');
      done();
    });
});


test('null runOptions throws error', function () {
  var flow = {
    main: [{ get: 'http://localhost:8000' }]
  };
  var runOptions = null;
  function runWhichThrows() {
    benchrest(flow, runOptions);
  }
  t.throws(runWhichThrows, /benchmark runOptions requires iterations and limit properties/,
           'should throw when missing required property runOptions.iterations');
});

test('missing iterations property throws error', function () {
  var flow = {
    main: [{ get: 'http://localhost:8000' }]
  };
  var runOptions = {
    limit: 10,
    // iterations: 100
  };
  function runWhichThrows() {
    benchrest(flow, runOptions);
  }
  t.throws(runWhichThrows, /benchmark runOptions requires iterations and limit properties/,
           'should throw when missing required property runOptions.iterations');
});

test('missing limit property throws error', function () {
  var flow = {
    main: [{ get: 'http://localhost:8000' }]
  };
  var runOptions = {
    // limit: 10,
    iterations: 100
  };
  function runWhichThrows() {
    benchrest(flow, runOptions);
  }
  t.throws(runWhichThrows, /benchmark runOptions requires iterations and limit properties/,
           'should throw when missing required property runOptions.limit');
});

test('missing main flow throws error', function () {
  var flow = {
    // main: [{ get: 'http://localhost:8000' }]
  };
  var runOptions = {
    limit: 10,
    iterations: 100
  };
  function runWhichThrows() {
    benchrest(flow, runOptions);
  }
  t.throws(runWhichThrows, /benchmark flow requires main operations, missing flow\.main\?/,
           'should throw when cannot find the main operations');

});

test('null flow throws error', function () {
  var flow = null;
  var runOptions = {
    limit: 10,
    iterations: 100
  };
  function runWhichThrows() {
    benchrest(flow, runOptions);
  }
  t.throws(runWhichThrows, /benchmark flow requires main operations, missing flow\.main\?/,
           'should throw when cannot find the main operations');

});

