import os
from dotenv import load_dotenv

load_dotenv()

print("--- ENV CHECK ---")
for k, v in os.environ.items():
    if "THREADS" in k:
        print(f"{k}: {'[SET]' if v else '[EMPTY]'}")
print("--- END CHECK ---")
