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
  debug('ch:'+ch.id, 'kick');
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
    ps();
  }

  var css = ch.consumers.slice();
  ch.consumers.length = 0;
  while(css.length) {
    debug('ch:'+ch.id, 'run:consumers', css.length)
    var cs = css.shift();
    cs();
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
function chan(type, transducers) {
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

  transducers = transducers
    ? Array.isArray(transducers)
      ? transducers
      : [transducers]
    : [function(f) { return f; }]

  return {
    id: ++chan._id,
    type: btype,
    window: bwin,
    closed: false,
    buf: [],
    consumers: [],
    producers: [],
    kicked: null,
    transducer: transducers || [function(f) { return f; }],
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

  if (ch.closed) {
  	throw new Error('Cannot PUT on a closed channel');
  }

  if (!tryput()) {
    ch.producers.push(tryput);
    kick(ch);
  }

  function tryput() {
    debug('ch:'+ch.id, 'tryput', ch.type);
	  if (ch.type == 'FIXED') {
      if (ch.buf.length < ch.window) {
        transduce();
        kick(ch);
        cb && cb(ch);
        return true;
      } else {
        ch.producers.push(tryput);
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
    var tval = val;
    for (var i = 0; i < ch.transducer.length; i++) {
      tval = ch.transducer[i](tval);
      if (tval == undefined) return;
    }
    ch.buf.push(tval);
  }
}

function take(ch, cb) {
	ch.consumers.push(trytake);
  kick(ch);

  function trytake() {
    if (ch.buf.length > 0) {
    	return cb(ch.buf.shift());
    } else if (ch.closed) {
      return cb(chan.CLOSED);
    } else {
      ch.consumers.push(trytake);
      kick(ch);
    }
  }
}