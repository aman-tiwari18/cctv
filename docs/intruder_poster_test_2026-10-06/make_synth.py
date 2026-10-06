"""Synthetic intruder on the real cam26 night footage: a real person patch (grayscale, from a
lab video) is pasted onto the recording and moves through the room, so the posters stay
real and only the "intruder" is synthetic.

Timeline (seconds into the output clip):
  enter_at .. +20   walks in from the left edge towards the middle
  +20 .. +80        stands still in the middle
  +80 .. +95        walks over to the right poster and stands in front of it
  +95 .. +125       stands still in front of the right poster
  then              leaves (disappears)
"""
import sys
import cv2

src, out, enter_at = sys.argv[1], sys.argv[2], float(sys.argv[3])
dur = float(sys.argv[4]) if len(sys.argv) > 4 else 0

person = cv2.imread("pos1.jpg")[205:530, 1055:1155]          # standing man, ~100x325
person = cv2.cvtColor(cv2.cvtColor(person, cv2.COLOR_BGR2GRAY), cv2.COLOR_GRAY2BGR)
person = cv2.resize(person, (62, 200))
person = cv2.convertScaleAbs(person, alpha=0.8, beta=-10)    # roughly match the IR brightness

cap = cv2.VideoCapture(src)
fps = cap.get(cv2.CAP_PROP_FPS) or 15
W, H = int(cap.get(3)), int(cap.get(4))
vw = cv2.VideoWriter(out, cv2.VideoWriter_fourcc(*"mp4v"), fps, (W, H))
ph, pw = person.shape[:2]
foot_y = 560

def pos(t):
    s = t - enter_at
    if s < 0:
        return None
    if s < 20:   return 0 + (330 - 0) * s / 20            # walk in to x=330
    if s < 80:   return 330                                 # stand
    if s < 95:   return 330 + (535 - 330) * (s - 80) / 15  # walk to right poster (x~535)
    if s < 125:  return 535                                 # stand in front of poster
    return None

i = 0
while True:
    ok, frame = cap.read()
    if not ok:
        break
    t = i / fps
    if dur and t > dur:
        break
    x = pos(t)
    if x is not None:
        x = int(x)
        frame[foot_y - ph:foot_y, x:x + pw] = person
    vw.write(frame)
    i += 1
vw.release()
print("wrote", out, i, "frames")
