#!/bin/sh
set -eu
# Run from the repository root under your chosen process supervisor.
npm test
exec npm start
