import subprocess
import shutil
import os

if os.path.exists("dist"):
    shutil.rmtree("dist")
os.mkdir("dist")

shutil.copy("jszip.js", "dist/jszip.js")
shutil.copy("index.html", "dist/raw_index.html")

shutil.copy("logo.png", "dist/logo.png")
shutil.copy("skellina.skf", "dist/skellina.skf")

# subprocess.run("minify backend.js > dist/backend.js", shell=True)
# subprocess.run("minify runtime.js > dist/runtime.js", shell=True)
# subprocess.run("minify index.js > dist/index.js", shell=True)
subprocess.run("inliner index.html > dist/index.html --compress", shell=True)
# subprocess.run("inliner index.html > dist/index.html --compress", shell=True)
