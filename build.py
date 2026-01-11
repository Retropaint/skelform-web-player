import subprocess
import shutil
import os

if os.path.exists("dist"):
    shutil.rmtree("dist")
os.mkdir("dist")


