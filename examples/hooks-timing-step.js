'use strict';

var assert = require('assert');

/*
  Example using beforeHooks and afterHooks to time add stat timing
  for individual steps.

  The examples hooks below, have now been included into the core hooks
  so you can just refer to them by their string name "startStepTimer"
  and "endStepTimer", but I have left the code here as an example
  how you can write your own hooks.

  The hooks use the original measured stats object which is available
  in all.env.stats and they create a new timer for each step that is
  being tracked, so  step_0... When the step completes the afterHook
  ends the timer updating the stats.

  All stats are displayed at the end of the run, so the step_XYZ
  stats will be available in addition to the "main" ones.

  This example tracks the timings for step_0 and step_2, ignoring
  timings for step_1.
 */


var flow = {
  before: [],      // operations to do before anything
  beforeMain: [],  // operations to do before each iteration
  main: [  // the main flow for each iteration, #{INDEX} is unique iteration counter token
    {
      get: 'http://survey.codewinds.com/polls',
      beforeHooks: [ startStepTimer ],
      afterHooks: [ endStepTimer ]
    },
    {
      get: 'http://google.com'
    },
    {
      get: 'http://swapi.co/api/people',
      beforeHooks: [ startStepTimer ],
      afterHooks: [ endStepTimer ]
    }
  ],
  afterMain: [],   // operations to do after each iteration
  after: []        // operations to do after everything is done
};

module.exports = flow;

// These are identical to the core hooks named the same thing,
// so you can use them by just using the string name.

function startStepTimer(all) {
  if (!all.iterCtx.stepTimers) {
    // create map for step timers if doesn't exist
    all.iterCtx.stepTimers = {};
  }
  // create timer for this step and store in stepTimers[step_xyz]
  var timerName = 'step_'+all.opIndex; // step_0, step_1, ...
  all.iterCtx.stepTimers[all.opIndex] = all.env.stats.timer(timerName).start();
  return all;
}

function endStepTimer(all) {
  // stop timer previously created for step in startStepTimer
  all.iterCtx.stepTimers[all.opIndex].end();
  return all;
}
