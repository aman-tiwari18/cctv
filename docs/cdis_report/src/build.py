import json,datetime
D=json.load(open('data.json'))
OBS='''<h3>Key observations</h3><ul class="note obs">
<li><b>Overall precision is down slightly, pulled by one noisy day.</b> % pushed went from 18.8% on the first 3 exam days (30 Sep, 1 Oct, 5 Oct) to 16.7% on the last 3 (22, 23, 24 Oct). 22 Oct (25.8%) and 23 Oct (31.3%, the best day so far, Shifts 1–2 only) were good, but 24 Oct had 43,560 alerts at 10.6%: entry/exit alone raised 23,440, fewer than 5 candidates 8,545 and invigilator absent 4,348.</li>
<li><b>The client is accepting more:</b> 1.5% → 4.5% of pushed detections accepted (first 3 vs last 3 days). Removals rose too, 4.4% → 14.1%.</li>
<li><b>Improved:</b> fewer than 5 candidates (% pushed 8.2% → 32.5%), invigilator absent (9.8% → 24.5%), proximity (7.1% → 10.1%, with alerts down from 2,135 to 664) and intruder (6.2% → 45.0%, on small counts).</li>
<li><b>Got worse:</b> server room threshold (60.4% → 12.7%, alerts 48 → 520, and 66.7% of what was pushed was removed), entry/exit (24.7% → 11.8%, with 26× the alerts), zero candidates (46.8% → 33.9%), crowd ≥10 (59.0% → 50.4%) and invigilator not moving (25.4% → 3.0%, alerts 63 → 1,706).</li>
<li><b>Mobile phone:</b> % pushed is flat at 10.0%, but the client removed 64.2% of pushed phone alerts in the last 3 days (28.5% in the first 3).</li>
<li><b>Monitor tampering is effectively never pushed:</b> 3 pushes on 30 Sep, none since, out of about 1,800–4,400 alerts per day. Camera inversion produced no alerts after 7 Oct.</li></ul>'''
html=open('template.html').read().replace('__DATA__',json.dumps(D,ensure_ascii=False)).replace('__OBS__',json.dumps(OBS)).replace('__GEN__',datetime.datetime.now().strftime('%d %b %Y %H:%M IST'))
out='/data/cctv_dev/cctv/docs/cdis_report/CDIS_Detection_Report_30Sep-24Oct.html'
import os; os.makedirs(os.path.dirname(out),exist_ok=True); open(out,'w').write(html); print(out,len(html)//1024,'KB')
