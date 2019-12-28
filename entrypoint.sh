#!/bin/bash -l

ARGS=${@:1}
FILES=$INPUT_FILES
if [ -z "$FILES" ]; then
    FILES=$(git ls-files | grep \.java$)
fi

function execute {
    java -jar $EXECUTABLE $@
    local CODE=$?
    if [ $CODE -ne 0 ]; then
        exit $CODE
    fi
}

function newline {
    printf "\n"
}

newline
execute "--version"
newline
cd $GITHUB_WORKSPACE
execute $ARGS $FILES
newline

git config user.name "GitHub Actions"
git config user.email ""
git commit -m "Google Java Format" --all
git push
