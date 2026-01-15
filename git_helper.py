import subprocess

def run_git(command, f):
    try:
        result = subprocess.run(command, capture_output=True, text=True, shell=True)
        f.write(f"--- Command: {' '.join(command)} ---\n")
        f.write(f"STDOUT: {result.stdout}\n")
        f.write(f"STDERR: {result.stderr}\n")
        f.write(f"Return Code: {result.returncode}\n")
    except Exception as e:
        f.write(f"Error executing {command}: {e}\n")

if __name__ == "__main__":
    with open("git_status_log.txt", "w") as f:
        f.write("Starting git helper...\n")
        run_git(["git", "status"], f)
        run_git(["git", "diff", "--stat"], f)
        f.write("Finished git helper.\n")
