"""새 게임 소개 영상 만들기 — capture.py 로 찍은 raw/<게임>.mp4 를 3.2초씩 잘라 부드럽게 겹쳐 잇는다.
쓰는 법(이 폴더에서): python3 capture.py → python3 build.py → web/assets/promo/new-games.mp4 · .jpg 를 바꾸고,
web/arcade.html 의 REEL.ch(장면 시작 초)와 ?v= 숫자를 맞춘다(아래가 출력해 준다)."""
import subprocess, pathlib
HERE = pathlib.Path(__file__).parent
ORDER = [("sundown", 1.6), ("nightsquad", 0.6), ("holecity", 2.2), ("herorush", 2.6), ("kitsune", 3.0), ("vinyl", 0.8), ("jelly", 1.5), ("eggfarm", 2.2), ("frostcamp", 1.8)]  # (게임, 녹화에서 시작할 초)
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
subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-ss", "1", "-i", str(out), "-frames:v", "1", "-q:v", "4", str(HERE / "new-games.jpg")], check=True)
print("REEL.ch =", [[g, round(i * (L - D), 2)] for i, (g, _) in enumerate(ORDER)])
