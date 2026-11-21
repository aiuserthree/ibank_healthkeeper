"""새 게임 소개 영상 만들기 — capture.py 로 찍은 raw/<게임>.mp4 를 3.2초씩 잘라 부드럽게 겹쳐 잇는다.
쓰는 법(이 폴더에서): python3 capture.py → python3 build.py → web/assets/promo/new-games.mp4 · .jpg 를 바꾸고,
web/arcade.html 의 REEL.ch(장면 시작 초)와 ?v= 숫자를 맞춘다(아래가 출력해 준다).
2026-11-21 v4: 새 게임 5개(황혼 질주 · 뿅뿅 달나라 대포 · 실타래 풀기 · 도토리 새총단 · 통통배 선착장)를 맨 앞에 최신순으로, 오래된 vinyl · jelly · eggfarm · frostcamp 는 뺐다.
2026-11-21 v5: 맨 앞 장면을 황혼 질주 주행 대신 휴게소 주유 영상(web/assets/games/twilightrun/rest/refuel.mp4 7.4~10.6초 — 노즐 든 손님 · 주유기 · 차)으로.
  raw/twilightrun-refuel.mp4 = 그 refuel.mp4 복사본. 장면 이름의 「-」 앞이 게임 키(REEL.ch · 「새로 나왔어요」 단추가 찾는 값)다.
  v4 녹화 원본 중 황혼 질주 · 달나라 대포 · 실타래 · 도토리 · 통통배가 지워져 v5 영상은 .claude/work/promo-reel/2026-11-21/v5/splice.py 로
  주유 장면만 새로 만들고 2~12장면은 v4 영상을 같은 시각 그대로 이었다(원본을 다시 찍으면 이 파일로 다시 만든다).
선다운 장면은 capture.py sundown@4(그랜드 노을 축제길 · 품질 높음)로 찍은 raw/sundown@4.mp4 를 raw/sundown.mp4 로 복사해 쓴다(2026-11-19 v3)."""
import subprocess, pathlib
HERE = pathlib.Path(__file__).parent
ORDER = [("twilightrun-refuel", 7.4), ("moonshot", 7.2), ("looseends", 0.3), ("acornshot", 0.2), ("ferry", 2.0),
         ("sundown", 6.85), ("ringcatch", 3.2), ("hoops", 6.6), ("nightsquad", 0.6), ("holecity", 2.2), ("herorush", 2.6), ("kitsune", 3.0)]  # (게임, 녹화에서 시작할 초) — 가장 새 게임부터
POSTER_AT = 0.6  # 포스터 = 맨 앞 장면(황혼 질주 주유)의 이 초 — 노즐 든 손님 · 주유기 · 차 · 노을 지붕이 한 화면에 보이는 순간
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
print("REEL.ch =", [[g.split("-")[0], round(i * (L - D), 2)] for i, (g, _) in enumerate(ORDER)])  # 장면 이름의 「-」 앞 = 게임 키
