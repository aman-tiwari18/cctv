import json
C=json.load(open('cmp.json'))
days=sorted(C); S=list(C['2026-10-16']['Shift 1']['det'])
D=dict(days=days,scripts=S,shifts={},det={},dets={},match={},cams={},sv_cams={},cdis_online={},cdis_conf={},notes={})
for d in days:
    sh=sorted(C[d]); D['shifts'][d]=sh; D['dets'][d]={}; D['cams'][d]={}; D['cdis_online'][d]={}
    D['det'][d]={s:[0]*8 for s in S}; D['match'][d]={s:0 for s in S}
    for x_ in sh:
        x=C[d][x_]; D['dets'][d][x_]={s:[v or 0 for v in x['det'].get(s,[0]*8)] for s in S}
        for s in S:
            D['det'][d][s]=[a+b for a,b in zip(D['det'][d][s],D['dets'][d][x_][s])]
            D['match'][d][s]+=(x['cams'].get(s,[0]*6)[5] or 0)
        D['cams'][d][x_]=[v or 0 for v in x['cams']['All scripts (unique cameras)'][:5]]
        D['cdis_online'][d][x_]=x['cdis']['Online cameras (accessible this shift)']
    x=C[d][sh[0]]; sv=x['sv']
    D['sv_cams'][d]=dict(online=next(v for k,v in sv.items() if k.startswith('Online')),total=sv['Total Cameras (dashboard tile)'],centres=sv['Total centres'])
    D['cdis_conf'][d]=dict(cams=x['cdis']['Total cameras (configured)'],centres=x['cdis']['Total centres (configured for the exam)'])
D['notes']={'2026-09-30':'Shift 1 did not run on this day.','2026-10-07':'Shift 3: CDIS online cameras not available.','2026-10-23':'Shift 3: CDIS did not run (0 detections).'}
json.dump(D,open('data.json','w'))
# ---- figures for observations
p=lambda a,b: round(100*a/b,1) if b else None
tot=lambda ix,s=None:[sum(D['det'][days[i]][q][k] for i in ix for q in ([s] if s else S)) for k in range(8)]
A=tot(range(len(days))); print('ALL',A,'SVacc',p(A[1],A[0]),'CDacc',p(A[5],A[4]),'SVrej',p(A[3],A[0]),'CDrej',p(A[7],A[4]),'ratio',p(A[4],A[0]),'match',sum(sum(D['match'][d].values()) for d in days))
F,L=[0,1,2],[len(days)-3,len(days)-2,len(days)-1]
f,l=tot(F),tot(L); print('first3',f,'SVacc',p(f[1],f[0]),'CDacc',p(f[5],f[4]),'ratio',p(f[4],f[0]),'| last3',l,'SVacc',p(l[1],l[0]),'CDacc',p(l[5],l[4]),'ratio',p(l[4],l[0]),'CDrej',p(f[7],f[4]),p(l[7],l[4]),'SVrej',p(f[3],f[0]),p(l[3],l[0]))
for s in S:
    t=tot(range(len(days)),s); f=tot(F,s); l=tot(L,s)
    print(f'{s:34s} SV {t[0]:6d} acc {t[1]:4d} {p(t[1],t[0])}% rej {p(t[3],t[0])}% | CD {t[4]:6d} acc {t[5]:4d} {p(t[5],t[4])}% rej {p(t[7],t[4])}% | match {sum(D["match"][d][s] for d in days)} | CDacc f/l {p(f[5],f[4])}->{p(l[5],l[4])} SVacc {p(f[1],f[0])}->{p(l[1],l[0])}')
for d in days:
    t=tot([days.index(d)]); print(d,'SV',t[0],p(t[1],t[0]),'CD',t[4],p(t[5],t[4]),'cdon',D['cdis_online'][d],'svon',D['sv_cams'][d]['online'],'match',sum(D['match'][d].values()))
