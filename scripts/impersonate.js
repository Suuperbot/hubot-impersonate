//Description:
//  Impersonate a user using Markov chains
//
//Configuration:
//  HUBOT_IMPERSONATE_MODE=mode - one of 'train', 'train_respond', 'respond'. (default 'train')
//  HUBOT_IMPERSONATE_MARKOV_MIN_WORDS=N - ignore messages with fewer than N words. (default 1)
//  HUBOT_IMPERSONATE_INIT_TIMEOUT=N - wait for N milliseconds for brain data to load from redis. (default 10000)
//
//Commands:
//  hubot impersonate <user> - impersonate <user> until told otherwise.
//  hubot stop impersonating - stop impersonating a user
//
//Author:
//  b3nj4m

var Markov = require('markov-respond');
var _ = require('underscore');

var MIN_WORDS = process.env.HUBOT_IMPERSONATE_MARKOV_MIN_WORDS ? parseInt(process.env.HUBOT_IMPERSONATE_MARKOV_MIN_WORDS) : 1;
var MODE = process.env.HUBOT_IMPERSONATE_MODE && _.contains(['train', 'train_respond', 'respond'], process.env.HUBOT_IMPERSONATE_MODE) ? process.env.HUBOT_IMPERSONATE_MODE : 'train';
var INIT_TIMEOUT = process.env.HUBOT_IMPERSONATE_INIT_TIMEOUT ? parseInt(process.env.HUBOT_IMPERSONATE_INIT_TIMEOUT) : 10000;

var impersonating = false;

var shouldTrain = _.constant(_.contains(['train', 'train_respond'], MODE));

var shouldRespondMode = _.constant(_.contains(['respond', 'train_respond'], MODE));

function shouldRespond() {
  return shouldRespondMode() && impersonating;
}

function robotStore(robot, userId, data) {
  return robot.brain.set('impersonateMarkov-' + userId, data.export());
}

function robotRetrieve(robot, cache, userId) {
  if (cache[userId]) {
    return cache[userId];
  }

  var m = new Markov(MIN_WORDS);
  m.import(robot.brain.get('impersonateMarkov-' + userId) || '{}');
  cache[userId] = m;
  return m;
}

function start(robot) {
  var cache = {};
  var store = robotStore.bind(this, robot);
  var retrieve = robotRetrieve.bind(this, robot, cache);

  robot.brain.setAutoSave(true);

  var hubotMessageRegex = new RegExp('^[@]?(' + robot.name + ')' + (robot.alias ? '|(' + robot.alias + ')' : '') + '[:,]?\\s', 'i');

  robot.respond(/impersonate (\w*)/i, function(msg) {
    if (shouldRespondMode()) {
      var username = msg.match[1];
      var text = msg.message.text;

      var users = robot.brain.usersForFuzzyName(username);

      if (users && users.length > 0) {
        var user = users[0];
        impersonating = user.id;
        msg.send('impersonating ' + user.name);
      }
      else {
        msg.send("I don't know any " + username + ".");
      }
    }
  });

  robot.respond(/stop impersonating/i, function(msg) {
    if (shouldRespond()) {
      var user = robot.brain.userForId(impersonating);
      impersonating = false;

      if (user) {
        msg.send('stopped impersonating ' + user.name);
      }
      else {
        msg.send('stopped');
      }
    }
    else {
      msg.send('Wat.');
    }
  });

  robot.hear(/.*/, function(msg) {
    var text = msg.message.text;
    var markov;

    if (!hubotMessageRegex.test(text)) {
      if (shouldTrain()) {
        var userId = msg.message.user.id;
        markov = retrieve(userId);

        markov.train(text);
        store(userId, markov);
      }

      if (shouldRespond()) {
        markov = retrieve(impersonating);
        msg.send(markov.respond(text));
      }
    }
  });
}

module.exports = function(robot) {
  var loaded = _.once(function() {
    console.log('starting hubot-impersonate...');
    start(robot);
  });

  if (_.isEmpty(robot.brain.data) || _.isEmpty(robot.brain.data._private)) {
    robot.brain.once('loaded', loaded);
    setTimeout(loaded, INIT_TIMEOUT);
  }
  else {
    loaded();
  }
};
