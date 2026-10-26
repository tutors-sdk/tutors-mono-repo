"""Declared tests, test files, BDD scenarios, Rules, CI jobs, guard scripts and baselines on main at each date.

Usage: python3 measure.py 2026-08-06 2026-09-28 > tests.jsonl
"""
import subprocess,re,json,sys,os
R=os.environ.get('MONOREPO', os.path.abspath(os.path.join(os.path.dirname(__file__), '../../..')))
def g(*a): return subprocess.run(['git','-C',R,*a],capture_output=True,text=True).stdout
T=re.compile(r'(?<![\w.$])(?:it|test)(?:\.(?:each|skip|only|concurrent|todo|fails)\b[^\n]*?)?\s*\(|Deno\.test\s*\(')
def measure(date):
    c=g('rev-list','-1','--first-parent','--before',date+' 23:59:59','main').strip()
    files=g('ls-tree','-r','--name-only',c).split('\n')
    tf=[f for f in files if re.search(r'\.(test|spec)\.[cm]?[jt]sx?$',f) and 'node_modules' not in f and '/fixtures/' not in f]
    n=0
    for f in tf:
        src=g('show',f'{c}:{f}')
        n+=len(re.findall(r'(?m)(?<![\w.$])(?:it|test)(?:\.(?:each|skip|only|concurrent|todo|fails))?(?:\([^()]*\))?\s*\(\s*[\'"`]',src))+len(re.findall(r'Deno\.test\s*\(',src))
    feats=[f for f in files if f.startswith('tests/bdd/features') and f.endswith('.feature')]
    sc=sum(len(re.findall(r'(?m)^\s*Scenario( Outline)?:',g('show',f'{c}:{f}'))) for f in feats)
    rules=sum(len(re.findall(r'(?m)^\s*Rule:',g('show',f'{c}:{f}'))) for f in feats)
    wf=[f for f in files if f.startswith('.github/workflows/') and f.endswith(('.yml','.yaml'))]
    jobs=0
    for f in wf:
        s=g('show',f'{c}:{f}'); m=re.search(r'(?m)^jobs:\s*\n((?:[ \t].*\n|\s*\n)*)',s)
        if m: jobs+=len(re.findall(r'(?m)^  [A-Za-z0-9_-]+:\s*$',m.group(1)))
    guards=[f for f in files if re.match(r'scripts/checks/[^/]+\.ts$',f)]
    base=[f for f in files if f.startswith('tests/') and re.search(r'(known-[^/]*|ears-audit-baseline)\.txt$',f)]
    areas=sorted({f.split('/')[1] for f in files if f.startswith('tests/') and f.count('/')>=2 and f.split('/')[1] not in('support','mocks','helpers','fixtures')})
    return dict(date=date,commit=c[:7],tests=n,files=len(tf),features=len(feats),scenarios=sc,rules=rules,workflows=len(wf),jobs=jobs,guards=len(guards),baselines=len(base),areas=len(areas))
for d in sys.argv[1:]: print(json.dumps(measure(d)))
