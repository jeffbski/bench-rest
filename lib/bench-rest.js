'use strict';

/* Setting up server process and client process, which gives ~8K concurrent
sysctl -a | grep maxfiles  # display maxfiles and maxfilesperproc  defaults 12288 and 10240
sudo sysctl -w kern.maxfiles=25000
sudo sysctl -w kern.maxfilesperproc=24500
sysctl -a | grep somax # display max socket setting, default 128
sudo sysctl -w kern.ipc.somaxconn=20000  # set
ulimit -S -n       # display soft max open files, default 256
ulimit -H -n       # display hard max open files, default unlimited
ulimit -S -n 20000  # set soft max open files
 */

var async = require('async');
var http = require('http');
var measured = require('measured');
var request = require('request');
var EventEmitter = require('events').EventEmitter;

function benchmark(flow, runOptions) {
  flow = ensureFlowProperties(flow);
  var emitter = new EventEmitter();
  var errorCount = 0;
  var stats = measured.createCollection();
  var elapsed_timer = stats.timer('totalElapsed').start();

  function handleError(err, ctxName, exit) {
    errorCount++;
    emitter.emit('error', err, ctxName);
    if (exit) emitter.emit('end', stats, errorCount);
  }

  if (!runOptions.requests || !runOptions.limit) {
    throw new Error('benchmark runOptions requires requests and limit properties');
  }
  if (!Array.isArray(flow.main)) {
    throw new Error('benchmark flow requires an array of operations as property main');
  }
  http.globalAgent.maxSockets = runOptions.limit;

  function run(task, cb) {
    var req_timer = stats.timer('main').start();
    task.env.group = 'beforeMain';
    performActions(task.env, task.beforeMain, function (err) {
      if (err) {
        handleError(err, 'beforeMain');
        return cb(err);
      }
      task.env.group = 'main';
      performActions(task.env, task.main, function (err) {
        req_timer.end();
        if (err) {
          handleError(err, 'main');
        }
        task.env.group = 'afterMain';
        performActions(task.env, task.afterMain, function (err) {
          if (err) {
            handleError(err, 'afterMain');
            return cb(err);
          }
          cb();
        });
      });
    });
  }


  var queue = async.queue(run, runOptions.limit);

  queue.drain = function () {
    performActions({ group: 'after', user: runOptions.user, password: runOptions.password  }, flow.after, function (err) {
      elapsed_timer.end();
      if (err) {
        handleError(err, 'after');
      }
      var statsObj = stats.toJSON(); // actually materializes object
      statsObj.totalElapsed = statsObj.totalElapsed.histogram.max; // simplify the elapsed to single number
      emitter.emit('end', statsObj, errorCount);
    });
  };

  process.nextTick(function () { // allow event handlers to be hooked up before starting

    performActions({ group: 'before', user: runOptions.user, password: runOptions.password }, flow.before, function (err) {
      if (err) {
        return handleError(err, 'before', true);  // exit if fails here
      }

      try {
        for (var i = 0; i < runOptions.requests; i++) {
          var tokens = { INDEX: i };
          queue.push({
            env: { index: i, jar: request.jar(), user: runOptions.user, password: runOptions.password, etags: {} },
            beforeMain: substituteTokens(tokens, flow.beforeMain),
            main: substituteTokens(tokens, flow.main),
            afterMain: substituteTokens(tokens, flow.afterMain)
          });
        }
      } catch (err) {
        handleError(err, 'queuing');
      }
    });

  });

  return emitter;
}

function ensureFlowProperties(flow) {
  if (!flow.before) flow.before = [];
  if (!flow.after) flow.after = [];
  if (!flow.beforeMain) flow.beforeMain = [];
  if (!flow.afterMain) flow.afterMain = [];
  return flow;
}

function getRequestOptions(env, action) {
  // just using action and update in place
  action.jar = env.jar;
  if (!action.headers) action.headers = {};
  action.headers.Connection = 'keep-alive';
  if (env.user) { // if user provided, add basic auth authentication
    action.headers.Authorization = 'Basic ' + new Buffer(env.user + ':' + env.password).toString('base64');
  }
  if (action.get) {
    action.method = 'GET';
    action.uri = action.get;
  } else if (action.head) {
    action.method = 'HEAD';
    action.uri = action.head;
  } else if (action.put) {
    action.method = 'PUT';
    action.uri = action.put;
  } else if (action.post) {
    action.method = 'POST';
    action.uri = action.post;
  } else if (action.del) {
    action.method = 'DELETE';
    action.uri = action.del;
  }
  return action;
}

var CORE_HOOKS = {
  useEtag: function (all) {
    if (all.env.etags && all.env.etags[all.requestOptions.uri]) {
      var headerName = (all.requestOptions.get || all.requestOptions.head) ? 'If-None-Match' : 'If-Match';
      all.requestOptions.headers[headerName] = all.env.etags[all.requestOptions.uri];
    }
    return all;
  },
  saveEtag: function (all) {
    var res = all.response;
    if (!all.err && res.statusCode >= 200 && res.statusCode < 300 && res.headers.etag) {
      // if POST returned Location use it for ETag URI, not original URI
      var uri = (all.requestOptions.method === 'POST' && res.headers.location) ?
        res.headers.location :
        all.requestOptions.uri;
      if (!all.env.etags) all.env.etags = {};
      all.env.etags[uri] = res.etag;
    }
    return all;
  },
  ignoreStatus: function (all) {
    if (!all.err && all.response.statusCode >= 400) all.response.statusCode = 200;
    return all;
  }
};

function identityHook(all) { return all; }

function processHooks(hookName, all) {
  var hooks = all.requestOptions[hookName] || [];
  if (!hooks.length) return all;
  hooks = hooks.map(function (hook) { // substitute core hooks
    if (typeof hook === 'string') hook = CORE_HOOKS[hook];
    if (!hook) hook  = identityHook;
    return hook;
  });
  try {
    all = hooks.reduce(function (accum, hook) { return hook(accum); }, all);
    return all;
  } catch (err) {
    all.cb(err);
    return false; // already handled exit
  }
}

function performActions(env, actionArr, cb) {
  var performActionWithEnv = performAction.bind(null, env);
  async.reduce(actionArr, 0, performActionWithEnv, cb);
}

function performAction(env, opIndex, action, cb) {
  env.actionName = env.group + '_' + opIndex;
  var all = {
    env: env,
    opIndex: opIndex,
    requestOptions: getRequestOptions(env, action),
    err: null,
    cb: cb
  };
  all = processHooks('beforeHooks', all);
  if (!all) return; // already handled
  var req = request(all.requestOptions, function (err, res, body) {
    all.err = err;
    all.response = res;
    all.body = body;
    all = processHooks('afterHooks', all);
    if (!all) return; // already handled
    if (all.err) return all.cb(all.err);
    if (all.response.statusCode >= 400) return all.cb(new Error('error statusCode: ' + all.response.statusCode));
    all.cb(all.err, all.response, all.body);
  });
  req.start();
  return opIndex + 1;
}

function substituteTokens(tokens, actions) {
  actions = actions || [];
  return actions.map(function (action) {
    return Object.keys(action).reduce(function (accum, key) {
      if (key === 'get' || key === 'head' || key === 'put' || key === 'post' || key === 'del') {
        accum[key] = action[key].replace(/\#\{INDEX\}/g, tokens.INDEX);
      } else if (key === 'json') {
        accum[key] = JSON.parse(JSON.stringify(action[key]).replace(/\#\{INDEX\}/g, tokens.INDEX));
      } else if (key === 'body' && typeof action.body === 'string') {
        accum[key] = action[key].replace(/\#\{INDEX\}/g, tokens.INDEX);
      } else {
        accum[key] = action[key];
      }
      return accum;
    }, {});
  });
}





module.exports = benchmark;

