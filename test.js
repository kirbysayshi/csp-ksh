var test = require('tape');
var td = require('transducers-js');

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

test('manual transducer', function(t) {
  var ch = chan(2, function td(xform) {
    return {
      step: function(result, input) {
        return xform.step(result, input + 1);
      }
    }
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

test('closed fulfills with CLOSED', function(t) {
  t.plan(2);

  var ch = chan();

  take(ch, function(v) {
    t.equal(v, chan.CLOSED, 'took CLOSED once');
  });

  take(ch, function(v) {
    t.equal(v, chan.CLOSED, 'took CLOSED again');
  });

  close(ch);
})

test('transducers: map(normal reduction)', function(t) {
  t.plan(6)
  var ch = chan(3, td.map(inc));

  for (var i = 0; i < 6; i++) {
    put(ch, i);
  }

  for (var i = 0; i < 6; i++) {
    (function(i) {
      take(ch, function(v) {
        t.equal(v, inc(i))
        if (i == 5) t.end();
      })
    }(i))
  }

  function inc(x) { return x + 1; }
})

test('transducers: filter(input-suppressing reduction)', function(t) {
  var ch = chan(3, td.filter(even));

  put(ch, 0)
  put(ch, 1)
  put(ch, 2)
  put(ch, 3)
  put(ch, 4)
  put(ch, 5)

  take(ch, function(v) {
    t.equal(v, 0)
  })

  take(ch, function(v) {
    t.equal(v, 2)
  })

  take(ch, function(v) {
    t.equal(v, 4)
    t.end();
  })

  function even(x) { return x % 2 === 0; }
})

test('transducers: take(terminating reduction)', function(t) {
  t.plan(4);
  var ch = chan(1, td.take(3));

  put(ch, 0)
  put(ch, 1)
  put(ch, 2)
  put(ch, 3)

  take(ch, function(v) {
    t.equal(v, 0)
  })

  take(ch, function(v) {
    t.equal(v, 1)
  })

  take(ch, function(v) {
    t.equal(v, 2)
  })

  take(ch, function(v) {
    t.equal(v, chan.CLOSED)
    t.end();
  })
})

test('transducers: drop (stateful reduction)', function(t) {
  var ch = chan(1, td.drop(3));

  put(ch, 0)
  put(ch, 1)
  put(ch, 2)
  put(ch, 3)
  put(ch, 4)

  take(ch, function(v) {
    t.equal(v, 3)
  })

  take(ch, function(v) {
    t.equal(v, 4)
    t.end();
  })
})