import json,datetime
D=json.load(open('data.json'))
OBS='''<h3>Key observations</h3><ul class="note obs">
<li><b>Overall precision is flat, but the volume grew about 4×.</b> % pushed went from 18.8% (30 Sep, 1 Oct, 5 Oct) to 17.9% (14, 15, 16 Oct), while in-window alerts rose from 25,037 to 98,995. Most of the growth from 13 Oct onward comes from entry/exit (1,237 → 37,192), fewer than 5 candidates (3,009 → 18,883) and proximity (2,135 → 17,922). The operators now filter far more false positives per day.</li>
<li><b>Improved:</b> fewer than 5 candidates (% pushed 8.2% → 33.9%), invigilator absent (9.8% → 30.2%), mobile phone (10.0% → 21.4%) and intruder (6.2% → 44.8%, on small counts).</li>
<li><b>Got worse:</b> proximity (7.1% → 2.6%, with 8× the alerts), entry/exit (24.7% → 17.6%, with 30× the alerts), invigilator not moving (25.4% → 2.7%, alerts 63 → 1,178), server room threshold (60.4% → 41.6%) and zero candidates (46.8% → 37.6%).</li>
<li><b>The client is removing more of what we push:</b> 4.4% → 10.1% overall, and 20.3% on 16 Oct (1,142 of 5,615). Mobile phone (48.7% removed in the last 3 days) and crowd ≥10 (4.5% → 22.1%) drive it.</li>
<li><b>Monitor tampering is never pushed:</b> 0 of about 1,800–4,400 alerts per day, every day. Camera inversion produced no alerts after 7 Oct.</li></ul>'''
html=open('template.html').read().replace('__DATA__',json.dumps(D,ensure_ascii=False)).replace('__OBS__',json.dumps(OBS)).replace('__GEN__',datetime.datetime.now().strftime('%d %b %Y %H:%M IST'))
out='/data/cctv_dev/cctv/docs/cdis_report/CDIS_Detection_Report_30Sep-16Oct.html'
import os; os.makedirs(os.path.dirname(out),exist_ok=True); open(out,'w').write(html); print(out,len(html)//1024,'KB')
