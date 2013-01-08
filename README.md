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
    main: [{ get: 'http://localhost:8000/' }]  // could be an array of REST operations
  };
  var runOptions = {
    limit: 10,     // concurrent connections
    requests: 100  // number of requests to perform
  };
  benchrest(flow, runOptions)
    .on('error', function (err) { console.error(err); })
    .on('end', function (stats, errorCount) {
      console.log('error count: ', errorCount);
      console.log('stats', stats);
    });
```

See `Detailed Usage` section below for more details

## Goals

 - Easy to create REST (HTTP/HTTPS) flows for benchmarking
 - Generate good concurrency (at least 8K concurrent connections for single proc on Mac OS X)
 - Obtain metrics from the runs with average, total, min, max, histogram, req/s
 - Allow iterations to vary easily using token subsitution
 - Run programmatically so can be used with CI server
 - Flow can have setup and teardown operations for startup and shutdown as well as for each iteration
 - Ability to automatically handles cookies separately for each iteration
 - Abilty to automatically follows redirects for operations
 - Errors will automatically stop an iterations flow and be tracked
 - Easy use and handling of etags
 - Allows pre/post processing or verification of data


## Detailed Usage

The `stats` is a `measured` data object and the `errorCount` is an count of the errors encountered. See `measured` for complete description of all the properties. https://github.com/felixge/node-measured

The `stats.main` will be the meter data for the main benchmark flow operations (not including the beforeMain and afterMain operations).

`stats.totalElapsed` is the elapsed time in milliseconds for the entire run including all setup and teardown operations

The output of the above run will look something like:

```javascript
error count:  0
stats {
  totalElapsed: 151,
  main:
   { meter:
      { mean: 1190.4761904761904,
        count: 100,
        currentRate: 1190.4761904761904,
        '1MinuteRate': 0,
        '5MinuteRate': 0,
        '15MinuteRate': 0 },
     histogram:
      { min: 3,
        max: 66,
        sum: 985,
        variance: 43.502525252525245,
        mean: 9.85,
        stddev: 6.595644415258091,
        count: 100,
        median: 8.5,
        p75: 11,
        p95: 17,
        p99: 65.53999999999976,
        p999: 66 } } }
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
      console.log('stats', stats);
    });
```

### Run options

The runOptions object can have the following properties which govern the benchmark run:

 - `limit` - required number of concurrent operations to limit at any given time
 - `requests` - required number of flow iterations to perform on the `main` flow (as well as `beforeMain` and `afterMain` setup/teardown operations)
 - `user` - optional user to be used for basic authentication
 - `password` - optional password to be used for basic authentication

### REST Operations in the flow

The REST operations that need to be performed in either as part of the main flow or for setup and teardown are configured using the following flow properties.

Each array of opertions will be performed in series one after another unless an error is hit. The afterMain and after operations will be performed regardless of any errors encountered in the flow.

```javascript
  var flow = {
    before: [],      // REST operations to perform before anything starts
    beforeMain: [],  // REST operations to perform before each iteration
    main: [],        // REST operations to perform for each iteration
    afterMain: [],   // REST operations to perform after each iteration
    after: []        // REST operations to perform after everything is finished
  };
```

Each operation can have the following properties:

 - one of these common REST properties `get`, `head`, `put`, `post`, `del` (using del rather than delete since delete is a JS reserved word) with a value pointing to the URI, ex: `{ get: 'http://localhost:8000/foo' }`
 - alternatively can specify `method` (use uppercase) and `uri` directly, ex: `{ method: 'GET', uri: 'http://localhost:8000/foo' }`
 - `json` optionally provide data which will be JSON stringified and provided as body also setting content type to application/json, ex: `{ put: 'http://localhost:8000/foo', json: { foo: 10 } }`
 - `headers` - optional headers to set, ex: `{ get: 'http://localhost:8000/foo', headers: { 'Accept-Encoding': 'gzip'}`
 - any other properties/options which are valid for `mikeal/request` - see https://github.com/mikeal/request
 - pre/post processing - optional array as `beforeHooks` and `afterHooks` which can perform processing before and/or after an operation. See `Pre/post operation processing` section below for details.

### Token substitution for iteration operations

To make REST flows that are independent of each other, one often wants unique URLs and unique data, so one way to make this easy is to include special tokens in the `uri`, `json`, or `data`.

Currently the token(s) replaced in the `uri`, `json`, or `data` are:

 - `#{INDEX}` - replaced with the zero based counter/index of the iteration

Note: for the `json` property the `json` object is JSON.stringified, tokens substituted, then JSON.parsed back to an object so that tokens will be substituted anywhere in the structure.


### Pre/post operation processing

If an array of hooks is specified in an operation as `beforeHooks` and/or `afterHooks` then these synchronous operations will be done before/after the REST operation.

Built-in processing filters can be referred to by name using a string, while custom filters can be provided as a function, ex:

```javascript
// This causes the HEAD operation to use a previously saved etag if found for this URI
// setting the If-None-Match header with it, and then if the HEAD request returns a failing
// status code
{ head: 'http://localhost:8000', beforeHooks: ['useEtag'], afterHooks: ['ignoreStatus'] }
```

The list of current built-in beforeHooks:

- `useEtag` - if an etag had been previously saved for this URI with `saveEtag` afterHook, then set the appropriate header (for GET/HEAD, `If-None-Match`, otherwise `If-Match`). If was not previously saved or empty then no header is set.

The list of current built-in afterHooks:

 - `saveEtag` - afterHook which causes an etag to be saved into an object cache specific to this iteration. Stored by URI. If the etag was the result of a POST operation and a `Location` header was provided, then the URI at the `Location` will be used.
 - `ignoreStatus` - afterHookif an operation could possibly return an error code that you want to ignore and always continue anyway. Failing status codes are those that are greater than or equal to 400. Normal operation would be to terminate an iteration if there is a failure status code in any `before`, `beforeMain`, or `main` operation.


To create custom beforeHook or afterHook the synchronous function needs to accept an `all` object and return the same or possibly modified object. To exit the flow, an exception can be thrown which will be caught and emitted.

So a verification function could be written as such

```javascript
function verifyData(all) {
  if (all.err) return all; // errored so just return and it will error as normal
  assert.equal(all.response.statusCode, 200);
  assert(all.body, 'foobarbaz');
  return all;
}
```

The properties available on the `all` object are:

 - all.env.index - the zero based counter for this iteration, same as what is used for #{INDEX}
 - all.env.jar - the cookie jar
 - all.env.user - basic auth user if provided
 - all.env.password - basic auth password if provided
 - all.env.etags - object of etags saved by URI
 - all.opIndex - zero based index for the operation in the array of operations, ie: first operation in the main flow will have opIndex of 0
 - all.action.requestOptions - the options that will be used for the request
 - all.err - not empty if an error has occurred
 - all.cb - the cb that will be called when done


## Why create this project?

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

## Dependencies

 - request - https://github.com/mikeal/request - for http/https operations with cookies, redirects
 - async - https://github.com/caolan/async - for limiting concurrency
 - measured - https://github.com/felixge/node-measured - for metrics

## TODO

 - command line runner

## Get involved

If you have input or ideas or would like to get involved, you may:

 - contact me via twitter @jeffbski  - <http://twitter.com/jeffbski>
 - open an issue on github to begin a discussion - <https://github.com/jeffbski/bench-rest/issues>
 - fork the repo and send a pull request (ideally with tests) - <https://github.com/jeffbski/bench-rest>

## License

 - [MIT license](http://github.com/jeffbski/bench-rest/raw/master/LICENSE)

