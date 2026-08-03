import subprocess
import sys
from pathlib import Path

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
        commit_msg = "v1.2.0 Apple Dark UI overhaul, dynamic aspect ratio viewport engine, and Premiere Pro Essential Graphics panel"
        run_cmd(["git", "commit", "-m", commit_msg])
        if run_cmd(["git", "push", "origin", "main"]):
            print("✨ Successfully updated GitHub repository!")
        else:
            print("⚠️ Push failed. Please verify your GitHub authentication credentials.")
