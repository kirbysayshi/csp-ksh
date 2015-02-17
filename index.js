var debug = require('debug')('csp-ksh');

exports.chan = chan;
exports.put = put;
exports.take = take;
exports.close = close;

exports.FIXED = 'FIXED';
exports.SLIDING = 'SLIDING';
exports.DROPPING = 'DROPPING';


// Notify the "scheduler" that the channel _probably_ has some unfinshed
// work and thus needs a future `run`.
function kick(ch) {
  debug('ch:'+ch.id, 'kick',
      'buf', ch.buf.length,
      'consumers', ch.consumers.length,
      'producers', ch.producers.length);

  if (
    !ch.kicked
    && (ch.consumers.length || ch.producers.length)
  ) {
    debug('ch:'+ch.id, 'kick:run-queued',
      'buf', ch.buf.length,
      'consumers', ch.consumers.length,
      'producers', ch.producers.length);
    ch.kicked = setTimeout(run.bind(null, ch));
  }
}

// Immediately process all producers, then consumers of the channel. Each
// list is fixed before processing, in case more of either are added while
// processing to avoid an infinite loop.
// TODO: should they both be fixed (sliced) before either are processed?
function run(ch) {
  debug('ch:'+ch.id, 'run',
    'buf', ch.buf.length,
    'consumers', ch.consumers.length,
    'producers', ch.producers.length);

  ch.kicked = null;

  var pss = ch.producers.slice();
  ch.producers.length = 0;
  while(!ch.closed && pss.length) {
    debug('ch:'+ch.id, 'run:producers', pss.length)
    var ps = pss.shift();
    var ok = ps();
    debug('ch:'+ch.id, 'run:produced', ok);
  }

  var css = ch.consumers.slice();
  ch.consumers.length = 0;
  while(css.length) {
    debug('ch:'+ch.id, 'run:consumers', css.length)
    var cs = css.shift();
    var ok = cs();
    debug('ch:'+ch.id, 'run:consumed', ok);
  }
}

// Create a new channel, with optional type (buffering strategy), optional
// buffer length, and optional transducer chain (array).
//
// chan()
//   -> 1 value, Type == FIXED ("blocking")
// chan(2)
//   -> 2 values, Type == FIXED
// chan(2, function(f) { return f })
//   -> 2 values, Type == FIXED, with transform
// chan(['DROPPING', 3])
//   -> 3 values, others will be dropped
// chan(['SLIDING', 3])
//   -> 3 values, new replace old
// chan(['SLIDING', 3], function(f) { return f % 2 === 0 ? f : undefined })
//   -> 3 values, new replace old, discard odd values
// chan(['SLIDING', 3], [function(f) { return f % 2 === 0 ? f : undefined }), function(f) { return f *2 }]
//   -> 3 values, new replace old, discard odd values, square evens
function chan(type, transducer) {
  var btype, bwin;

  if (Array.isArray(type)) {
    if (typeof type[0] !== 'string') {
      throw new Error('Invalid buffer strategy type: ' + type[0]);
    }
    btype = type[0];
    bwin = type[1];
  } else {
    btype = 'FIXED';
    bwin = type || 1;
  }

  return {
    id: ++chan._id,
    type: btype,
    window: bwin,
    closed: false,
    buf: [],
    consumers: [],
    producers: [],
    kicked: null,
    transducer: transducer ? transducer(new Xform) : new Xform,
  }
}

chan._id = 0;

// The "value" that is passed to TAKEs if this channel is closed. Probably
// could just be `null` but maybe somebody wants to pass a null.
chan.CLOSED = new (function CLOSED() {});

// Close the channel. A closed channel cannot be PUT'ed to, but TAKEs will
// receive the chan.CLOSED value.
function close(ch) {
  ch.closed = true;
  kick(ch);
}

function put(ch, val, cb) {

  return tryput();

  function tryput() {
    debug('ch:'+ch.id, 'tryput', ch.type, 'val', val);
    if (ch.type == 'FIXED') {
      if (ch.buf.length < ch.window) {
        transduce();
        kick(ch);
        cb && cb(ch);
        return true;
      } else {
        ch.producers.push(tryput);
        kick(ch);
        return false;
      }
    }
    if (ch.type == 'DROPPING') {
      if (ch.buf.length < ch.window) {
        transduce();
        kick(ch);
      }
      cb && cb(ch); // no guarantee...
      return true;
    }
    if (ch.type == 'SLIDING') {
      if (ch.buf.length == ch.window) {
        ch.buf.shift();
      }
      transduce();
      kick(ch);
      cb && cb(ch);
      return true;
    }
  }

  function transduce() {
    var reduced = ch.transducer.step(ch.buf, val);
    debug('ch:' + ch.id, 'transduce:reduced', reduced);
    if (reduced && reduced.__transducers_reduced__) {
      // transducer has finished it's reduction, implying this channel should
      // be considered closed.
      debug('ch:' + ch.id, 'transduce:closing', ch.buf);
      close(ch);
    }
  }
}

function take(ch, cb) {
  ch.consumers.push(trytake);
  kick(ch);

  function trytake() {
    debug('ch:' + ch.id, 'trytake', ch.buf);
    if (ch.buf.length > 0) {
      cb(ch.buf.shift());
      return true;
    } else if (ch.closed) {
      cb(chan.CLOSED);
      return true;
    } else {
      ch.consumers.push(trytake);
      kick(ch);
      return false;
    }
  }
}

function Xform(){}
Xform.prototype.init = function() {}
Xform.prototype.result = function(result) { return result; }
Xform.prototype.step = function(result, input) { return result.push(input); }