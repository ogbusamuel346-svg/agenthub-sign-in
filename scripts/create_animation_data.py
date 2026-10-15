import json
import os

os.makedirs('public/assets', exist_ok=True)
os.makedirs('src/assets', exist_ok=True)

# Read part 1
with open('tmp/anim_part1.json', 'r') as f:
    p1 = f.read()

# p1 contains: {"v":"5.7.8",...,"assets":[{"id":"comp_0",...Group 14...}]}
# Let's extract up to the closing of comp_0
idx = p1.rfind('}]')
if idx != -1:
    p1_clean = p1[:idx+1]
else:
    p1_clean = p1

print("Part 1 ready")
