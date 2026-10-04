// Calculation core for the Australian Longevity Explorer (static version).
// Pure functions only, so that the same code runs in the browser and in Node tests.
// The logic mirrors app/app.R (the R version) step for step.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.LE = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var AGE0 = 60; // first age in the data tables (table runs 60 to 110)

  function profileKey(gender, irsad, income, marital, home) {
    return [gender, irsad, income, marital, home].join("|");
  }

  // Cohort qx for a person who is startAge in 2016: q * (1 + IF/100)^k, k = age - startAge.
  // qx and imp are aligned with ages AGE0, AGE0 + 1, ...
  function cohortQx(qx, imp, startAge) {
    return qx.map(function (q, i) {
      return q * Math.pow(1 + imp[i] / 100, AGE0 + i - startAge);
    });
  }

  // Life expectancy and the ages at which 20%, 50% and 80% have died, from a qx vector
  // that starts at AGE0. Complete expectation of life is sum(kpx) + 0.5.
  function lifeExpectancy(qx, startAge) {
    var from = startAge - AGE0;
    var q = qx.slice(from);
    var n = q.length;
    var S = new Array(n + 1);
    var ages = new Array(n + 1);
    S[0] = 1;
    ages[0] = startAge;
    var kpx = 1, sum = 0;
    for (var i = 0; i < n; i++) {
      kpx = kpx * (1 - q[i]);
      sum += kpx;
      S[i + 1] = kpx;
      ages[i + 1] = startAge + i + 1;
    }
    function quantile(pDie) {
      var target = 1 - pDie;
      var idx = -1;
      for (var j = 0; j <= n; j++) { if (S[j] <= target) { idx = j; break; } }
      if (idx < 0) return NaN;
      if (idx === 0) return ages[0];
      var S1 = S[idx - 1], S2 = S[idx], a1 = ages[idx - 1], a2 = ages[idx];
      return a1 + (S1 - target) / (S1 - S2) * (a2 - a1);
    }
    return { ex: sum + 0.5, q20: quantile(0.2), q50: quantile(0.5), q80: quantile(0.8) };
  }

  function one(x) { return x.toFixed(1); }
  function round1(x) { return Math.round(x * 10) / 10; }

  var YRS = "2016–2017";

  var BASIS_NOTE = {
    cohort: "These figures use the cohort basis. They are calculated from " + YRS +
      " mortality rates, adjusted for the Australian Government Actuary's assumed future mortality " +
      "improvements, based on the long-term (125-year) trend in Australian death rates.",
    period: "These figures use the period basis. They are calculated from mortality rates observed during " +
      YRS + ", assuming these rates remain unchanged in future."
  };

  function dieLine(share, a) {
    if (a >= 100) return "Fewer than " + share + " die before age 100";
    if (round1(a) >= 100) return "About " + share + " die before age 100";
    return "About " + share + " die before age " + one(a);
  }
  function liveLine(share, a) {
    if (a >= 100) return "At least " + share + " live to age 100 or older";
    if (round1(a) >= 100) return "About " + share + " live to age 100 or older";
    return "About " + share + " live beyond age " + one(a);
  }

  // The text of the summary box, as plain strings.
  function summaryText(startAge, basis, r) {
    return {
      headline: "At age " + startAge + ", life expectancy is about " + one(r.ex) +
        " more years, reaching age " + one(startAge + r.ex) + " on average.",
      intro: "Life expectancy is an average, and ages at death vary widely. The figures below describe " +
        "every 100 people with these characteristics who are alive at age " + startAge + ".",
      bullets: [dieLine("1 in 5", r.q20), dieLine("half", r.q50), liveLine("1 in 5", r.q80)],
      caveat: (r.q50 >= 100 || r.q80 >= 100)
        ? "The data used extend only to age 100. Results beyond that rely more heavily on modelling " +
          "assumptions and should be treated with caution."
        : null,
      note: "This describes a group of people with the selected characteristics, not a prediction for " +
        "any one person. " + BASIS_NOTE[basis]
    };
  }

  // Postcode handling, as in the R app: first run of digits, padded to 4 digits.
  // Returns the decile as "D1".."D10", or null when the postcode is not in the table.
  function lookupPostcode(input, postcodes) {
    var m = /\d+/.exec(input == null ? "" : String(input));
    if (!m) return null;
    var n = parseInt(m[0], 10);
    if (!isFinite(n) || n > 2147483647) return null;
    var pc = String(n);
    while (pc.length < 4) pc = "0" + pc;
    var d = postcodes[pc];
    return d == null ? null : "D" + d;
  }

  // Port of R's R_pretty (src/appl/pretty.c). mode "pretty" gives pretty(); mode "axis"
  // gives the tick positions used by base graphics axes (GEPretty).
  function rPretty(lo, up, ndiv, mode) {
    var h, h5, fmin, minN, shrink;
    if (mode === "axis") { h = 0.8; h5 = 1.7; fmin = 1.125; minN = 1; shrink = 0.25; }
    else { h = 1.5; h5 = 0.5 + 1.5 * h; fmin = 1 / 1048576; minN = Math.floor(ndiv / 3); shrink = 0.75; }
    var EPS = 2.220446049250313e-16, rounding = 1e-10;
    var dx = up - lo, cell, small;
    if (dx === 0 && up === 0) { cell = 1; small = true; }
    else {
      cell = Math.max(Math.abs(lo), Math.abs(up));
      var U = 1 + ((h5 >= 1.5 * h + 0.5) ? 1 / (1 + h) : 1.5 / (1 + h5));
      U *= Math.max(1, ndiv) * EPS;
      small = dx < cell * U * 3;
    }
    if (small) {
      if (cell > 10) cell = 9 + cell / 10;
      cell *= shrink;
      if (minN > 1) cell /= minN;
    } else {
      cell = dx;
      if (ndiv > 1) cell /= ndiv;
    }
    var base = Math.pow(10, Math.floor(Math.log10(cell)));
    var unit = base, ns;
    if ((ns = 2 * base) - cell < h * (cell - unit)) { unit = ns;
      if ((ns = 5 * base) - cell < h5 * (cell - unit)) { unit = ns;
        if ((ns = 10 * base) - cell < h * (cell - unit)) unit = ns; } }
    ns = Math.floor(lo / unit + rounding);
    var nu = Math.ceil(up / unit - rounding);
    while (ns * unit > lo + rounding * unit) ns--;
    while (nu * unit < up - rounding * unit) nu++;
    var k = Math.floor(0.5 + nu - ns);
    if (k < minN) {
      k = minN - k;
      if (ns >= 0) { nu += Math.floor(k / 2); ns -= Math.floor(k / 2) + (k % 2); }
      else { ns -= Math.floor(k / 2); nu += Math.floor(k / 2) + (k % 2); }
    }
    return { unit: unit, ns: ns, nu: nu };
  }

  // Same as R's pretty(c(lo, hi)) (n = 5): the tick values.
  function pretty(lo, hi) {
    var p = rPretty(lo, hi, 5, "pretty");
    var out = [];
    for (var i = p.ns; i <= p.nu + 1e-9; i++) out.push(+(i * p.unit).toPrecision(12));
    return out;
  }

  // Tick positions R would draw on an axis for the limits [lo, hi] with the default 4%
  // extension of the plotting region.
  function axisTicks(lo, hi) {
    var ext = 0.04 * (hi - lo);
    var a = lo - ext, b = hi + ext;
    var p = rPretty(a, b, 5, "axis");
    var out = [];
    for (var i = p.ns; i <= p.nu + 1e-9; i++) {
      var v = +(i * p.unit).toPrecision(12);
      if (v >= a - 1e-9 && v <= b + 1e-9) out.push(v);
    }
    return out;
  }

  return {
    AGE0: AGE0, profileKey: profileKey, cohortQx: cohortQx, lifeExpectancy: lifeExpectancy,
    summaryText: summaryText, lookupPostcode: lookupPostcode, pretty: pretty, axisTicks: axisTicks
  };
});
