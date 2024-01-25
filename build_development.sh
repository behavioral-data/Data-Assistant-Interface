#!/bin/bash
pip install -e .
jupyter labextension develop . --overwrite
jlpm run build