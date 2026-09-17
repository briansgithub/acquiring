import re
import sys

path = sys.argv[1]
text = open(path, encoding="utf-8").read()
for match in re.finditer(
    r'text="([^"]*)"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"',
    text,
):
    label = match.group(1)
    if label:
        print(f"{label}\t[{match.group(2)},{match.group(3)}][{match.group(4)},{match.group(5)}]")
