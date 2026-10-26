import re,html,json,glob,datetime
MON={'Sep':9,'Oct':10}
def txt(x): return html.unescape(re.sub('<[^>]+>','',x)).strip()
def num(x):
    x=x.replace(',','').strip(); return None if x in ('n/a','–','') else int(x)
out={}
for f in glob.glob('/data/cctv_dev/cctv/docs/comparison_report/Superview_vs_CDIS_*_Report.html'):
    tag=re.search(r'CDIS_(\d+)(\w{3})_Report',f); d=datetime.date(2026,MON[tag.group(2)],int(tag.group(1))).isoformat()
    s=open(f).read(); s=re.sub(r'data:image[^"\']+','',s)
    shifts={}
    for sec in re.findall(r'<section id="[^"]+" class="tab">(.*?)</section>',s,re.S):
        name=txt(re.search(r'<h1[^>]*>(.*?)</h1>',sec).group(1)); sh=name.split('·')[-1].strip()
        def kpis(h2):
            m=re.search(re.escape(h2)+r'.*?<div class="kpis">(.*?)</div>\s*<p',sec,re.S)
            return {txt(l):num(txt(v)) for v,l in re.findall(r'<b>(.*?)</b><span>(.*?)</span>',m.group(1))}
        sv=kpis('1 · Superview'); cd=kpis('2 · CDIS')
        t3=re.search(r'3 · Detection comparison.*?<tbody>(.*?)</tbody>',sec,re.S).group(1)
        det={}
        for tr in re.findall(r'<tr[^>]*>(.*?)</tr>',t3,re.S):
            c=[txt(x) for x in re.findall(r'<td[^>]*>(.*?)</td>',tr,re.S)]
            if len(c)==11 and c[0]!='Total': det[c[0].replace(' (CDIS-only script)','')]=[num(c[i]) for i in (1,2,3,4,6,7,8,9)]
        t5=re.search(r'5 · Cameras reported.*?<tbody>(.*?)</tbody>',sec,re.S).group(1)
        cams={}
        for tr in re.findall(r'<tr[^>]*>(.*?)</tr>',t5,re.S):
            c=[txt(x) for x in re.findall(r'<td[^>]*>(.*?)</td>',tr,re.S)]
            if len(c)==7: cams[c[0]]=[num(x) for x in c[1:]]
        shifts[sh]=dict(sv=sv,cdis=cd,det=det,cams=cams)
    out[d]=shifts
json.dump(dict(sorted(out.items())),open('cmp.json','w'),indent=0)
for d,S in sorted(out.items()):
    for sh,x in S.items():
        T=[sum(v[i] or 0 for v in x['det'].values()) for i in range(8)]
        print(d,sh,'SV',T[:4],'CDIS',T[4:],'| svkpi',list(x['sv'].values())[:2],'cdis online',x['cdis'].get('Online cameras (accessible this shift)'),'| allcams',x['cams'].get('All scripts (unique cameras)'))
