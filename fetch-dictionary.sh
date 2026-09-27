#!/bin/sh
# Downloads the public-domain ENABLE word list (~173k words, close to the
# official North American tournament list) to dict/words.txt.
set -e
cd "$(dirname "$0")"
mkdir -p dict
curl -fsSL https://raw.githubusercontent.com/dolph/dictionary/master/enable1.txt -o dict/words.txt
echo "Saved $(wc -l < dict/words.txt | tr -d ' ') words to dict/words.txt"
./build-dictionary.sh
