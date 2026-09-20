#!/bin/sh
set -eu
cd "$(dirname "$0")"
/tmp/stonkfly-venv/bin/python /tmp/stonkfly-emsdk/upstream/emscripten/em++.py kernel.cpp -O3 -std=c++17 -ffp-contract=off -sMODULARIZE=1 -sEXPORT_ES6=1 -sENVIRONMENT=web,node -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=201326592 -sMAXIMUM_MEMORY=1073741824 '-sEXPORTED_FUNCTIONS=["_memory_advance","_malloc","_free"]' '-sEXPORTED_RUNTIME_METHODS=["HEAPU8"]' -o kernel.mjs
