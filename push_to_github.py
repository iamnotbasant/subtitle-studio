import subprocess
import sys
from pathlib import Path

# Fix Windows console UTF-8 output
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8")

repo_dir = Path(__file__).resolve().parent

def run_cmd(cmd):
    print(f"Running: {' '.join(cmd)}")
    res = subprocess.run(cmd, cwd=repo_dir)
    if res.returncode != 0:
        print(f"Command failed with exit code {res.returncode}")
        return False
    return True

if __name__ == "__main__":
    print("🚀 Staging, committing, and pushing to GitHub (iamnotbasant/subtitle-studio)...")
    
    if run_cmd(["git", "add", "."]):
        commit_msg = "v8.1.0 Master Release: Mathematical caption center alignment, master track style synchronization, and responsive canvas transform anchoring"
        run_cmd(["git", "commit", "-m", commit_msg])
        if run_cmd(["git", "push", "origin", "main"]):
            print("✨ Successfully updated GitHub repository!")
        else:
            print("⚠️ Push failed. Please verify your GitHub authentication credentials.")
