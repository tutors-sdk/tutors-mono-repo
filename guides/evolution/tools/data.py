"""Commit, merge and commit-type counts for the evolution deck's charts. Writes data.json beside this file."""
import subprocess,collections,datetime,json,re,os
# REPOS: a folder holding clones of tutors, tutors-apps.git, tutors-cli.git, tutors-reference-course.git,
# tutors-reference-manual.git, tutors-mono-repo and tutors-release-harness (full history).
S=os.environ.get('REPOS', os.path.abspath(os.path.join(os.path.dirname(__file__), '../../../..')))+'/'
def log(repo,*a): return subprocess.run(['git','-C',S+repo,'log',*a],capture_output=True,text=True).stdout.strip().split('\n')
out={}
pred=[]
for r in ['tutors','tutors-apps.git','tutors-cli.git','tutors-reference-course.git','tutors-reference-manual.git']:
    pred+=[l for l in log(r,'--since=2026-06-01','--until=2026-07-27','--format=%ad','--date=short') if l]
mono=[l for l in log('tutors-mono-repo','main','--since=2026-06-01','--format=%ad|%an|%s','--date=short') if l]
har=[l for l in log('tutors-release-harness','main','--format=%ad|%an|%s','--date=short') if l]
md=lambda L:[x.split('|')[0] for x in L]
def month(ds): return collections.Counter(d[:7] for d in ds)
out['monthly']={k:dict(month(v)) for k,v in [('pred',pred),('mono',md(mono)),('harness',md(har))]}
def wk(d):
    d=datetime.date.fromisoformat(d); return (d-datetime.timedelta(days=d.weekday())).isoformat()
out['weekly']={k:dict(collections.Counter(wk(d) for d in v)) for k,v in [('pred',pred),('mono',md(mono)),('harness',md(har))]}
T=re.compile(r'^(feat|fix|test|tests|ci|docs|chore|refactor|perf|security|build|style|revert)(\([^)]*\))?!?:')
def types(L,until=None):
    c=collections.Counter()
    for x in L:
        d,a,s=x.split('|',2)
        if until and d>until: continue
        m=T.match(s)
        if m: c[{'tests':'test'}.get(m.group(1),m.group(1))]+=1
    return dict(c)
out['types_now']=types(mono); out['types_21']=types(mono,'2026-09-21')
out['mono_total']=len(mono); out['mono_to21']=sum(1 for x in mono if x[:10]<='2026-09-21')
out['harness_total']=len(har)
# people monorepo since 27 Jul non-merge
nm=[l for l in log('tutors-mono-repo','main','--no-merges','--format=%an|%ad','--date=short') if l]
def who(n): return {'lgriffin':'Leigh Griffin'}.get(n,n)
out['mono_nonmerge_by']=dict(collections.Counter(who(x.split('|')[0]) for x in nm))
out['mono_nonmerge_by_22']=dict(collections.Counter(who(x.split('|')[0]) for x in nm if x.split('|')[1]>='2026-09-22'))
nmall=[l for l in log('tutors-mono-repo','main','--format=%an') if l]
out['mono_all_by']=dict(collections.Counter(who(x) for x in nmall))
hn=[l for l in log('tutors-release-harness','main','--no-merges','--format=%an') if l]
out['harness_nonmerge_by']=dict(collections.Counter(hn))
# original repo yearly human commits by person
o=[l for l in log('tutors','--all','--no-merges','--format=%ad|%an|%ae','--date=format:%Y') if l]
c=collections.Counter()
for l in o:
    y,n,e=l.split('|')
    if 'bot' in n.lower() or 'bot' in e: continue
    if 'Harrison' in n or 'jouwdan' in e or 'jordharr' in e: n='Jordan Harrison'
    elif 'Leastar' in n: n='Eamonn de Leastar'
    elif 'Griffin' in n: n='Leigh Griffin'
    else: n='Others'
    c[y+'|'+n]+=1
out['orig_yearly']=dict(c); out['orig_total']=sum(c.values())
json.dump(out,open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'data.json'),'w'),indent=1)
print(json.dumps({k:v for k,v in out.items() if k not in('weekly',)},indent=0))
