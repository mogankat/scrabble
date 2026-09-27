#!/bin/sh
# Builds dict/words.js (loaded by the page) from:
#   dict/words.txt    base word list
#   + dict/extra.txt  newer words missing from the base list
#   - dict/removed.txt words dropped from the official list
# Re-run this after editing any of those files.
set -e
cd "$(dirname "$0")/dict"
[ -f words.txt ] || { echo "dict/words.txt not found. Run ./fetch-dictionary.sh first." >&2; exit 1; }
touch extra.txt removed.txt
{
  printf 'window.SCRABBLE_WORDS = "'
  cat words.txt extra.txt | tr -d '\r' | tr 'A-Z' 'a-z' | grep -E '^[a-z]{2,}$' | sort -u |
    grep -vxF -f removed.txt | tr '\n' ' '
  printf '";\n'
} > words.js
echo "Built dict/words.js ($(tr ' ' '\n' < words.js | grep -c '^[a-z]*$') words)"
