"""Draw the deck's SVG charts from data.json and tests.jsonl (see the appendix for method)."""
import json, datetime, os
from html import escape

D = os.path.dirname(os.path.abspath(__file__))
data = json.load(open(f"{D}/data.json"))
tests = [json.loads(l) for l in open(f"{D}/tests.jsonl")]
OUT = os.path.join(D, "..", "img")
os.makedirs(OUT, exist_ok=True)

BG, INK, INK2, MUTED, GRID = "#0f1720", "#e8edf2", "#b6c1cd", "#8b98a8", "#22303f"
AMBER, TEAL, VIOLET, CORAL, GRAY = "#f5b642", "#3fd0c2", "#a78bfa", "#f0787f", "#5d6b7c"
FONT = "'Segoe UI', Inter, system-ui, sans-serif"


class Svg:
    def __init__(self, w, h):
        self.w, self.h, self.parts = w, h, []

    def add(self, s):
        self.parts.append(s)

    def text(self, x, y, s, size=15, fill=INK2, anchor="start", weight="normal"):
        self.add(f'<text x="{x:.1f}" y="{y:.1f}" font-size="{size}" fill="{fill}" text-anchor="{anchor}" font-weight="{weight}">{escape(str(s))}</text>')

    def rect(self, x, y, w, h, fill, rx=0):
        if h <= 0 or w <= 0:
            return
        self.add(f'<rect x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" fill="{fill}" rx="{rx}"/>')

    def line(self, x1, y1, x2, y2, stroke=GRID, width=1, dash=None):
        d = f' stroke-dasharray="{dash}"' if dash else ""
        self.add(f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" stroke="{stroke}" stroke-width="{width}"{d}/>')

    def path(self, pts, stroke, width=2.5, dash=None, step=False):
        if step:
            p = [pts[0]]
            for a, b in zip(pts, pts[1:]):
                p += [(b[0], a[1]), b]
            pts = p
        d = "M" + " L".join(f"{x:.1f},{y:.1f}" for x, y in pts)
        da = f' stroke-dasharray="{dash}"' if dash else ""
        self.add(f'<path d="{d}" fill="none" stroke="{stroke}" stroke-width="{width}" stroke-linejoin="round"{da}/>')

    def dot(self, x, y, fill, r=4.5):
        self.add(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r}" fill="{fill}" stroke="{BG}" stroke-width="2"/>')

    def legend(self, x, y, items):
        for label, col in items:
            self.rect(x, y - 11, 13, 13, col, 3)
            self.text(x + 19, y, label, 14, INK2)
            x += 34 + len(label) * 8.2

    def save(self, name):
        body = "\n".join(self.parts)
        svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {self.w} {self.h}" width="{self.w}" height="{self.h}" '
               f'font-family="{FONT}"><rect width="100%" height="100%" fill="{BG}" rx="10"/>\n{body}\n</svg>\n')
        open(f"{OUT}/{name}", "w").write(svg)


def nice_ticks(vmax, n=4):
    raw = vmax / n
    mag = 10 ** (len(str(int(raw))) - 1)
    step = min((m * mag for m in (1, 2, 2.5, 5, 10) if m * mag >= raw), default=mag * 10)
    ticks, v = [], 0
    while v <= vmax + 1e-9:
        ticks.append(v)
        v += step
    if ticks[-1] < vmax:
        ticks.append(ticks[-1] + step)
    return ticks


def stacked_bars(name, cats, series, colors, title_note=None, w=1200, h=520, legend=None, gap_after=None, sublabels=None, fmt_total=str):
    s = Svg(w, h)
    L, R, T, B = 70, 30, 60, 70
    pw, ph = w - L - R, h - T - B
    totals = [sum(series[k][i] for k in series) for i in range(len(cats))]
    ticks = nice_ticks(max(totals))
    ymax = ticks[-1]
    for t in ticks:
        y = T + ph - ph * t / ymax
        s.line(L, y, w - R, y)
        s.text(L - 10, y + 5, f"{t:,.0f}", 13, MUTED, "end")
    n = len(cats) + (0.6 if gap_after is not None else 0)
    slot = pw / n
    bw = min(slot * 0.62, 90)
    for i, c in enumerate(cats):
        off = 0.6 if gap_after is not None and i > gap_after else 0
        cx = L + slot * (i + off + 0.5)
        y = T + ph
        for k in series:
            v = series[k][i]
            hh = ph * v / ymax
            s.rect(cx - bw / 2, y - hh, bw, max(hh - 2, 0), colors[k], 3)
            y -= hh
        s.text(cx, y - 8, fmt_total(totals[i]), 15, INK, "middle", "600")
        s.text(cx, T + ph + 22, c, 14, INK2, "middle")
        if sublabels and sublabels[i]:
            s.text(cx, T + ph + 40, sublabels[i], 12, MUTED, "middle")
    if gap_after is not None:
        x = L + slot * (gap_after + 1.3)
        s.line(x, T - 10, x, T + ph, MUTED, 1, "4 4")
    s.legend(L, 30, legend or [(k, colors[k]) for k in series])
    if title_note:
        s.text(w - R, 30, title_note, 13, MUTED, "end")
    return s


# 1 history-commits ---------------------------------------------------------------
oy = data["orig_yearly"]
people = ["Eamonn de Leastar", "Jordan Harrison", "Leigh Griffin", "Claude", "Others"]
years = ["2022", "2023", "2024", "2025", "2026"]
ser = {p: [oy.get(f"{y}|{p}", 0) for y in years] for p in people}
mono = data["mono_nonmerge_by"]
named = {"Eamonn de Leastar", "Jordan Harrison", "Leigh Griffin", "Claude"}
for p in people:
    ser[p].append(mono.get(p, 0) if p != "Others" else sum(v for k, v in mono.items() if k not in named))
cols = {"Eamonn de Leastar": TEAL, "Jordan Harrison": CORAL, "Leigh Griffin": AMBER, "Claude": VIOLET, "Others": GRAY}
stacked_bars("history-commits.svg", years[:4] + ["2026", "Monorepo"], ser, cols,
             title_note="human non-merge commits, bots excluded",
             legend=[("Eamonn de Leastar", TEAL), ("Jordan Harrison", CORAL), ("Leigh Griffin", AMBER), ("Claude (agent-authored)", VIOLET), ("Others", GRAY)],
             gap_after=4, sublabels=["", "", "", "", "to 23 Jul", "27 Jul – 28 Sep"]).save("history-commits.svg")

# 2 history-merges ------------------------------------------------------------------
# PR merge commits by the person who pressed merge (git author of "Merge pull request").
mg = {
    "Eamonn de Leastar": [21, 124, 202, 107, 47, 106, 8, 1],
    "Jordan Harrison":   [60, 103, 8, 0, 0, 0, 0, 5],
    "Leigh Griffin":     [0, 0, 0, 0, 0, 0, 53, 15],
    "Others":            [0, 1, 0, 0, 0, 0, 0, 0],
}
stacked_bars("history-merges.svg", ["2022", "2023", "2024", "2025", "2026", "to 14 Sep", "15–21 Sep", "22–28 Sep"], mg,
             {"Eamonn de Leastar": TEAL, "Jordan Harrison": CORAL, "Leigh Griffin": AMBER, "Others": GRAY},
             title_note="merged PRs by who pressed merge", gap_after=4,
             sublabels=["", "", "", "", "to 23 Jul", "monorepo", "monorepo", "monorepo"]).save("history-merges.svg")

# 3 monthly --------------------------------------------------------------------------
m = data["monthly"]
months = ["2026-06", "2026-07", "2026-08", "2026-09"]
ser = {k: [m[k].get(mm, 0) for mm in months] for k in ("pred", "mono", "harness")}
stacked_bars("monthly.svg", ["June", "July", "August", "September"], ser,
             {"pred": GRAY, "mono": AMBER, "harness": TEAL},
             legend=[("Predecessor repos (to 26 Jul)", GRAY), ("tutors-mono-repo", AMBER), ("tutors-release-harness", TEAL)],
             title_note="commits per month, all authors", sublabels=["", "", "", "to the 28th"], w=1100).save("monthly.svg")

# 4 weekly ---------------------------------------------------------------------------
wk = data["weekly"]
start = datetime.date(2026, 6, 1)
weeks = [(start + datetime.timedelta(days=7 * i)).isoformat() for i in range(18)]
ser = {k: [wk[k].get(x, 0) for x in weeks] for k in ("pred", "mono", "harness")}
labels = [datetime.date.fromisoformat(x).strftime("%-d %b") for x in weeks]
s = stacked_bars("weekly.svg", [lb if i % 2 == 0 or i >= 14 else "" for i, lb in enumerate(labels)], ser,
                 {"pred": GRAY, "mono": AMBER, "harness": TEAL},
                 legend=[("Predecessor repos", GRAY), ("tutors-mono-repo", AMBER), ("tutors-release-harness", TEAL)],
                 title_note="commits per week (weeks start Monday; the last is one day)", sublabels=[""] * 17 + ["1 day"],
                 fmt_total=lambda t: str(t) if t >= 40 else "")
s.save("weekly.svg")

# 5 types ----------------------------------------------------------------------------
tn = data["types_now"]
hard = {"fix", "test", "ci", "security", "perf", "refactor"}
order = sorted(tn, key=lambda k: -tn[k])
s = Svg(1100, 500)
L, T, rowh = 140, 70, 36
mx = max(tn.values())
for i, k in enumerate(order):
    y = T + i * rowh
    col = AMBER if k == "feat" else TEAL if k in hard else GRAY
    bw = 820 * tn[k] / mx
    s.rect(L, y, bw, rowh - 12, col, 3)
    s.text(L - 12, y + 18, k, 16, INK2, "end")
    s.text(L + bw + 8, y + 18, tn[k], 15, INK, "start", "600")
s.legend(L, 34, [("feat: adds a capability", AMBER), ("fix, test, ci, security, perf, refactor: hardens", TEAL), ("chore, docs, build, style", GRAY)])
s.save("types.svg")

# 6 test-progress --------------------------------------------------------------------
def dt(x): return datetime.date.fromisoformat(x)
pts = [("2026-06-01", 27), ("2026-07-26", 196)] + [(t["date"], t["tests"]) for t in tests if t["date"] >= "2026-07-27"]
pts = [p for p in pts if p[0] != "2026-07-27"] if False else pts
har = [("2026-09-17", 102), ("2026-09-19", 181), ("2026-09-21", 952), ("2026-09-26", 989), ("2026-09-27", 1291), ("2026-09-28", 1310)]
s = Svg(1200, 520)
L, R, T, B = 70, 40, 60, 60
pw, ph = 1200 - L - R, 520 - T - B
d0, d1 = dt("2026-06-01"), dt("2026-09-30")
X = lambda d: L + pw * (dt(d) - d0).days / (d1 - d0).days
ymax = 2500
Y = lambda v: T + ph - ph * v / ymax
for t in range(0, ymax + 1, 500):
    s.line(L, Y(t), 1200 - R, Y(t))
    s.text(L - 10, Y(t) + 5, f"{t:,}", 13, MUTED, "end")
for mth, lab in [("2026-06-01", "Jun"), ("2026-07-01", "Jul"), ("2026-08-01", "Aug"), ("2026-09-01", "Sep")]:
    s.text(X(mth), T + ph + 24, lab, 14, INK2, "start")
s.line(X("2026-07-27"), T, X("2026-07-27"), T + ph, MUTED, 1, "4 4")
s.text(X("2026-07-27") + 6, T + 14, "monorepo founded", 12, MUTED)
s.path([(X(d), Y(v)) for d, v in pts], AMBER, step=True)
s.path([(X(d), Y(v)) for d, v in har], TEAL, step=True)
for d, v, lab, dy, anc in [("2026-06-01", 27, "27", -12, "start"), ("2026-08-06", 1409, "1,409 · framework", -12, "end"),
                           ("2026-09-17", 1829, "runway", -12, "end"), ("2026-09-21", 2124, "2,124", -12, "end"),
                           ("2026-09-24", 1954, "Paper rebuild −170", 56, "end"), ("2026-09-28", 2140, "2,140", -14, "start")]:
    s.dot(X(d), Y(v), AMBER)
    s.text(X(d) + (8 if anc == "start" else -8), Y(v) + dy, lab, 14, INK, anc, "600")
s.dot(X("2026-09-28"), Y(1310), TEAL)
s.text(X("2026-09-28") + 8, Y(1310) + 18, "1,310", 14, INK, "start", "600")
s.legend(L, 30, [("Monorepo and predecessors", AMBER), ("Release harness", TEAL)])
s.text(1200 - R, 30, "declared tests, measured at each date", 13, MUTED, "end")
s.save("test-progress.svg")

# 7 test-multiples ---------------------------------------------------------------------
pre = [{"date": "2026-06-01", "files": 5, "jobs": 0, "guards": 0, "baselines": 0, "scenarios": 0, "rules": 0},
       {"date": "2026-07-26", "files": 14, "jobs": 3, "guards": 0, "baselines": 0, "scenarios": 0, "rules": 0}]
series = pre + [t for t in tests if t["date"] >= "2026-07-27"]
for t in series:  # scenarios became executable when bound to code on 19 Sep (#277)
    t["exec"] = t["scenarios"] if t["date"] >= "2026-09-19" else 0
panels = [("Test files", "files", None, None), ("CI jobs", "jobs", None, None),
          ("Guard scripts", "guards", "baselines", "shrink-only baselines"), ("Executable BDD scenarios", "exec", "rules", "EARS Rules")]
s = Svg(1240, 420)
pw_, ph_ = 235, 250
for i, (title, key, k2, lab2) in enumerate(panels):
    ox, oy = 60 + i * 300, 90
    vals = [t[key] for t in series] + ([t[k2] for t in series] if k2 else [])
    ymax = nice_ticks(max(vals), 2)[-1]
    X = lambda d: ox + pw_ * (dt(d) - d0).days / (d1 - d0).days
    Y = lambda v: oy + ph_ - ph_ * v / ymax
    s.text(ox, 40, title, 17, INK, "start", "600")
    if k2:
        s.text(ox, 62, f"dashed: {lab2}", 13, MUTED)
    for t in (0, ymax / 2, ymax):
        s.line(ox, Y(t), ox + pw_, Y(t))
        s.text(ox - 6, Y(t) + 4, f"{t:,.0f}", 12, MUTED, "end")
    for mth, lb in [("2026-06-01", "Jun"), ("2026-08-01", "Aug"), ("2026-09-01", "Sep")]:
        s.text(X(mth), oy + ph_ + 22, lb, 13, INK2)
    s.path([(X(t["date"]), Y(t[key])) for t in series], AMBER, step=True)
    if k2:
        s.path([(X(t["date"]), Y(t[k2])) for t in series], TEAL, 2, "6 4", step=True)
    last = series[-1]
    s.dot(X(last["date"]), Y(last[key]), AMBER)
    s.text(X(last["date"]) - 8, Y(last[key]) - 10, last[key], 15, INK, "end", "600")
    if k2:
        s.text(X(last["date"]) + 6, Y(last[k2]) + 20, last[k2], 14, TEAL, "start", "600")
s.save("test-multiples.svg")

# 8 harness-growth ---------------------------------------------------------------------
hg = [("2026-09-17", "0.1.0", 102, 3219), ("2026-09-19", "1.1.0", 181, 4013), ("2026-09-21", "1.4.1", 952, 11928),
      ("2026-09-26", "1.4.8", 989, 12451), ("2026-09-27", "1.13.0", 1291, 19551), ("2026-09-28", "1.13.2", 1310, 19678)]
s = Svg(1200, 440)
h0, h1 = dt("2026-09-16"), dt("2026-09-29")
for i, (title, idx, ymax, col) in enumerate([("Harness tests", 2, 1500, TEAL), ("Harness source lines (src/*.ts)", 3, 20000, AMBER)]):
    ox, oy, pw_, ph_ = 70 + i * 570, 80, 480, 280
    X = lambda d: ox + pw_ * (dt(d) - h0).days / (h1 - h0).days
    Y = lambda v: oy + ph_ - ph_ * v / ymax
    s.text(ox, 40, title, 17, INK, "start", "600")
    for t in (0, ymax / 2, ymax):
        s.line(ox, Y(t), ox + pw_, Y(t))
        s.text(ox - 8, Y(t) + 5, f"{t:,.0f}", 12, MUTED, "end")
    for d in ("2026-09-17", "2026-09-21", "2026-09-24", "2026-09-28"):
        s.text(X(d), oy + ph_ + 22, dt(d).strftime("%-d Sep"), 13, INK2, "middle")
    s.path([(X(d), Y(r[idx])) for d, *_ in hg for r in [next(x for x in hg if x[0] == d)]], col, step=True)
    for d, v, *rest in hg:
        r = next(x for x in hg if x[0] == d)
        s.dot(X(d), Y(r[idx]), col)
        if d in ("2026-09-17", "2026-09-21", "2026-09-28"):
            s.text(X(d) + (8 if d != "2026-09-28" else -8), Y(r[idx]) + (22 if d == "2026-09-17" else -12), f"v{v} · {r[idx]:,}", 14, INK, "start" if d != "2026-09-28" else "end", "600")
s.text(70, 420, "Versions: 0.1.0 on 17 Sep, 1.0.0 (contract frozen) on 19 Sep, 1.4.1 when the deck was written, 1.13.2 today. 22 to 25 Sep: no harness commits.", 13, MUTED)
s.save("harness-growth.svg")

# 9 unclaimed ----------------------------------------------------------------------------
rows = [("sbom", 709, GRAY), ("image-manifest", 8, GRAY), ("network", 83, TEAL), ("dom", 34, TEAL), ("screenshot", 16, TEAL),
        ("focus", 14, TEAL), ("headers", 8, TEAL), ("logs", 15, AMBER), ("persistence", 3, AMBER), ("console", 2, AMBER)]
s = Svg(1200, 470)
L, T, rowh = 170, 70, 36
for i, (k, v, col) in enumerate(rows):
    y = T + i * rowh
    bw = 880 * v / 709
    s.rect(L, y, max(bw, 3), rowh - 12, col, 3)
    s.text(L - 12, y + 18, k, 16, INK2, "end")
    s.text(L + max(bw, 3) + 8, y + 18, v, 15, INK, "start", "600")
s.legend(L, 34, [("Runtime image hardening: 717", GRAY), ("Paper UI and its bundle: 155", TEAL), ("Behaviour and logs: 20", AMBER)])
s.text(1170, 34, "892 unclaimed, Main to RC, 28 Sep", 13, MUTED, "end")
s.save("unclaimed.svg")
print("ok", sorted(os.listdir(OUT)))
