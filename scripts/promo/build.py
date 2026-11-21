"""새 게임 소개 영상 만들기 — capture.py 로 찍은 raw/<게임>.mp4 를 3.2초씩 잘라 부드럽게 겹쳐 잇는다.
쓰는 법(이 폴더에서): python3 capture.py → python3 build.py → web/assets/promo/new-games.mp4 · .jpg 를 바꾸고,
web/arcade.html 의 REEL.ch(장면 시작 초)와 ?v= 숫자를 맞춘다(아래가 출력해 준다).
2026-11-21 v4: 새 게임 5개(황혼 질주 · 뿅뿅 달나라 대포 · 실타래 풀기 · 도토리 새총단 · 통통배 선착장)를 맨 앞에 최신순으로, 오래된 vinyl · jelly · eggfarm · frostcamp 는 뺐다.
선다운 장면은 capture.py sundown@4(그랜드 노을 축제길 · 품질 높음)로 찍은 raw/sundown@4.mp4 를 raw/sundown.mp4 로 복사해 쓴다(2026-11-19 v3)."""
import subprocess, pathlib
HERE = pathlib.Path(__file__).parent
ORDER = [("twilightrun", 7.0), ("moonshot", 7.2), ("looseends", 0.3), ("acornshot", 0.2), ("ferry", 2.0),
         ("sundown", 6.85), ("ringcatch", 3.2), ("hoops", 6.6), ("nightsquad", 0.6), ("holecity", 2.2), ("herorush", 2.6), ("kitsune", 3.0)]  # (게임, 녹화에서 시작할 초) — 가장 새 게임부터
POSTER_AT = 2.3  # 포스터 = 맨 앞 장면(황혼 질주)의 이 초 — 실사 배경(나무 · 바위 · 집)과 앞차들이 보이는 순간
L, D = 3.2, 0.45
inputs, parts = [], []
for i, (g, st) in enumerate(ORDER):
    inputs += ["-ss", str(st), "-t", str(L), "-i", str(HERE / "raw" / f"{g}.mp4")]
    parts.append(f"[{i}:v]fps=30,scale=960:540:flags=lanczos,setsar=1,format=yuv420p,settb=AVTB,setpts=PTS-STARTPTS[v{i}]")
chain, prev = "", "v0"
for i in range(1, len(ORDER)):
    chain += f";[{prev}][v{i}]xfade=transition=fade:duration={D}:offset={i * (L - D):.3f}[x{i}]"
    prev = f"x{i}"
out = HERE / "new-games.mp4"
subprocess.run(["ffmpeg", "-loglevel", "error", "-y"] + inputs + ["-filter_complex", ";".join(parts) + chain, "-map", f"[{prev}]", "-an", "-c:v", "libx264", "-profile:v", "main",
                "-crf", "27", "-preset", "slow", "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(out)], check=True)
subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-ss", str(POSTER_AT), "-i", str(out), "-frames:v", "1", "-q:v", "4", str(HERE / "new-games.jpg")], check=True)
print("REEL.ch =", [[g, round(i * (L - D), 2)] for i, (g, _) in enumerate(ORDER)])
