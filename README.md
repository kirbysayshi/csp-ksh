csp-ksh
=======

Experiments in CSP after reading:

- http://jlongster.com/Taming-the-Asynchronous-Beast-with-CSP-in-JavaScript
- http://phuu.net/2014/08/31/csp-and-transducers.html

You probably shouldn't use this. Although there are tests, I don't fully understand CSP / transducers yet :)

Then I also read:

- http://simplectic.com/blog/2014/transducers-explained-1/
- http://jlongster.com/Transducers.js--A-JavaScript-Library-for-Transformation-of-Data

Examples
--------

See [tests.js](./tests.js). Otherwise here's an example of finding the mouse vector:

```js
var csp = require('./');
var chan = csp.chan;
var put = csp.put;
var take = csp.take;

// Create a channel with a buffer of size 2 using a sliding window strategy,
// and a single transducer that converts a mouse event into an x,y point
// object. To have a pipeline of mappers, provide an array of functions
// instead of a single function.
var ch = chan([csp.SLIDING, 2], function(event) {
  return { x: event.clientX, y: event.clientY }
});

// Built without generators, so we need our own "event loop".
(function next() {
  take(ch, function(p1) {
    take(ch, function(p2) {
      if (p1 === chan.CLOSED || p2 === chan.CLOSED) return;
      document.body.innerHTML = ''
        + '<span style="font-size: 72px; text-align: center;">'
        + (p2.x - p1.x) + ', ' + (p2.y - p1.y)
        + '</span>'
      next();
    })
  })
}())

// Put the newest event always into the channel. Technically we could
// instead creat the x,y point object here, but that doesn't show the
// mapper stuff above :)
document.body.addEventListener('mousemove', function(event) {
  put(ch, event);
}, false)
```

Why?
----

Wanted to play around, also wanted to see how small (yet practical) I could make it, transducers and all. Generators are obviously possible via transpilation, but this provides a test bed for playing around in an environment without them. Still working on the transducer part.

License
-------

MIT
