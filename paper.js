/* A typed exam question set out exactly like the paper it comes from (Ali, 11 Oct: "copy everything, if there are
   boxes put boxes"). Claude writes the question in exam.json "text" with these marks:
     <h4>02</h4>  <h4>02.1</h4>   AQA question / part number, drawn as the paper's boxes
     <h4>11.</h4> <h5>(a)</h5>    Edexcel question number and part label
     <p>…</p>                       one line of the paper (AQA starts each sentence on a new line)
     <p class="mk">[1 mark]</p>    marks, bold on the right   (Edexcel: <p class="mk">(2)</p>)
     <figure data-w="5.4" data-x="13.1"></figure>  where the picture goes: its width and its left edge from the
                                    text start, in em of the paper's text size, measured on the PDF (no data-x: centred)
     <ol class="mcq"><li>…</li></ol> multiple choice options A, B, C… with the paper's answer boxes
     <p class="ans">Reason</p>       an answer-space label with its line (data-unit="g" adds the unit after the line)
     <p class="note">…</p>          Claude's note to him (not part of the paper)
   Text without <h4> is not in this form and is left to the old renderer. */
(function () {
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function boxes(num) {   // "02.1" -> [0][2] . [1]
    return '<span class="pp-boxes">' + num.split("").map(function (c) { return c === "." ? '<span class="pp-dot">.</span>' : '<span class="pp-box">' + esc(c) + '</span>'; }).join("") + '</span>';
  }
  function partKey(s) { return String(s || "").toLowerCase().replace(/[^a-z0-9.]/g, ""); }   // "(a)" -> "a", "02.1" -> "02.1"
  function is(html) { return /<h4[\s>]/i.test(html || ""); }
  function render(html, subj) {
    var aqa = subj === "chem", t = document.createElement("template");
    t.innerHTML = window.DOMPurify ? DOMPurify.sanitize(html, { USE_PROFILES: { html: true } }) : esc(html);
    var rows = [], cur = null;
    function row(lab, kind) { cur = { lab: lab, kind: kind, body: [] }; rows.push(cur); }
    Array.prototype.forEach.call(t.content.childNodes, function (n) {
      if (n.nodeType !== 1) { if (n.textContent.trim()) { if (!cur) row("", ""); cur.body.push(esc(n.textContent)); } return; }
      var tag = n.tagName;
      if (tag === "H4") return row(n.textContent.trim(), "num");
      if (tag === "H5") return row(n.textContent.trim(), "part");
      if (!cur) row("", "");
      var st = n.getAttribute("style") ? ' style="' + esc(n.getAttribute("style")) + '"' : "";
      if (tag === "FIGURE") {   // data-w / data-x: width and left edge in em of the paper's own text size (11 pt AQA, 12 pt Edexcel), measured on the PDF
        var w = parseFloat(n.getAttribute("data-w")), x = parseFloat(n.getAttribute("data-x"));
        var fs = w > 0 ? ' style="width:' + w + 'em;' + (x >= 0 ? "margin-left:min(" + x + "em,calc(100% - " + w + "em))" : "margin-left:auto;margin-right:auto") + '"' : "";
        return cur.body.push('<div class="pp-fig"' + fs + '></div>');
      }
      if (tag === "OL" && n.classList.contains("mcq")) {
        var L = "ABCDEFGH";
        return cur.body.push('<div class="pp-mcq">' + Array.prototype.map.call(n.children, function (li, i) {
          return '<div class="pp-opt" data-opt="' + L[i] + '"><b class="pp-let">' + L[i] + '</b><span class="pp-otx">' + li.innerHTML + '</span><span class="pp-ob"><span class="pp-oval"></span></span></div>'; }).join("") + '</div>');
      }
      if (tag === "P" && n.classList.contains("mk")) return cur.body.push('<div class="pp-mk">' + n.innerHTML + '</div>');
      if (tag === "P" && n.classList.contains("ans")) return cur.body.push('<div class="pp-ans"' + st + '><span>' + n.innerHTML + '</span><span class="pp-rule"></span>' + (n.getAttribute("data-unit") ? '<span>' + esc(n.getAttribute("data-unit")) + '</span>' : "") + '</div>');
      if (tag === "P" && n.classList.contains("note")) return cur.body.push('<div class="pp-note">' + n.innerHTML + '</div>');
      cur.body.push('<div class="pp-l"' + st + '>' + (tag === "P" ? n.innerHTML : n.outerHTML) + '</div>');
    });
    return '<div class="pp ' + (aqa ? "aqa" : "edx") + '">' + rows.map(function (r) {
      var lab = !r.lab ? "" : aqa ? boxes(r.lab) : r.kind === "num" ? '<b>' + esc(r.lab) + '</b>' : esc(r.lab);
      return '<div class="pp-row ' + (r.kind || "cont") + '"' + (r.lab ? ' data-part="' + esc(partKey(r.lab)) + '"' : "") + '><div class="pp-lab">' + lab + '</div><div class="pp-body">' + r.body.join("") + '</div></div>';
    }).join("") + '</div>';
  }
  /* put the question's picture where <figure> was; with no slot it stays where the page put it */
  function placeFig(root) {
    var slot = root.querySelector(".pp-fig"), fig = root.querySelector(".ex-qimg, .a-qimg, .xq-fig");
    if (slot && fig) slot.appendChild(fig);
  }
  window.PaperQ = { partKey: partKey, is: is, render: render, placeFig: placeFig };
})();
