# Evolution

How Tutors changed from June 2026 on, with the evidence. How our testing grew is told in
[../testing/journey.md](../testing/journey.md), beside the other testing guides.

| File | What it is |
|---|---|
| [tutors-revolution.md](tutors-revolution.md) | *Tutors · The (R)evolution*, a Marp deck: the history, the Paper UI, the hardening, the release harness, and who keeps it going. Sources are in its speaker notes and appendix |
| [img/](img) | The deck's charts, as SVG |
| [tools/](tools) | The scripts that measure the history and draw the charts |

## Presenting the deck

```bash
npx @marp-team/marp-cli guides/evolution/tutors-revolution.md --allow-local-files --pdf
```

Use `--html` for a browser copy, and `--pdf-notes` to keep the speaker notes.

## Refreshing the numbers

The charts are drawn from git history, so they can be redrawn for any date.

```bash
cd guides/evolution/tools
python3 measure.py 2026-08-06 2026-09-16 2026-09-21 2026-09-28 > tests.jsonl  # tests, Rules, CI jobs at each date
REPOS=/path/to/clones python3 data.py   # commits and merges; needs full clones of every repository it names
python3 charts.py                       # redraws ../img/*.svg
```

A few series in `charts.py` are copied in rather than measured, each from the source the deck's
appendix names: merges per year, the release harness's growth and the Main-to-RC breakdown.
Update those by hand when you refresh.

## Keeping it honest

When a number in the deck changes, update it in the same PR as its speaker note, and say in
the appendix what moved and why. A figure that cannot be traced to a command or a report does
not go in.
