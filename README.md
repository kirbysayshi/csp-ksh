csp-ksh
=======

Experiments in CSP after reading:

- http://jlongster.com/Taming-the-Asynchronous-Beast-with-CSP-in-JavaScript
- http://phuu.net/2014/08/31/csp-and-transducers.html

You probably shouldn't use this. Although there are tests, I don't fully understand CSP / transducers yet!

Then I also read:

- http://simplectic.com/blog/2014/transducers-explained-1/
- http://jlongster.com/Transducers.js--A-JavaScript-Library-for-Transformation-of-Data

Supports:

- transducers
- buffer strategies: Sliding, Dropping, Fixed

Does not require generators!

Examples
--------

See [test.js](./test.js). Otherwise here's an example of finding the mouse vector:

[![view on requirebin](http://requirebin.com/badge.png)](http://requirebin.com/?gist=d140e4751c621e58a8d4)

```js
var td = require('transducers-js');
var csp = require('./');
var chan = csp.chan;
var put = csp.put;
var take = csp.take;

// Create a channel with a buffer of size 2 using a sliding window strategy,
// with a transducer that groups as tuples.
var ch = chan([csp.SLIDING, 2], td.partitionAll(2));

// Built without generators, so we need our own "event loop".
(function next() {
  take(ch, function(ps) {
    var p1 = ps[0];
    var p2 = ps[1];
    if (p1 === chan.CLOSED || p2 === chan.CLOSED) return;
    document.body.innerHTML = ''
      + '<span style="font-size: 72px; text-align: center;">'
      + (p2.x - p1.x) + ', ' + (p2.y - p1.y)
      + '</span>'
    next();
  })
}())

// Always put the newest event into the channel.
document.body.addEventListener('mousemove', function(event) {
  put(ch, { x: event.clientX, y: event.clientY });
}, false)
```

Why?
----

Wanted to play around, also wanted to see how small (yet practical) I could make it, transducers and all. Generators are obviously possible via transpilation, but this provides a test bed for playing around in an environment without them.

License
-------

MIT
