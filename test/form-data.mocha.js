'use strict';

var benchrest = require('../'); // require('bench-rest');
var chai = require('chai');
var Hapi = require('hapi');

var t = chai.assert;

suite('form-data');

var server = Hapi.createServer(3000, '127.0.0.1');

afterEach(function (done) {
  server.stop(done);
});

test('multipart form', function (done) {
  var routes = [
    {
      method: 'POST',
      path: '/upload',
      handler: uploadHandler
    }
  ];
  server.route(routes);
  function uploadHandler(request, reply) {
    if (request.payload.att &&
        request.payload.att.toString('utf8') === 'hello world') {
      return reply('ok');
    }
    return reply(new Error('failed to upload'));
  }
  server.start();

  var flow = {
    main: [{
      post: 'http://127.0.0.1:3000/upload',
      formData: { att: new Buffer('hello world') }
    }]
  };
  var runOptions = {
    limit: 10,
    iterations: 100
  };
  var errors = [];
  benchrest(flow, runOptions)
    .on('error', function (err, ctxName) { errors.push(err); })
    .on('end', function (stats, errorCount) {
      if (errorCount) return done(errors[0] || 'unknown error');
      t.equal(stats.main.meter.count, runOptions.iterations);
      done();
    });
});
