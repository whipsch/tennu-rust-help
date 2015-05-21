#!/bin/bash

JSON_OUT=${1:-"search-index.json"}
INDEX_SRC=${2:-"https://doc.rust-lang.org/search-index.js"}


echo "Downloading rustdoc index from $INDEX_SRC"
curl -L "$INDEX_SRC" | gawk -f <(cat - <<-'EOAWK'
BEGIN { print "{" }
{
  matches = match($0, /^searchIndex\['(\w+)'\]\s*=\s*(.+);$/, caps)
  if (matches != 0) {
    print "\"" caps[1] "\":" caps[2] ","
  }
}
END { print "\"CRAPPY_SENTINEL\":{}}" }
EOAWK
) > $JSON_OUT
echo "Saved to $JSON_OUT"

