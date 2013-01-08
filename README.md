# bench-rest benchmark REST API's

Node.js client module for easy load testing / benchmarking REST (HTTP/HTTPS) API's using a simple structure/DSL can create REST flows with setup and teardown and returns (measured) metrics.

[![Build Status](https://secure.travis-ci.org/jeffbski/bench-rest.png?branch=master)](http://travis-ci.org/jeffbski/bench-rest)

## Installation

Requires node.js >= 0.8

```bash
npm install ## install dependent node modules
```

## Usage

Simple single GET flow performing 100 requests with 10 concurrent connections

```javascript
  var flow = {
    main: [{ get: 'http://localhost:8000/' }]
  };
  var runOptions = {
    limit: 10,     // concurrent connections
    requests: 100  // number of requests to perform
  };
  var errors = [];
  benchrest(flow, runOptions)
    .on('error', function (err) { console.error(err); })
    .on('end', function (stats, errorCount) {
      console.log('error count: ', errorCount);
      console.log('stats', stats.toJSON());
    });
```

Advanced flow with setup/teardown and multiple steps to benchmark in each iteration

```javascript
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
  var runOptions = {
    limit: 10,     // concurrent connections
    requests: 100  // number of requests to perform
  };
  var errors = [];
  benchrest(flow, runOptions)
    .on('error', function (err) { console.error(err); })
    .on('end', function (stats, errorCount) {
      console.log('error count: ', errorCount);
      console.log('stats', stats.toJSON());
    });
```

## Goals

 - Easy to create REST (HTTP/HTTPS) flows for benchmarking
 - Generate good concurrency (at least 8K concurrent connections for single proc on Mac OS X)
 - Obtain metrics from the runs with average, total, min, max, histogram, req/s
 - Allow iterations to vary easily using token subsitution
 - Run programmatically so can be used with CI server

## Why

It is important to understand how well your architecture performs and with each change to the system how performance is impacted. The best way to know this is to benchmark your system with each major change.

Benchmarking also lets you:

 - understand how your system will act under load
 - how and whether multiple servers or processes will help you scale
 - whether a feature added improved or hurt performance
 - predict the need add instances or throttle load before your server reaches overload

## Tuning

Each OS may need some tweaking of the configuration to be able to generate or receive a large number of concurrent connections.

### Mac OS X

The Mac OS X can be tweaked using the following parameters. The configuration allowed about 8K concurrent connections for a single process.

```bash
sysctl -a | grep maxfiles  # display maxfiles and maxfilesperproc  defaults 12288 and 10240
sudo sysctl -w kern.maxfiles=25000
sudo sysctl -w kern.maxfilesperproc=24500
sysctl -a | grep somax # display max socket setting, default 128
sudo sysctl -w kern.ipc.somaxconn=20000  # set
ulimit -S -n       # display soft max open files, default 256
ulimit -H -n       # display hard max open files, default unlimited
ulimit -S -n 20000  # set soft max open files
```

## Get involved

If you have input or ideas or would like to get involved, you may:

 - contact me via twitter @jeffbski  - <http://twitter.com/jeffbski>
 - open an issue on github to begin a discussion - <https://github.com/jeffbski/bench-rest/issues>
 - fork the repo and send a pull request (ideally with tests) - <https://github.com/jeffbski/bench-rest>

## License

 - [MIT license](http://github.com/jeffbski/bench-rest/raw/master/LICENSE)

