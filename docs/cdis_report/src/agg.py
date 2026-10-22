import collections,datetime as dt,json
S2T={'Monitor Tampering Detection':'monitor_tamper_detection','Crowd Detection (Entry/Exit)':'crowd_detection','Server Room Detection':'server_room_detection','Crowd < 5 + Invigilator Static':'crowd_five_invigilator_detection','Zero Person Detection':'zero_person_detection','Entry Exit Detection':'entry_exit_detection','Crowd < 5':'crowd_detection_threshold','Proximity Detection':'proximity_detection','Phone Detection':'phone_detection','Invigilator Detection':'invigilator_detection','Intruder Detection':'intruder_detection','Camera Inversion Detection':'camera_inversion_detection'}
W=collections.defaultdict(list)
for l in open('asg.tsv'):
    d,sh,sid,n,a,b=l.rstrip('\n').split('\t')
    if n in S2T and a!='NULL': W[(d,sh,S2T[n])].append((a,b))
RUN={tuple(l.split()) for l in open('running.tsv')}
CLS={}
for l in open('/data/tmp/w/links_full.tsv'):
    t,n,d,c,k,*_=l.rstrip('\n').split('\t'); CLS[f'{d}_{c}']=k
# camera class as it was in each shift (camera_classification_rtsp); latest row per camera/date/shift wins
HIST={}
for l in open('cls_hist.tsv'):
    cam,d,sh,cls,i=l.rstrip('\n').split('\t')
    if (cam,d,sh) not in HIST or int(i)>HIST[(cam,d,sh)][1]: HIST[(cam,d,sh)]=(cls,int(i))
# Table A (client view) script labels, in the comparison-report order
A_ORDER=['Intruder','Crowd (Entry/Exit)','Less than 5 people in a lab','Zero Person','Monitor Tampering','Phone (Inside Lab)','Phone (Server Room)','Server Room Threshold','Entry/Exit Movement','Close Proximity','Invigilator Static','Camera Inversion','Less than 5 + Invigilator Static']
A_OF={'intruder_detection':'Intruder','crowd_detection':'Crowd (Entry/Exit)','crowd_detection_threshold':'Less than 5 people in a lab','zero_person_detection':'Zero Person','monitor_tamper_detection':'Monitor Tampering','server_room_detection':'Server Room Threshold','entry_exit_detection':'Entry/Exit Movement','proximity_detection':'Close Proximity','invigilator_detection':'Invigilator Static','camera_inversion_detection':'Camera Inversion','crowd_five_invigilator_detection':'Less than 5 + Invigilator Static'}
# Table B (internal) analytic rows: (label, code)
B_ORDER=[('Crowd ≥10 people','crowd'),('Fewer than 5 candidates','crowd_five'),('Zero candidates in room','crowd_zero'),('Invigilator absent: no invigilator in room','invigilator · no_targets'),('Invigilator not moving','invigilator · static_person'),('Crowd <5 + invigilator static','crowd_five_invigilator'),('Server room threshold','server'),('Entry/exit movement','entry_exit'),('Mobile phone','phone'),('Proximity','proximity'),('Intruder','intruder'),('Monitor tampering','monitor_tamper'),('Camera inverted','inversion')]
B_OF={'crowd_detection':'crowd','crowd_detection_threshold':'crowd_five','zero_person_detection':'crowd_zero','crowd_five_invigilator_detection':'crowd_five_invigilator','server_room_detection':'server','entry_exit_detection':'entry_exit','phone_detection':'phone','proximity_detection':'proximity','intruder_detection':'intruder','monitor_tamper_detection':'monitor_tamper','camera_inversion_detection':'inversion'}
SHN={'160':'Shift 1','156':'Shift 2','157':'Shift 3'}
A=collections.defaultdict(lambda:collections.defaultdict(lambda:[0,0,0]))      # day->label->[pushed,acc,rej]
B=collections.defaultdict(lambda:collections.defaultdict(lambda:[0,0,0,0]))    # day->code->[total,pushed,removed,acc]
SH=collections.defaultdict(lambda:collections.defaultdict(lambda:[0,0]))       # day->shift->[total,pushed]
unk=collections.Counter()
for l in open('det.tsv'):
    i,sh,t,it,ts,p,r,ac,cam=l.rstrip('\n').split('\t')
    d=dt.datetime.strptime(ts,'%d/%m/%Y %H:%M:%S'); ds=d.strftime('%Y-%m-%d'); hm=d.strftime('%H:%M:%S')
    if (ds,sh) not in RUN: continue
    p,r,ac=p=='1',r=='1',ac=='1'
    if p:  # Table A: everything delivered to the client
        lab=A_OF.get(t)
        if t=='phone_detection':
            cls=HIST[(cam,ds,sh)][0] if (cam,ds,sh) in HIST else CLS.get(cam)
            lab='Phone (Server Room)' if cls=='Server Room' else 'Phone (Inside Lab)'
        if lab:
            a=A[ds][lab]; a[0]+=1; a[1]+=ac; a[2]+=(r and not ac)
        else: unk['A '+t]+=1
    ws=W.get((ds,sh,t))
    if ws and not any(a_<=hm<b_ for a_,b_ in ws): continue   # outside the script's scheduled window
    code='invigilator · '+(it or 'no_targets') if t=='invigilator_detection' else B_OF.get(t)
    if not code: unk['B '+t]+=1; continue
    b=B[ds][code]; b[0]+=1; b[1]+=p; b[2]+=(p and r); b[3]+=ac
    s=SH[ds][SHN[sh]]; s[0]+=1; s[1]+=p
days=sorted(B)
out=dict(days=days,a_order=A_ORDER,b_order=B_ORDER,
  A={d:{k:A[d][k] for k in A_ORDER} for d in days},
  B={d:{c:B[d][c] for _,c in B_ORDER} for d in days},
  shifts={d:dict(SH[d]) for d in days})
json.dump(out,open('data.json','w'))
print('unmapped',unk)
for d in days:
    tb=[sum(v[i] for v in B[d].values()) for i in range(4)]; ta=[sum(v[i] for v in A[d].values()) for i in range(3)]
    print(d,'B total/pushed/removed',tb[:3],'| A pushed/acc/rej',ta, dict(SH[d]))
