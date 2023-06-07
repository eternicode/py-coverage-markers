#!/bin/bash -ex

python3 -m venv .env

source .env/bin/activate

pip install -r requirements.txt

coverage run -m pytest

coverage xml
coverage lcov
coverage json

deactivate

rm -r .env .coverage .pytest_cache __pycache__
