// Couple calculator tab. Builds its own form, and uses the calculations in core.js.
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var data = null, helpers = null;
  var SVGNS = "http://www.w3.org/2000/svg";
  var COLORS = { last: "#003366", both: "#7a7a7a", a: "#CC0033", b: "#E69F00" };
  var NAMES = { last: "At least one of you alive", both: "Both of you alive", a: "You", b: "Your partner" };
  var MESSAGES = {
    notfound: "Postcode not found. Check the postcode, try a nearby one, or choose an IRSAD decile if you know it.",
    excluded: "No IRSAD is published for this postcode. Try a nearby postcode, or choose an IRSAD decile if you know it."
  };
  var series = null, geom = null, lastN = 0, built = false;

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function select(id, options) {
    var s = el("select"); s.id = id;
    options.forEach(function (o) { var op = el("option", null, o[1]); op.value = o[0]; s.appendChild(op); });
    return s;
  }
  function field(labelText, control, infoFrom) {
    var d = el("div", "field"), l = el("label"); l.setAttribute("for", control.id);
    l.appendChild(document.createTextNode(labelText));
    if (infoFrom) {
      var src = document.querySelector("label[for=" + infoFrom + "] a.info");
      if (src) { l.appendChild(document.createTextNode(" ")); l.appendChild(src.cloneNode(true)); }
    }
    d.appendChild(l); d.appendChild(control); return d;
  }
  function radioGroup(name, legend, items, checked) {
    var fs = el("fieldset", "field"), lg = el("legend", null, legend); fs.appendChild(lg);
    items.forEach(function (it) {
      var lab = el("label", "radio inline"), r = el("input"); r.type = "radio"; r.name = name; r.value = it[0];
      if (it[0] === checked) r.checked = true;
      lab.appendChild(r); lab.appendChild(document.createTextNode(" " + it[1])); fs.appendChild(lab);
    });
    return fs;
  }
  function radioVal(name) { var r = document.querySelector('input[name="' + name + '"]:checked'); return r ? r.value : null; }

  // ---------- age slider, same look as the main page ----------
  function ageSlider(id, value) {
    var wrap = el("div", "field"), lab = el("label"); lab.setAttribute("for", id);
    lab.appendChild(document.createTextNode("Age: ")); var val = el("strong", null, String(value)); val.id = id + "_v"; lab.appendChild(val);
    var sl = el("div", "slider"), down = el("button", "step", "−"), box = el("div", "sliderbox"), up = el("button", "step", "+");
    down.type = up.type = "button"; down.setAttribute("aria-label", "One year younger"); up.setAttribute("aria-label", "One year older");
    var rng = el("input"); rng.type = "range"; rng.id = id; rng.min = 60; rng.max = 90; rng.step = 1; rng.value = value;
    var ticks = el("div", "ticks"); ticks.setAttribute("aria-hidden", "true");
    var lo = 60, hi = 90, thumb = 26;
    for (var a = lo; a <= hi; a++) {
      var pos = "calc(" + (thumb / 2) + "px + (100% - " + thumb + "px) * " + ((a - lo) / (hi - lo)) + ")";
      var t = el("i"); t.style.left = pos;
      if (a % 5 === 0) { t.className = "major"; var lb = el("b", null, String(a)); lb.style.left = pos; ticks.appendChild(lb); }
      ticks.appendChild(t);
    }
    function paint() {
      box.style.setProperty("--pct", "calc(" + (thumb / 2) + "px + (100% - " + thumb + "px) * " + ((rng.value - lo) / (hi - lo)) + ")");
      val.textContent = rng.value;
    }
    rng.addEventListener("input", paint);
    function step(d) { var v = Math.max(lo, Math.min(hi, +rng.value + d)); if (v !== +rng.value) { rng.value = v; paint(); update(); } }
    down.addEventListener("click", function () { step(-1); }); up.addEventListener("click", function () { step(1); });
    box.appendChild(rng); box.appendChild(ticks); sl.appendChild(down); sl.appendChild(box); sl.appendChild(up);
    wrap.appendChild(lab); wrap.appendChild(sl); paint();
    wrap._paint = paint;
    return wrap;
  }

  function areaBlock(p) {
    var box = el("div");
    box.appendChild(radioGroup("c_geo_" + p, "Area socio-economic measure (IRSAD) from:",
      [["irsad", "IRSAD Decile"], ["postcode", "Postcode"]], "postcode"));
    var pcWrap = el("div", "field"), pcLab = el("label", null, "Postcode"); pcLab.setAttribute("for", "c_pc_" + p);
    var pc = el("input"); pc.type = "text"; pc.id = "c_pc_" + p; pc.value = "2000"; pc.setAttribute("inputmode", "numeric"); pc.maxLength = 12;
    var note = el("div", "note"); note.id = "c_pcnote_" + p; note.setAttribute("aria-live", "polite");
    pcWrap.id = "c_pcbox_" + p; pcWrap.appendChild(pcLab); pcWrap.appendChild(pc); pcWrap.appendChild(note);
    var dec = select("c_dec_" + p, []); for (var d = 1; d <= 10; d++) { var o = el("option", null, "D" + d); o.value = "D" + d; dec.appendChild(o); }
    dec.value = "D5";
    var decWrap = field("IRSAD Decile", dec); decWrap.id = "c_decbox_" + p; decWrap.hidden = true;
    box.appendChild(pcWrap); box.appendChild(decWrap); return box;
  }

  function personPanel(p, title) {
    var well = el("div", "well"), h = el("h4", null, title); well.appendChild(h);
    well.appendChild(ageSlider("c_age_" + p, 65));
    well.appendChild(field("Sex", select("c_sex_" + p, [["Male", "Male"], ["Female", "Female"]]), "gender"));
    if (p === "b") {
      var same = el("div", "field"), lab = el("label", "radio"), cb = el("input"); cb.type = "checkbox"; cb.id = "c_same"; cb.checked = true;
      lab.appendChild(cb); lab.appendChild(document.createTextNode(" We live in the same home")); same.appendChild(lab);
      var hint = el("div", "note", "Your partner then shares your area and home ownership."); same.appendChild(hint);
      well.appendChild(same);
    }
    var homeBits = el("div"); homeBits.id = "c_homebits_" + p;
    homeBits.appendChild(areaBlock(p));
    homeBits.appendChild(field("Home Ownership", select("c_home_" + p, [["No", "No"], ["Yes", "Yes (outright or mortgage)"], ["missing", "missing"]]), "home"));
    well.appendChild(homeBits);
    var incField = field("Total Personal Weekly Income", select("c_inc_" + p,
      [["<499", "<$499"], ["500-999", "$500–$999"], ["1000+", "$1,000+"], ["missing", "missing"]]), "income");
    incField.appendChild(el("p", "note", "Weekly income from all sources before tax, including government pensions and allowances such as the age pension, income from superannuation, and investment, rent and business income."));
    well.appendChild(incField);
    well.appendChild(field("Marital Status", select("c_mar_" + p, [["Single", "Not currently married"], ["Married", "Married"]]), "marital"));
    return well;
  }

  var DEFAULTS = {
    a: { age: 65, sex: "Male", inc: "<499", mar: "Married", home: "Yes", geo: "postcode", pc: "2000" },
    b: { age: 65, sex: "Female", inc: "<499", mar: "Married" }
  };

  function build() {
    var host = $("c_form"); host.textContent = "";
    host.appendChild(personPanel("a", "You")); host.appendChild(personPanel("b", "Your partner"));
    $("c_sex_b").value = "Female"; $("c_home_a").value = "Yes"; $("c_home_b").value = "Yes";
    ["a", "b"].forEach(function (p) { $("c_mar_" + p).value = "Married"; });

    var basis = $("c_basis_host"); basis.textContent = "";
    var fs = el("fieldset", "field"), lg = el("legend", null, "Type of Life Expectancy:"); fs.appendChild(lg);
    [["cohort", "With future mortality improvements (cohort)",
      "Life expectancy calculated from 2016–2017 mortality rates, adjusted for the Australian Government Actuary's assumed future mortality improvements, based on the long-term (125-year) trend in Australian death rates. It is anchored to the 2016 base year of the data. A person of the selected age is treated as if they were that age in 2016, and assumed future mortality improvements are applied to the years that follow. Any change in mortality between 2016 and today is not included."],
     ["period", "Using 2016–2017 mortality rates only (period)",
      "Life expectancy calculated from mortality rates observed during 2016–2017, assuming these rates remain unchanged in future."]]
      .forEach(function (it) {
        var d = el("div", "radio"), lab = el("label"), r = el("input"); r.type = "radio"; r.name = "c_basis"; r.value = it[0]; if (it[0] === "cohort") r.checked = true;
        lab.appendChild(r); lab.appendChild(document.createTextNode(" " + it[1]));
        var b = el("button", "infobtn", "ⓘ"); b.type = "button"; b.setAttribute("aria-expanded", "false"); b.setAttribute("aria-label", "About the " + it[0] + " basis");
        var tx = el("div", "infotext", it[2]); tx.hidden = true; tx.id = "c_info_" + it[0]; b.setAttribute("aria-controls", tx.id);
        b.addEventListener("click", function (e) { e.preventDefault(); tx.hidden = !tx.hidden; b.setAttribute("aria-expanded", String(!tx.hidden)); });
        d.appendChild(lab); d.appendChild(b); d.appendChild(tx); fs.appendChild(d);
      });
    basis.appendChild(el("div", "well")); basis.firstChild.appendChild(fs);

    host.addEventListener("input", update); host.addEventListener("change", update);
    basis.addEventListener("change", update);
    $("c_skip").addEventListener("click", function () { $("c_summaryHeading").scrollIntoView({ behavior: "smooth", block: "start" }); });
    var timer; window.addEventListener("resize", function () { clearTimeout(timer); timer = setTimeout(drawChart, 120); });
    built = true;
  }

  // ---------- reading the form ----------
  function readPerson(p, sameHomeWith) {
    var o = { age: +$("c_age_" + p).value, gender: $("c_sex_" + p).value, income: $("c_inc_" + p).value, marital: $("c_mar_" + p).value };
    if (sameHomeWith) { o.home = sameHomeWith.home; o.area = sameHomeWith.area; }
    else {
      o.home = $("c_home_" + p).value;
      var mode = radioVal("c_geo_" + p), pcText = $("c_pc_" + p).value;
      o.area = { mode: mode, postcode: pcText, decile: $("c_dec_" + p).value };
    }
    return o;
  }
  function resolveArea(area) {
    if (area.mode === "irsad") return { decile: area.decile };
    var d = LE.lookupPostcode(area.postcode, data.postcodes);
    return d ? { decile: d } : { problem: LE.postcodeProblem(area.postcode, data.excluded) };
  }

  function setNote(p, res, area) {
    var box = $("c_pcnote_" + p); box.textContent = "";
    if (area.mode !== "postcode") return;
    var s = el("span", res.problem ? "bad" : null);
    if (res.problem) {
      s.textContent = res.problem === "excluded"
        ? "The ABS did not publish an IRSAD for this postcode, usually because few people live there or too few census responses were available. Please try a nearby postcode, or use the IRSAD Decile option if you know your decile."
        : "Postcode not found in ABS SEIFA 2016 Table 1. Check the postcode, try a nearby one, or use the IRSAD Decile option if you know your decile.";
      box.appendChild(s);
    } else {
      s.appendChild(document.createTextNode("The IRSAD decile for this postcode is ")); s.appendChild(el("strong", null, res.decile)); s.appendChild(document.createTextNode("."));
      box.appendChild(s); box.appendChild(document.createElement("br"));
      box.appendChild(document.createTextNode("A postcode covers many neighbourhoods, so this decile is a general guide for the whole postal area."));
    }
  }

  function curveFor(p, basis, decile, home) {
    var qx = data.qx[LE.profileKey(p.gender, decile, p.income, p.marital, home)];
    var q = basis === "cohort" ? LE.cohortQx(qx, data.IF[p.gender], p.age) : qx;
    return LE.survivalCurve(q, p.age);
  }

  function isExample(a, b, basis, sameHome) {
    var A = DEFAULTS.a, B = DEFAULTS.b;
    return a.age === A.age && a.gender === A.sex && a.income === A.inc && a.marital === A.mar && a.home === A.home &&
      a.area.mode === A.geo && a.area.postcode.trim() === A.pc &&
      b.age === B.age && b.gender === B.sex && b.income === B.inc && b.marital === B.mar && sameHome && basis === "cohort";
  }

  // ---------- main update ----------
  function update() {
    if (!built || !data) return;
    var sameHome = $("c_same").checked, basis = radioVal("c_basis");
    $("c_homebits_b").hidden = sameHome;
    var a = readPerson("a"), aArea = resolveArea(a.area);
    setNote("a", aArea, a.area);
    var b = readPerson("b", sameHome ? { home: a.home, area: a.area } : null), bArea = sameHome ? aArea : resolveArea(b.area);
    if (!sameHome) { setNote("b", bArea, b.area); }
    ["a", "b"].forEach(function (p) {
      var mode = p === "a" ? a.area.mode : (sameHome ? "irsad" : b.area.mode);
      $("c_pcbox_" + p).hidden = mode !== "postcode"; $("c_decbox_" + p).hidden = mode !== "irsad";
    });
    $("c_example").hidden = !isExample(a, b, basis, sameHome);

    var problems = [];
    if (aArea.problem) problems.push((sameHome ? "Postcode for you and your partner. " : "Your postcode. ") + MESSAGES[aArea.problem]);
    if (!sameHome && bArea.problem) problems.push("Your partner's postcode. " + MESSAGES[bArea.problem]);
    if (problems.length) {
      var box = $("c_summary"); box.textContent = "";
      problems.forEach(function (m) { box.appendChild(el("p", "empty", m)); });
      series = null; $("c_chart").textContent = problems[0]; $("c_legend").hidden = true; $("c_tip").hidden = true;
      return;
    }
    var SA = curveFor(a, basis, aArea.decile, a.home), SB = curveFor(b, basis, bArea.decile, b.home);
    var res = LE.coupleResults(SA, SB);
    renderSummary(LE.coupleText(a.age, b.age, basis, res));

    var c = res.curves, N = c.last.length - 1;
    while (N > 1 && c.last[N] < 0.0005) N--;
    function pts(S) { var o = []; for (var t = 0; t <= N; t++) o.push([t, t < S.length ? S[t] : 0]); return o; }
    series = [{ id: "last", pts: pts(c.last) }, { id: "both", pts: pts(c.both) }, { id: "a", pts: pts(SA) }, { id: "b", pts: pts(SB) }];
    lastN = N; geom = { ageA: a.age, ageB: b.age };
    drawChart();
  }

  function renderSummary(t) {
    var box = $("c_summary"); box.textContent = "";
    var stats = el("div", "stats");
    t.stats.forEach(function (s) {
      var d = el("div", "stat"), b = el("div", "big", s.big); b.setAttribute("aria-hidden", "true");
      if (s.unit) b.appendChild(el("span", "unit", s.unit));
      var c = el("div", "cap", s.cap); c.setAttribute("aria-hidden", "true"); d.appendChild(b); d.appendChild(c); stats.appendChild(d);
    });
    box.appendChild(stats);
    box.appendChild(el("p", "headline", t.headline));
    box.appendChild(el("p", null, t.intro));
    var cards = el("div", "cards");
    t.cards.forEach(function (c) {
      var d = el("div", "card"), v = el("div", "cardval", c.value); v.setAttribute("aria-hidden", "true"); v.appendChild(el("span", "unit", c.unit));
      d.appendChild(v); var tx = el("div", "cardtxt", c.text); tx.appendChild(el("span", "cardages", " " + c.ages)); d.appendChild(tx); cards.appendChild(d);
    });
    box.appendChild(cards);
    if (t.caveat) box.appendChild(el("p", "caveat", t.caveat));
    if (t.limits) {
      var lp = el("p", "limits"); lp.appendChild(el("strong", null, "Limitations. ")); lp.appendChild(document.createTextNode(t.limits + " "));
      var lk = el("button", "notebtn", "See the About page for details."); lk.type = "button"; lk.setAttribute("data-goto", "limitations"); lp.appendChild(lk); box.appendChild(lp);
    }
    box.appendChild(el("p", "closing", t.note));
  }

  // ---------- chart: chance of being alive, by years from now ----------
  function drawChart() {
    var host = $("c_chart"); if (!series) return;
    var width = Math.max(300, Math.round(host.clientWidth || (host.parentNode.clientWidth - 24) || 700));
    var narrow = width < 560, height = Math.round(Math.max(300, Math.min(520, width * 0.62)));
    var m = { l: narrow ? 56 : 66, r: 16, t: 46, b: 58 }, pw = width - m.l - m.r, ph = height - m.t - m.b;
    var N = lastN, ext = 0.04 * N, ux0 = -ext, ux1 = N + ext, uy0 = -0.04, uy1 = 1.04;
    function sx(v) { return m.l + (v - ux0) / (ux1 - ux0) * pw; }
    function sy(v) { return m.t + ph - (v - uy0) / (uy1 - uy0) * ph; }
    window.__cgeom = { m: m, pw: pw, ph: ph, sx: sx, ux0: ux0, ux1: ux1, width: width, N: N };
    var fs = narrow ? 12 : 15, out = [];
    out.push('<svg xmlns="' + SVGNS + '" viewBox="0 0 ' + width + " " + height + '" role="img" aria-label="Chart of the chance that you, your partner, at least one of you, or both of you are alive, by years from the ages entered">');
    out.push("<title>Chance of being alive over time</title>");
    out.push('<text x="' + (narrow ? width / 2 : m.l + pw / 2) + '" y="26" text-anchor="middle" font-size="' + (narrow ? 16 : 20) + '" font-weight="bold" fill="#000">Chance of being alive over time</text>');
    out.push('<path d="M' + m.l + " " + m.t + "V" + (m.t + ph) + "H" + (m.l + pw) + '" fill="none" stroke="#000"/>');
    [0, 0.2, 0.4, 0.6, 0.8, 1].forEach(function (v) {
      var y = sy(v);
      out.push('<line x1="' + (m.l - 6) + '" x2="' + m.l + '" y1="' + y + '" y2="' + y + '" stroke="#000"/>');
      out.push('<line x1="' + m.l + '" x2="' + (m.l + pw) + '" y1="' + y + '" y2="' + y + '" stroke="#e6e6e6"/>');
      out.push('<text x="' + (m.l - 10) + '" y="' + (y + fs * 0.35) + '" text-anchor="end" font-size="' + fs + '" fill="#000">' + Math.round(v * 100) + "%</text>");
    });
    LE.axisTicks(0, N).forEach(function (v) {
      var x = sx(v);
      out.push('<line x1="' + x + '" x2="' + x + '" y1="' + (m.t + ph) + '" y2="' + (m.t + ph + 6) + '" stroke="#000"/>');
      out.push('<text x="' + x + '" y="' + (m.t + ph + 6 + fs + 2) + '" text-anchor="middle" font-size="' + fs + '" fill="#000">' + v + "</text>");
    });
    out.push('<text x="' + (m.l + pw / 2) + '" y="' + (height - 8) + '" text-anchor="middle" font-size="' + (fs + 1) + '" fill="#000">Years from the ages entered</text>');
    series.forEach(function (s) {
      var pts = s.pts.map(function (p) { return sx(p[0]).toFixed(1) + "," + sy(p[1]).toFixed(1); }).join(" ");
      var dash = s.id === "both" ? ' stroke-dasharray="6 4"' : "", w = s.id === "last" ? 3.5 : 2.5;
      out.push('<polyline points="' + pts + '" fill="none" stroke="' + COLORS[s.id] + '" stroke-width="' + w + '"' + dash + ' stroke-linejoin="round" stroke-linecap="round"/>');
    });
    var legendBelow = narrow;
    if (!legendBelow) series.forEach(function (s, i) {
      var y = m.t + ph - 16 - (series.length - 1 - i) * 22, dash = s.id === "both" ? ' stroke-dasharray="6 4"' : "";
      out.push('<line x1="' + (m.l + 14) + '" x2="' + (m.l + 42) + '" y1="' + y + '" y2="' + y + '" stroke="' + COLORS[s.id] + '" stroke-width="2.5"' + dash + "/>");
      out.push('<text x="' + (m.l + 50) + '" y="' + (y + 5) + '" font-size="15" fill="#000">' + NAMES[s.id] + "</text>");
    });
    out.push('<line id="c_guide" y1="' + m.t + '" y2="' + (m.t + ph) + '" stroke="#888" stroke-dasharray="4 3" visibility="hidden"/>');
    out.push('<rect id="c_hit" x="' + m.l + '" y="' + m.t + '" width="' + pw + '" height="' + ph + '" fill="transparent"/></svg>');
    host.innerHTML = out.join("");
    var lg = $("c_legend"); lg.hidden = !legendBelow; lg.textContent = "";
    if (legendBelow) series.forEach(function (s) { var sp = el("span", null, NAMES[s.id]); sp.style.setProperty("--c", COLORS[s.id]); lg.appendChild(sp); });
    var hit = $("c_hit"); hit.addEventListener("pointermove", onMove); hit.addEventListener("pointerdown", onMove); hit.addEventListener("pointerleave", hideTip);
  }

  function onMove(ev) {
    var g = window.__cgeom; if (!g || !series) return;
    var svg = $("c_chart").querySelector("svg"), box = svg.getBoundingClientRect(), scale = g.width / box.width;
    var xv = g.ux0 + ((ev.clientX - box.left) * scale - g.m.l) / g.pw * (g.ux1 - g.ux0);
    var t = Math.max(0, Math.min(g.N, Math.round(xv))), x = g.sx(t);
    var gd = $("c_guide"); gd.setAttribute("x1", x); gd.setAttribute("x2", x); gd.setAttribute("visibility", "visible");
    var tip = $("c_tip"); tip.textContent = "";
    tip.appendChild(el("b", null, "In " + t + " years"));
    tip.appendChild(el("div", null, "You " + LE.ageLabel(geom.ageA + t) + ", partner " + LE.ageLabel(geom.ageB + t)));
    series.forEach(function (s) {
      var line = el("div"), sw = el("i"); sw.style.setProperty("--c", COLORS[s.id]); line.appendChild(sw);
      line.appendChild(document.createTextNode(NAMES[s.id] + " " + (s.pts[t][1] * 100).toFixed(0) + "%")); tip.appendChild(line);
    });
    tip.hidden = false;
    var wrap = $("c_chart").parentNode.getBoundingClientRect(), left = x / scale + box.left - wrap.left + 12;
    if (left + tip.offsetWidth > wrap.width - 4) left = left - tip.offsetWidth - 24;
    tip.style.left = Math.max(4, left) + "px"; tip.style.top = (g.m.t / scale + box.top - wrap.top + 8) + "px";
  }
  function hideTip() { var g = $("c_guide"); if (g) g.setAttribute("visibility", "hidden"); $("c_tip").hidden = true; }

  // copy the choices made on the main calculator into the "You" side
  function prefill(main) {
    if (!built || !main) return;
    function setv(id, v) { var e = $(id); if (e) e.value = v; }
    setv("c_age_a", main.start);
    $("c_age_a").dispatchEvent(new Event("input", { bubbles: true }));
    setv("c_sex_a", main.gender); setv("c_inc_a", main.income); setv("c_home_a", main.home); setv("c_mar_a", "Married");
    setv("c_pc_a", main.postcode); setv("c_dec_a", main.irsad);
    var g = document.querySelector('input[name="c_geo_a"][value="' + main.geo + '"]'); if (g) g.checked = true;
    var b = document.querySelector('input[name="c_basis"][value="' + main.basis + '"]'); if (b) b.checked = true;
    update();
  }

  window.Couple = {
    init: function (d, h) { data = d; helpers = h; build(); update(); },
    show: function () { if (built) { update(); } },
    prefill: prefill
  };
})();
