# bench-rest benchmark REST API's

Node.js client module for easy load testing / benchmarking REST (HTTP/HTTPS) API's using a simple structure/DSL can create REST flows with setup and teardown and returns (measured) metrics.

Roughly `bench-rest` = [mikeal/request](https://github.com/mikeal/request) + [caolan/async](https://github.com/caolan/async) + [felixge/node-measured](https://github.com/felixge/node-measured)

[![Build Status](https://secure.travis-ci.org/jeffbski/bench-rest.png?branch=master)](http://travis-ci.org/jeffbski/bench-rest)

## Contents on this page

 - <a href="#installation">Installation</a>
 - <a href="#prog-usage">Programmatic usage</a>
 - <a href="#cmd-usage">Command-line usage</a>
 - <a href="#goals">Goals</a>
 - <a href="#detailed-usage">Detailed usage</a>
   - <a href="#returns">Returns EventEmitter</a>
   - <a href="#stats">Stats (metrics) and errorCount benchmark results</a>
   - <a href="#shortcuts">Shortcuts for expressing the REST flow</a>
   - <a href="#run-options">Run options - number of iterations and concurrency</a>
   - <a href="#rest-flow">REST operations flow</a>
   - <a href="#tokens">Token substitution</a>
   - <a href="#pre-post">Pre/post operation processing</a>
 - <a href="#why">Why create this project?</a>
 - <a href="#tuning">Tuning</a>
   - <a href="#tuning-mac">Tuning Mac OS</a>
 - <a href="#modules">Key modules leveraged</a>
 - <a href="#get-involved">Get Involved</a>
 - <a href="#license">MIT License</a>


<a name="installation"/>
## Installation

Requires node.js >= 0.10

```bash
# If using programmatically
npm install bench-rest

# OR possibly with -g option if planning to use from command line
npm install -g bench-rest
```

<a name="prog-usage"/>
## Programmatic Usage

Simple flow performing 100 iterations with 10 concurrent connections

```javascript
  var benchrest = require('bench-rest');
  var flow = 'http://localhost:8000/';  // can use as simple single GET

  // OR more powerfully define an array of REST operations with substitution
  // This does a unique PUT and then a GET for each iteration
  var flow = {
    main: [
      { put: 'http://localhost:8000/foo_#{INDEX}', json: 'mydata_#{INDEX}' },
      { get: 'http://localhost:8000/foo_#{INDEX}' }
    ]
  };

  // if the above flow will be used with the command line runner or
  // programmatically from a separate file then export it.
  module.exports = flow;

  // There are even more flow options like setup and teardown, see detailed usage

  var runOptions = {
    limit: 10,     // concurrent connections
    iterations: 100  // number of iterations to perform
  };
  benchrest(flow, runOptions)
    .on('error', function (err, ctxName) { console.error('Failed in %s with err: ', ctxName, err); })
    .on('end', function (stats, errorCount) {
      console.log('error count: ', errorCount);
      console.log('stats', stats);
    });
```

See <a href="#detailed-usage">Detailed Usage</a> section below for more details


<a name="cmd-usage"/>
## Command-line usage

```bash
# if installed with -g
bench-rest

# otherwise use from node_modules
node_modules/bin/bench-rest
```

Outputs

```
  Usage: bench-rest [options] <flow-js-path-or-GET-URL>

  Options:

    -h, --help                   output usage information
    -V, --version                output the version number
    -n --iterations <integer>    Number of iterations to run, defaults to 1
    -a --prealloc <integer>      Max iterations to preallocate, defaults 100000
    -c --concurrency <integer>   Concurrent operations, defaults to 10
    -d --progress <integer>      Display progress bar (> 0), update every N ms, defaults 1000
    -u --user <username>         User for basic authentication, default no auth
    -p --password <password>     Password for basic authentication
    -e --evaluate <flow-string>  Evaluate flow from string, not file

  Examples:

    bench-rest -n 100 -c 100 ./examples/simple.js
    bench-rest -n 100 -c 100 -u "joe" -p "secret" /foo/flow.js
    bench-rest -n 10 -c 2 http://localhost:8000/
    bench-rest -n 10 -c 2 -e "{ head: 'http://localhost:8000/' }"
```

Running this

```bash
bench-rest -n 1000 -c 50 ./examples/simple.js
```

would output

```
Benchmarking 1000 iteration(s) using up to 50 concurrent connections

Using flow from: /Users/barczewskij/projects/bench-rest/examples/simple.js
 { main: [ { get: 'http://localhost:8000/' } ] }
Progress [=======================================] 100% 0.0s conc:49 1341/s

errors:  0
stats:  { totalElapsed: 894,
  main:
   { meter:
      { mean: 1240.6947890818858,
        count: 1000,
        currentRate: 1240.6947890818858,
        '1MinuteRate': 0,
        '5MinuteRate': 0,
        '15MinuteRate': 0 },
     histogram:
      { min: 4,
        max: 89,
        sum: 41603,
        variance: 242.0954864864864,
        mean: 41.603,
        stddev: 15.55941793533699,
        count: 1000,
        median: 42,
        p75: 50,
        p95: 70.94999999999993,
        p99: 81.99000000000001,
        p999: 88.99900000000002 } } }
```

It has one expected required parameter which is the path to a node.js
file which exports a REST flow. For example:

```javascript
  var flow = {
    main: [{ get: 'http://localhost:8000/' }]  // could be an array of REST operations
  };

  // if the above flow will be used with the command line runner or
  // programmatically from a separate file then export it.
  module.exports = flow;
```

Check for example flows in the `examples` directory.

See <a href="#detailed-usage">Detailed Usage</a> for more details on creating more advanced REST flows.



<a name="goals"/>
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
 - Provide programmatically and via cmd line the dynamic concurrency count

<a name="detailed-usage"/>
## Detailed Usage

Advanced flow with setup/teardown and multiple steps to benchmark in each iteration

```javascript
  var benchrest = require('bench-rest');
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

  var runOptions = {
    limit: 10,         // concurrent connections
    iterations: 1000,  // number of iterations to perform
    prealloc: 100      // only preallocate up to 100 before starting
  };
  var errors = [];
  benchrest(flow, runOptions)
    .on('error', function (err, ctxName) { console.error('Failed in %s with err: ', ctxName, err); })
    .on('progress', function (stats, percent, concurrent, ips) {
      console.log('Progress: %s complete', percent);
    })
    .on('end', function (stats, errorCount) {
      console.log('error count: ', errorCount);
      console.log('stats', stats);
    });
```

<a name="returns"/>
### Returns EventEmitter

The main function from `require('bench-rest')` will return a node.js EventEmitter instance when called with the `flow` and `runOptions`. This event emitter will emit the following events:

 - `error` - emitted as an error occurs during a run. It emits parameters `err` and `ctxName` matching where the error occurred (`main`, `before`, `beforeMain`, `after`, `afterMain`)
 - `progress` - emitted periodically as iterations complete. It emits parameters `stats`, `percentComplete`, `concurrent`, `ips`. The `stats` is the current `measured` stats (discussed below). The `concurrent` param is the concurrent connection count at that point in time. The `ips` is the calculated current iterations per second rate at which the iterations are executing. The interval at which progress is output is controlled by the runOption.progress in milliseconds.
 - `end` - emitted when the benchmark run has finished (successfully or otherwise). It emits parameters `stats` and `errorCount` (discussed below).


<a name="stats"/>
#### Stats (metrics) and errorCount benchmark results

The `stats` is a `measured` data object and the `errorCount` is an count of the errors encountered. Time is reported in milliseconds. See `measured` for complete description of all the properties. https://github.com/felixge/node-measured

`stats.totalElapsed` is the elapsed time in milliseconds for the entire run including all setup and teardown operations

The `stats.main` will be the meter data for the main benchmark flow operations (not including the beforeMain and afterMain operations).

A couple key metrics to be aware of:

 - `stats.main.meter.mean` - average iterations / sec
 - `stats.main.meter.count` - iterations completed
 - `stats.main.meter.currentRate` - iterations / sec at this moment (mainly useful when monitoring progress)
 - `stats.main.1MinuteRate` - iterations / sec for the last minute (only relevant if more than 1 minute has passed)
 - `stats.main.histogram.min` - the minimum time any iteration took (milliseconds)
 - `stats.main.histogram.max` - the maximum time any iteration took (milliseconds)
 - `stats.main.histogram.mean` - the average time any iteration took (milliseconds)
 - `stats.main.histogram.p95` - the amount of time that 95% of all iterations completed within (milliseconds)

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

<a name="shortcuts"/>
### Shortcuts for expressing flow

If you have very simple flow that does not need setup and teardown, then there are a few shortcuts for expressing the flow.

 - pass flow as just a string URL - it will perform a GET on this URL as the main flow, ex: `var flow = 'http://localhost:8000/';`
 - pass flow as just a single REST operation, ex: `var flow = { head: 'http://localhost:8000/' };`
 - pass flow as array of REST operations

```javascript
// passing as array implies no setup/teardown and these are the main operations
var flow = [
  { put: 'http://localhost:8000/foo', json: 'mydata' },
  { get: 'http://localhost:8000/foo' }
];
```

<a name="run-options"/>
### Run options

The runOptions object can have the following properties which govern the benchmark run:

 - `limit` - required number of concurrent operations to limit at any given time
 - `iterations` - required number of flow iterations to perform on the `main` flow (as well as `beforeMain` and `afterMain` setup/teardown operations)
 - `prealloc` - optional max number of iterations to preallocate before starting, defaults to lesser of 100K and `iterations`. When using large number of iterations or large payload per iteration, it can be necessary to adjust this for optimal memory use.
 - `user` - optional user to be used for basic authentication
 - `password` - optional password to be used for basic authentication
 - `progress` - optional, if non-zero number is provided it enables the output of progress events each time this number of milliseconds has passed

<a name="rest-flow"/>
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
 - pre/post processing - optional array as `beforeHooks` and `afterHooks` which can perform processing before and/or after an operation. See <a href="#pre-post">Pre/post operation processing</a> section below for details.


<a name="tokens"/>
### Token substitution for iteration operations

To make REST flows that are independent of each other, one often wants unique URLs and unique data, so one way to make this easy is to include special tokens in the `uri`, `json`, or `data`.

Currently the token(s) replaced in the `uri`, `json`, or `body` are:

 - `#{INDEX}` - replaced with the zero based counter/index of the iteration

Note: for the `json` property the `json` object is JSON.stringified, tokens substituted, then JSON.parsed back to an object so that tokens will be substituted anywhere in the structure. If subsitution is not needed (no `#{INDEX}` in the structure, then no copy (stringify/parse) will be performed.

<a name="pre-post"/>
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
 - `verify2XX` - afterHook which fails if an operation's status code was not in 200-299 range. If you don't want a redirect followed, be sure to add the request option `followRedirect: false`. Note: by default errors are verified (greater than or equal to 400), so this would just be used when you want to make sure it is not a 3xx either.


To create custom beforeHook or afterHook the synchronous function needs to accept an `all` object and return the same or possibly modified object. To exit the flow, an exception can be thrown which will be caught and emitted. Using these beforeHooks you can modify the next request, and using the afterHooks can verify the response and/or store data for future actions.

One way to keep state for each iteration (without using external variables) is to use the all.iterCtx object which is an empty object provided for each iteration. See `examples/hook.js` and `test/hooks-iter-ctx.mocha.js`

So a verification function could be written as such

```javascript
function verifyData(all) {
  if (all.err) return all; // errored so just return and it will error as normal
  assert.equal(all.response.statusCode, 200);
  assert(all.body, 'foobarbaz'); // if throws, err is caught and counted
  return all; // always return all if you want it to continue
}
```

Postprocess function example:

```javascript
function postProcess(all) {
  // all.iterCtx obj is where you can keep data for an iteration
  all.iterCtx.location = all.response.headers.location;
  all.iterCtx.body = all.body;
  return all; // always return all if you want it to continue
}
```

Preprocess function example:

```javascript
function preProcess(all) {
  // all.iterCtx object is where you can keep data private for an iteration
  // all.requestOptions will be used for the request, modify as needed
  all.requestOptions.uri = 'http://localhost:8000' + all.iterCtx.location;
  return all; // always return all if you want it to continue
}
```


The properties available on the `all` object are:

 - all.env.index - the zero based counter for this iteration, same as what is used for #{INDEX}
 - all.env.jar - the cookie jar
 - all.env.user - basic auth user if provided
 - all.env.password - basic auth password if provided
 - all.env.etags - object of etags saved by URI
 - all.iterCtx - empty object created for each iteration, can be used for your private storage from beforeHooks and afterHooks
 - all.opIndex - zero based index for the operation in the array of operations, ie: first operation in the main flow will have opIndex of 0
 - all.requestOptions - the options that will be used for the request (see mikeal/request)
 - all.requestOptions.uri - the URL that will be used for the request
 - all.requestOptions.method - the method that will be used for the request
 - all.response - the response obj (only for afterHooks)
 - all.body - the response body (only for afterHooks)
 - all.err - not empty if an error has occurred
 - all.cb - the cb that will be called when done


<a name="why"/>
## Why create this project?

It is important to understand how well your architecture performs and with each change to the system how performance is impacted. The best way to know this is to benchmark your system with each major change.

Benchmarking also lets you:

 - understand how your system will act under load
 - how and whether multiple servers or processes will help you scale
 - whether a feature added improved or hurt performance
 - predict the need add instances or throttle load before your server reaches overload

After attempting to use the variety of load testing clients and modules for benchmarking, none really met all of my desired goals. Most clients are only able to benchmark a single operation, not a whole flow and not one with setup and teardown.

Building your own is certainly an option but it gets tedious to make all the necessary setup and error handling to achieve a simple flow and thus this project was born.

<a name="tuning"/>
## Tuning OS

Each OS may need some tweaking of the configuration to be able to generate or receive a large number of concurrent connections.

<a name="tuning-mac"/>
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

<a name="modules"/>
## Key modules leveraged

 - request - https://github.com/mikeal/request - for http/https operations with cookies, redirects
 - async - https://github.com/caolan/async - for limiting concurrency
 - measured - https://github.com/felixge/node-measured - for metrics

<a name="get-involved"/>

## Tested on Node versions

 - 0.8
 - 0.10
 - 0.11

## Get involved

If you have input or ideas or would like to get involved, you may:

 - contact me via twitter @jeffbski  - <http://twitter.com/jeffbski>
 - open an issue on github to begin a discussion - <https://github.com/jeffbski/bench-rest/issues>
 - fork the repo and send a pull request (ideally with tests) - <https://github.com/jeffbski/bench-rest>

<a name="license"/>
## License - MIT

 - [MIT license](http://github.com/jeffbski/bench-rest/raw/master/LICENSE)

