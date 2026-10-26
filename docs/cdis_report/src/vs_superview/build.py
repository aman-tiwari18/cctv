import json,datetime
D=json.load(open('data.json'))
OBS='''<h3>Key observations</h3><ul class="note obs">
<li><b>CDIS raises far fewer alerts:</b> 43,160 CDIS detections against 135,588 Superview events (31.8% of Superview's volume). The gap is narrowing as CDIS covers more cameras: 21.8% of Superview's volume on the first 3 exam days, 41.4% on the last 3 (22, 23, 24 Oct).</li>
<li><b>CDIS detections are accepted about 4× as often:</b> 2.3% accepted vs 0.6% for Superview overall (3.6% vs 0.5% on the last 3 days). CDIS has more accepted detections in total (980 vs 747) from about a third of the volume.</li>
<li><b>The client rejects about half of Superview's events</b> (48.3%, flat from first to last days), against 9.3% of CDIS detections. CDIS rejections are rising, though: 4.3% on the first 3 days, 13.7% on the last 3.</li>
<li><b>Most of both systems' output is still pending</b> (Superview 51.2%, CDIS 88.4%), so accepted and rejected rates depend on how much the client has reviewed.</li>
<li><b>Where CDIS is clearly ahead:</b> mobile phone (accepted 13.1% Inside Lab and 18.7% Server Room, against Superview's 0.1% and 2.0%) and server room threshold (11.4% vs 4.4%). Superview raised 6,456 intruder events (99.1% rejected) and 13,233 monitor-tampering events (1 accepted); CDIS raised 103 and 9.</li>
<li><b>Where Superview is ahead:</b> invigilator static, 18.5% accepted vs CDIS 10.1%. CDIS still has more accepted invigilator alerts (558 vs 319) because it raises over 3× as many.</li>
<li><b>Camera coverage has caught up:</b> CDIS online cameras per shift went from about 500–2,800 to 3,700–4,000 from 22 Oct, close to Superview's dashboard figure of about 3,900–4,100.</li>
<li><b>4,181 same-event matches</b> (same camera, same script, within ±3 minutes), mostly crowd entry/exit (2,223), fewer than 5 in a lab (744) and entry/exit movement (468).</li></ul>'''
html=open('template.html').read().replace('__DATA__',json.dumps(D,ensure_ascii=False)).replace('__OBS__',json.dumps(OBS)).replace('__GEN__',datetime.datetime.now().strftime('%d %b %Y %H:%M IST'))
out='/data/cctv_dev/cctv/docs/cdis_report/CDIS_vs_Superview_Report_30Sep-24Oct.html'
open(out,'w').write(html); print(out,len(html)//1024,'KB')
