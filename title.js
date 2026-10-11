/* Titles in Title Case (Ali, 11 Oct: "all titles must be first letter caps"). Used for lesson, part, exam, topic
   and page titles, in the teacher app and on his pages. Buttons, tags and sentences keep sentence case.
     - every main word starts with a capital: "Reciprocal Graphs, Sectors and Segments"
     - small joining words stay small unless they start the title: and, of, the, to, for, it, in, with ...
     - a trailing qualifier goes in brackets, all small: "Practice: Reciprocal Graphs (left over)", "All Organic (so far)"
     - anything in brackets stays as written
     - maths and chemistry stay as written: words with their own capitals or digits (pH, NaBH4, 3.3.8), single
       letters (x, a), function names (sin, cos, ln) and anything in LaTeX */
(function () {
  var SMALL = /^(a|an|and|as|at|but|by|for|from|if|in|into|it|nor|of|on|or|per|than|the|to|vs|via|with)$/i;
  var MATHW = /^(sin|cos|tan|sec|cosec|cot|ln|log|exp|arcsin|arccos|arctan|sinh|cosh|tanh|e|x|y|z|dx|dy)$/;
  var QUAL = /\s+\(?(left over|so far|again|continued|carried over)\)?$/i;
  function word(w, first) {
    var m = /^([^A-Za-z]*)([A-Za-z][A-Za-z'’-]*)(.*)$/.exec(w); if (!m) return w;
    var lead = m[1], core = m[2], tail = m[3];
    if (lead && /[\d\\]/.test(lead) || /\d/.test(tail)) return w;    // 3.3.8, x2, \sin
    if (/[A-Z]/.test(core.slice(1))) return w;                       // pH, NaBH, Fehling's stays
    if (!first && SMALL.test(core)) return lead + core.toLowerCase() + tail;
    if (MATHW.test(core) || core.length === 1 && !first) return w;
    return lead + core.charAt(0).toUpperCase() + core.slice(1) + tail;
  }
  function titleCase(s) {
    s = String(s == null ? "" : s).trim(); if (!s) return s;
    if (/\\\(|\\\[|\$/.test(s)) return s.charAt(0).toUpperCase() + s.slice(1);
    s = s.replace(QUAL, function (m, q) { return " (" + q.toLowerCase() + ")"; });
    var out = "", depth = 0, first = true;
    s.split(/(\s+)/).forEach(function (w) {
      if (!w || /^\s+$/.test(w)) { out += w; return; }
      var open = depth > 0 || w.charAt(0) === "(";
      depth += (w.match(/\(/g) || []).length - (w.match(/\)/g) || []).length; if (depth < 0) depth = 0;
      out += open ? w : word(w, first);
      first = /:$/.test(w);                                          // the word after "Practice:" starts again
    });
    return out;
  }
  window.titleCase = titleCase;
})();
