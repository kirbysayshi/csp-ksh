var test = require('tape');

var csp = require('./');
var chan = csp.chan;
var put = csp.put;
var take = csp.take;
var close = csp.close;

test('single put', function(t) {
	var ch = chan();
  put(ch, 5, function() {
  	t.pass('put 5')
  });
  take(ch, function(val) {
    t.equal(val, 5, 'take 5');
    t.equal(ch.consumers.length, 0, 'no pending consumers');
    t.equal(ch.producers.length, 0, 'no pending producers');
    t.end();
  });
});

test('sliding', function(t) {
  t.plan(4);
  var ch = chan([csp.SLIDING, 3]);

  put(ch, 1);
  put(ch, 2);
  put(ch, 3);
  put(ch, 4);
  close(ch);

  take(ch, function(v) {
    t.equal(v, 2);
  })

  take(ch, function(v) {
    t.equal(v, 3);
  })

  take(ch, function(v) {
    t.equal(v, 4);
  })

  take(ch, function(v) {
    t.equal(v, chan.CLOSED);
    t.end();
  })
})

test('single transducer is ok', function(t) {
  var ch = chan(2, function(v) {
    return v + 1;
  });

  put(ch, 1);
  put(ch, 2);
  close(ch);

  take(ch, function(v) {
    t.equal(v, 2);
  })

  take(ch, function(v) {
    t.equal(v, 3);
  })

  take(ch, function(v) {
    t.equal(v, chan.CLOSED);
    t.end();
  })
})

test('transducers return undefined to filter', function(t) {
  var ch = chan(1, [function(val) {
  	return val + 1;
  }, function filterEven(val) {
    return val % 2 === 0
    	? val
    	: undefined;
  }]);

  // PUTs are buffered internally, so even though a buffer size of 1 is
  // specified above, these will all eventually successfully PUT. They are
  // buffered because the semantics are that they "block", but JS can't really
  // do that without generators...
	put(ch, 1, function() {
    put(ch, 2, function() {
      put(ch, 3, function() {
        put(ch, 4, function() {
          close(ch);
        });
      });
    });
  });

  take(ch, function(v) {
    t.equal(v, 2);
  })

  take(ch, function(v) {
    t.equal(v, 4);
  })

  take(ch, function(v) {
    t.equal(v, chan.CLOSED);
    t.end();
  })
})

test('daisy chain', function(t) {
  var ch1 = chan();
  var ch2 = chan();

  take(ch1, function(v) {
    put(ch2, v);
  });

  take(ch2, function(v) {
    t.equal(v, 'chain of fools');
    t.equal(ch1.consumers.length, 0, 'ch1: no pending consumers');
    t.equal(ch1.producers.length, 0, 'ch1: no pending producers');
    t.equal(ch2.consumers.length, 0, 'ch2: no pending consumers');
    t.equal(ch2.producers.length, 0, 'ch2: no pending producers');
    t.end();
  });

  put(ch1, 'chain of fools');
})

test('closed fulfills with CLOSED, throws on put', function(t) {
  t.plan(3);

  var ch = chan();

  take(ch, function(v) {
    t.equal(v, chan.CLOSED, 'took CLOSED once');
  });

  take(ch, function(v) {
    t.equal(v, chan.CLOSED, 'took CLOSED again');
  });

  close(ch);

  t.throws(function() {
    put(ch, 'heyo');
  })
})