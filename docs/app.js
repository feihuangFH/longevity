// Interface for the Australian Longevity Calculator (static version).
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var data = null;
  var lastSeries = null, lastStart = 60;

  // Google Analytics events. Only broad categories are sent, never a postcode or any profile choice.
  function track(name, params) {
    try { if (typeof gtag === "function") gtag("event", name, params || {}); } catch (e) { /* analytics must never break the page */ }
  }
  var lastTab = null;

  var COLORS = { cohort: "#003366", period: "#CC0033", alt: "#000000" };
  var NAMES = {
    cohort: "Modelled Probability of Death (cohort)",
    period: "Modelled Probability of Death (period)",
    alt: "ALT 2015–17"
  };
  var MESSAGES = {
    notfound: "Postcode not found. Check the postcode, try a nearby one, or choose an IRSAD decile if you know it.",
    excluded: "No IRSAD is published for this postcode. Try a nearby postcode, or choose an IRSAD decile if you know it."
  };

  // ---------- tabs ----------
  var TABS = ["calculator", "about", "download", "feedback"];
  function showTab() {
    var name = (location.hash || "#calculator").slice(1);
    if (name === "explorer") name = "calculator";   // address used before the tool was renamed
    if (TABS.indexOf(name) < 0) name = "calculator";
    TABS.forEach(function (t) {
      var section = $("tab-" + t);
      if (section) section.hidden = t !== name;
    });
    Array.prototype.forEach.call(document.querySelectorAll(".tabs a"), function (a) {
      var on = a.getAttribute("data-tab") === name;
      a.classList.toggle("active", on);
      if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
    var intro = $("intro");
    if (intro) intro.hidden = name !== "calculator";
    window.scrollTo(0, 0);
    if (name !== lastTab) {
      if (lastTab !== null || name !== "calculator") track("view_tab", { tab_name: name });
      lastTab = name;
    }
    if (name === "calculator" && data) drawChart();
  }

  // ---------- inputs ----------
  function radio(name) { return document.querySelector('input[name="' + name + '"]:checked').value; }

  function readInputs() {
    return {
      gender: $("gender").value,
      geo: radio("geo_mode"),
      postcode: $("postcode").value,
      irsad: $("irsad").value,
      income: $("income").value,
      marital: $("marital").value,
      home: $("home").value,
      basis: radio("le_type"),
      start: parseInt($("startAge").value, 10)
    };
  }

  var AREA_NOTE = "IRSAD is an area-level measure of relative advantage and disadvantage. " +
    "A postcode covers many neighbourhoods, so this decile is a general guide for the whole postal area. " +
    "If you know the IRSAD decile for your own local area, the IRSAD Decile option is more accurate.";
  var BAD_NOTE = {
    notfound: "Postcode not found in ABS SEIFA 2016 Table 1. Check the postcode, try a nearby one, or use the IRSAD Decile option if you know your decile.",
    excluded: "The ABS did not publish an IRSAD for this postcode, usually because few people live there or too few census " +
      "responses were available. Please try a nearby postcode, or use the IRSAD Decile option if you know your decile."
  };

  // problem is null when the postcode was found, otherwise "notfound" or "excluded"
  function setNote(decile, problem) {
    var box = $("postcodeNote");
    box.textContent = "";
    var p1 = document.createElement("span");
    if (decile) {
      p1.appendChild(document.createTextNode("The IRSAD decile for this postcode is "));
      var s = document.createElement("strong"); s.textContent = decile; p1.appendChild(s);
      p1.appendChild(document.createTextNode("."));
    } else {
      p1.className = "bad";
      p1.textContent = BAD_NOTE[problem];
    }
    box.appendChild(p1);
    box.appendChild(document.createElement("br"));
    if (decile) box.appendChild(document.createTextNode(AREA_NOTE));
    if (decile) return;   // the switch is only offered when the postcode gave no result
    var b = document.createElement("button");
    b.type = "button"; b.className = "notebtn"; b.textContent = "Use the IRSAD Decile option";
    b.addEventListener("click", function () {
      var r = document.querySelector('input[name="geo_mode"][value="irsad"]');
      r.checked = true; r.dispatchEvent(new Event("change", { bubbles: true }));
      $("irsad").focus();
    });
    var wrap = document.createElement("div"); wrap.appendChild(b); box.appendChild(wrap);
  }

  // ---------- main update ----------
  function update() {
    if (!data) return;
    var inp = readInputs();
    $("ageValue").textContent = inp.start;
    // the page opens on an example profile, so say so until the details are changed
    $("exampleNote").hidden = !(inp.gender === "Male" && inp.geo === "postcode" && inp.postcode.trim() === "2000" &&
      inp.income === "<499" && inp.marital === "Single" && inp.home === "No" && inp.basis === "cohort" && inp.start === 60);
    $("postcodeBox").hidden = inp.geo !== "postcode";
    $("decileBox").hidden = inp.geo !== "irsad";

    var decile = inp.geo === "irsad" ? inp.irsad : LE.lookupPostcode(inp.postcode, data.postcodes);
    var problem = decile ? null : LE.postcodeProblem(inp.postcode, data.excluded);
    if (inp.geo === "postcode") setNote(decile, problem);

    if (!decile) {
      var msg = document.createElement("p");
      msg.className = "empty"; msg.textContent = MESSAGES[problem];
      $("summary").textContent = ""; $("summary").appendChild(msg);
      lastSeries = null;
      $("chart").textContent = MESSAGES[problem]; $("legend").hidden = true; $("tip").hidden = true;
      return;
    }

    var qx = data.qx[LE.profileKey(inp.gender, decile, inp.income, inp.marital, inp.home)];
    var q = inp.basis === "cohort" ? LE.cohortQx(qx, data.IF[inp.gender], inp.start) : qx;
    var r = LE.lifeExpectancy(q, inp.start);
    renderSummary(LE.summaryText(inp.start, inp.basis, r));

    // chart series: ages from the selected age up to 105
    var series = [{ id: inp.basis, pts: [] }];
    for (var i = 0; i < q.length; i++) {
      var age = LE.AGE0 + i;
      if (age >= inp.start && age <= 105) series[0].pts.push([age, q[i]]);
    }
    if (inp.basis === "period") {
      var alt = { id: "alt", pts: [] }, a = data.alt[inp.gender];
      for (var x = 0; x < a.length; x++) if (x >= inp.start && x <= 105) alt.pts.push([x, a[x]]);
      series.unshift(alt);
      series.reverse(); // model first, then ALT on top as in the R version
    }
    lastSeries = series; lastStart = inp.start;
    drawChart();
  }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function renderSummary(t) {
    var box = $("summary");
    box.textContent = "";
    // two large figures, then the full sentence underneath
    var stats = el("div", "stats");
    function stat(big, unit, caption) {
      var d = el("div", "stat"), b = el("div", "big", big);
      b.setAttribute("aria-hidden", "true");
      if (unit) b.appendChild(el("span", "unit", unit));
      var c = el("div", "cap", caption); c.setAttribute("aria-hidden", "true");
      d.appendChild(b); d.appendChild(c); return d;
    }
    stats.appendChild(stat(t.stats.years, " more years", "Life expectancy at age " + t.stats.startAge));
    stats.appendChild(stat(t.stats.endAge, "", "Age reached on average"));
    box.appendChild(stats);
    box.appendChild(el("p", "headline", t.headline));
    box.appendChild(el("p", null, t.intro));
    // three cards for the 1 in 5 / half / 1 in 5 figures
    var cards = el("div", "cards");
    t.cards.forEach(function (c) {
      var d = el("div", "card"), v = el("div", "cardval", c.value);
      v.setAttribute("aria-hidden", "true");
      d.appendChild(v); d.appendChild(el("div", "cardtxt", c.text)); cards.appendChild(d);
    });
    box.appendChild(cards);
    if (t.caveat) box.appendChild(el("p", "caveat", t.caveat));
    box.appendChild(el("p", "closing", t.note));
  }

  // ---------- chart (SVG) ----------
  var SVGNS = "http://www.w3.org/2000/svg";
  var geom = null;

  function drawChart() {
    var host = $("chart");
    if (!lastSeries) return;
    var width = Math.max(300, Math.round(host.clientWidth || host.parentNode.clientWidth - 24 || 700));
    var narrow = width < 560;
    var height = Math.round(Math.max(300, Math.min(560, width * 0.68)));
    var m = { l: narrow ? 90 : 96, r: 14, t: 48, b: 58 };
    var pw = width - m.l - m.r, ph = height - m.t - m.b;

    var ymax = 0;
    lastSeries.forEach(function (s) { s.pts.forEach(function (p) { if (p[1] > ymax) ymax = p[1]; }); });
    var yt = LE.pretty(0, ymax);
    var ylo = yt[0], yhi = yt[yt.length - 1];
    var xlo = lastStart, xhi = 105;
    var xe = 0.04 * (xhi - xlo), ye = 0.04 * (yhi - ylo);
    var ux0 = xlo - xe, ux1 = xhi + xe, uy0 = ylo - ye, uy1 = yhi + ye;
    function sx(v) { return m.l + (v - ux0) / (ux1 - ux0) * pw; }
    function sy(v) { return m.t + ph - (v - uy0) / (uy1 - uy0) * ph; }
    geom = { m: m, pw: pw, ph: ph, sx: sx, ux0: ux0, ux1: ux1, width: width, height: height };

    var xt = LE.axisTicks(xlo, xhi);
    var fs = narrow ? 12 : 15;
    var out = [];
    out.push('<svg xmlns="' + SVGNS + '" viewBox="0 0 ' + width + " " + height + '" role="img" aria-label="Line chart of the annual probability of death by age, from age ' + lastStart + ' to 105">');
    out.push('<title>Annual probability of death by age</title>');
    out.push('<text x="' + (narrow ? width / 2 : m.l + pw / 2) + '" y="26" text-anchor="middle" font-size="' + (narrow ? 16 : 20) + '" font-weight="bold" fill="#000">Annual probability of death by age</text>');
    // L-shaped box
    out.push('<path d="M' + m.l + " " + m.t + "V" + (m.t + ph) + "H" + (m.l + pw) + '" fill="none" stroke="#000" stroke-width="1"/>');
    // y axis
    yt.forEach(function (v) {
      var y = sy(v);
      out.push('<line x1="' + (m.l - 6) + '" x2="' + m.l + '" y1="' + y + '" y2="' + y + '" stroke="#000"/>');
      out.push('<text x="' + (m.l - 10) + '" y="' + (y + fs * 0.35) + '" text-anchor="end" font-size="' + fs + '" fill="#000">' + (v * 100).toFixed(2) + "%</text>");
    });
    // x axis
    xt.forEach(function (v) {
      var x = sx(v);
      out.push('<line x1="' + x + '" x2="' + x + '" y1="' + (m.t + ph) + '" y2="' + (m.t + ph + 6) + '" stroke="#000"/>');
      out.push('<text x="' + x + '" y="' + (m.t + ph + 6 + fs + 2) + '" text-anchor="middle" font-size="' + fs + '" fill="#000">' + v + "</text>");
    });
    out.push('<text x="' + (m.l + pw / 2) + '" y="' + (height - 8) + '" text-anchor="middle" font-size="' + (fs + 1) + '" fill="#000">Age</text>');
    out.push('<text transform="translate(' + (narrow ? 13 : 16) + ' ' + (m.t + ph / 2) + ') rotate(-90)" text-anchor="middle" font-size="' + (narrow ? 12 : fs + 1) + '" fill="#000">Annual probability of death (qx)</text>');
    // lines
    lastSeries.forEach(function (s) {
      var pts = s.pts.map(function (p) { return sx(p[0]).toFixed(1) + "," + sy(p[1]).toFixed(1); }).join(" ");
      out.push('<polyline points="' + pts + '" fill="none" stroke="' + COLORS[s.id] + '" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>');
    });
    // legend inside the plot on wide screens
    var legendBelow = narrow;
    if (!legendBelow) {
      lastSeries.forEach(function (s, i) {
        var y = m.t + 18 + i * 22;
        out.push('<line x1="' + (m.l + 12) + '" x2="' + (m.l + 40) + '" y1="' + y + '" y2="' + y + '" stroke="' + COLORS[s.id] + '" stroke-width="2.5"/>');
        out.push('<text x="' + (m.l + 48) + '" y="' + (y + 5) + '" font-size="15" fill="#000">' + NAMES[s.id] + "</text>");
      });
    }
    // hover guide
    out.push('<line id="guide" y1="' + m.t + '" y2="' + (m.t + ph) + '" stroke="#888" stroke-dasharray="4 3" visibility="hidden"/>');
    out.push('<rect id="hit" x="' + m.l + '" y="' + m.t + '" width="' + pw + '" height="' + ph + '" fill="transparent"/>');
    out.push("</svg>");
    host.innerHTML = out.join("");

    var lg = $("legend");
    lg.hidden = !legendBelow;
    lg.textContent = "";
    if (legendBelow) lastSeries.forEach(function (s) {
      var sp = el("span", null, NAMES[s.id]); sp.style.setProperty("--c", COLORS[s.id]); lg.appendChild(sp);
    });
    var hit = $("hit");
    hit.addEventListener("pointermove", onMove);
    hit.addEventListener("pointerdown", onMove);
    hit.addEventListener("pointerleave", hideTip);
  }

  function onMove(ev) {
    if (!geom || !lastSeries) return;
    var svg = $("chart").querySelector("svg"), box = svg.getBoundingClientRect();
    var scale = geom.width / box.width;
    var xv = geom.ux0 + ((ev.clientX - box.left) * scale - geom.m.l) / geom.pw * (geom.ux1 - geom.ux0);
    var age = Math.max(lastStart, Math.min(105, Math.round(xv)));
    var x = geom.sx(age);
    var g = $("guide"); g.setAttribute("x1", x); g.setAttribute("x2", x); g.setAttribute("visibility", "visible");
    var tip = $("tip"); tip.textContent = ""; tip.appendChild(el("b", null, "Age " + age));
    lastSeries.forEach(function (s) {
      var p = s.pts.filter(function (q) { return q[0] === age; })[0];
      if (!p) return;
      var line = el("div"); var sw = el("i"); sw.style.setProperty("--c", COLORS[s.id]);
      line.appendChild(sw); line.appendChild(document.createTextNode((p[1] * 100).toFixed(2) + "%"));
      tip.appendChild(line);
    });
    tip.hidden = false;
    var wrap = $("chart").parentNode.getBoundingClientRect();
    var left = x / scale + box.left - wrap.left + 12;
    if (left + tip.offsetWidth > wrap.width - 4) left = left - tip.offsetWidth - 24;
    tip.style.left = Math.max(4, left) + "px";
    tip.style.top = (geom.m.t / scale + box.top - wrap.top + 8) + "px";
  }
  function hideTip() {
    var g = $("guide"); if (g) g.setAttribute("visibility", "hidden");
    $("tip").hidden = true;
  }

  // ---------- start up ----------
  function init() {
    var sel = $("irsad");
    for (var d = 1; d <= 10; d++) {
      var o = document.createElement("option"); o.value = o.textContent = "D" + d; sel.appendChild(o);
    }
    sel.value = "D5";

    // age slider: a tick for every year, a label every five years, and one-year step buttons
    var ticks = $("ageTicks"), rng = $("startAge");
    var lo = +rng.min, hi = +rng.max, thumb = 26;
    for (var a = lo; a <= hi; a++) {
      var pos = "calc(" + (thumb / 2) + "px + (100% - " + thumb + "px) * " + ((a - lo) / (hi - lo)) + ")";
      var t = document.createElement("i");
      t.style.left = pos;
      if (a % 5 === 0) {
        t.className = "major";
        var lab = document.createElement("b"); lab.textContent = a; lab.style.left = pos; ticks.appendChild(lab);
      }
      ticks.appendChild(t);
    }
    function paintSlider() { rng.parentNode.style.setProperty("--pct", "calc(" + (thumb / 2) + "px + (100% - " + thumb + "px) * " + ((rng.value - lo) / (hi - lo)) + ")"); }
    rng.addEventListener("input", paintSlider);
    // The age is reported once the slider has been still for a moment, not on every step of a drag
    var ageTimer;
    function trackAge() {
      clearTimeout(ageTimer);
      ageTimer = setTimeout(function () { track("select_start_age", { start_age: +rng.value }); }, 800);
    }
    rng.addEventListener("input", trackAge);
    function stepAge(d) { var v = Math.max(lo, Math.min(hi, +rng.value + d)); if (v !== +rng.value) { rng.value = v; paintSlider(); update(); trackAge(); } }
    $("ageDown").addEventListener("click", function () { stepAge(-1); });
    $("ageUp").addEventListener("click", function () { stepAge(1); });
    paintSlider();

    ["gender", "irsad", "income", "marital", "home", "startAge", "postcode"].forEach(function (id) {
      $(id).addEventListener("input", update);
    });
    Array.prototype.forEach.call(document.querySelectorAll('input[type="radio"]'), function (r) {
      r.addEventListener("change", function () {
        if (r.name === "le_type") track("select_basis", { basis: r.value });
        if (r.name === "geo_mode") track("select_area_mode", { area_mode: r.value === "irsad" ? "irsad_decile" : "postcode" });
        update();
      });
    });
    document.addEventListener("click", function (e) {
      var a = e.target.closest ? e.target.closest("[data-track]") : null;
      if (a) track(a.getAttribute("data-track"));
    });
    Array.prototype.forEach.call(document.querySelectorAll(".infobtn"), function (b) {
      b.addEventListener("click", function (e) {
        e.preventDefault();
        var box = $(b.getAttribute("aria-controls"));
        box.hidden = !box.hidden;
        b.setAttribute("aria-expanded", String(!box.hidden));
      });
    });
    $("impactBtn").addEventListener("click", function () { location.hash = "#feedback"; });
    $("skipToResult").addEventListener("click", function () {
      $("summaryHeading").scrollIntoView({ behavior: "smooth", block: "start" });
    });
    var timer;
    window.addEventListener("resize", function () { clearTimeout(timer); timer = setTimeout(drawChart, 120); });
    showTab();
    update();
  }

  window.addEventListener("hashchange", showTab);
  fetch("data.json?v=20261005b").then(function (r) {
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.json();
  }).then(function (d) { data = d; init(); }).catch(function () {
    showTab();
    $("summary").textContent = "The data could not be loaded. Please check your connection and reload the page.";
  });
})();
