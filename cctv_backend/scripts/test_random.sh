#!/bin/bash
# Randomly fails
RANDOM_VAL=$((RANDOM % 10))
echo "Rolled: $RANDOM_VAL"

if [ $RANDOM_VAL -gt 7 ]; then
    echo "Random failure triggered!"
    exit 1
else
    echo "Success!"
    exit 0
fi
