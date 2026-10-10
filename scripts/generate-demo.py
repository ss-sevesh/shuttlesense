"""Generate redistributable diagram footage; no private match data is read."""
import math
from pathlib import Path
import subprocess
import cv2
import numpy as np

output = Path('public/demo')
output.mkdir(parents=True, exist_ok=True)
process = subprocess.Popen(['ffmpeg', '-y', '-hide_banner', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'bgr24',
    '-s', '1280x720', '-r', '30', '-i', '-', '-an', '-c:v', 'libx264', '-preset', 'fast', '-crf', '24',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart', str(output/'court.mp4')], stdin=subprocess.PIPE)
offsets = {11:(-22,-115),12:(22,-115),13:(-50,-75),14:(50,-75),15:(-72,-110),16:(72,-40),
    19:(-80,-120),20:(85,-30),23:(-18,-45),24:(18,-45),25:(-25,-5),26:(25,-5),27:(-30,35),28:(30,35),31:(-42,40),32:(42,40)}
try:
    for frame in range(360):
        time = frame/30
        image = np.full((720,1280,3), (232,237,231), dtype=np.uint8)
        court = np.array([[290,220],[990,220],[1130,620],[150,620]], dtype=np.int32)
        cv2.fillConvexPoly(image,court,(64,108,79))
        cv2.polylines(image,[court],True,(232,245,232),3)
        for a,b in [((290,420),(990,420)),((245,340),(1035,340)),((185,540),(1095,540)),((640,220),(640,340)),((640,540),(640,620))]:
            cv2.line(image,a,b,(230,243,230),2)
        x=640+120*math.sin(time);y=490
        points={i:(round(x+dx),round(y+dy)) for i,(dx,dy) in offsets.items()}
        for a,b in [(11,12),(11,13),(13,15),(12,14),(14,16),(11,23),(12,24),(23,24),(23,25),(25,27),(24,26),(26,28),(27,31),(28,32)]:
            cv2.line(image,points[a],points[b],(210,231,245),7,cv2.LINE_AA)
        cv2.circle(image,(round(x),340),18,(210,231,245),-1,cv2.LINE_AA)
        cv2.circle(image,(round(640+180*math.cos(time*3)),round(350+60*math.sin(time*3))),5,(255,255,255),-1,cv2.LINE_AA)
        cv2.putText(image,'ShuttleSense / synthetic feature demo',(90,100),cv2.FONT_HERSHEY_SIMPLEX,1,(42,75,51),2,cv2.LINE_AA)
        cv2.putText(image,'Generated diagram. No model predictions or private footage.',(90,145),cv2.FONT_HERSHEY_SIMPLEX,.7,(72,89,77),2,cv2.LINE_AA)
        cv2.putText(image,f'{time:04.1f}s  |  near-player example',(90,675),cv2.FONT_HERSHEY_SIMPLEX,.65,(42,75,51),2,cv2.LINE_AA)
        if frame in (135,315):cv2.imwrite(str(output/f'attempt-{1 if frame==135 else 2}.jpg'),image)
        process.stdin.write(image.tobytes())
finally:
    process.stdin.close()
if process.wait():raise RuntimeError('Demo video encoding failed')
print('Generated 12-second demo and two exact synthetic attempt frames.')
