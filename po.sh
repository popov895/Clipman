#!/bin/bash

mkdir -p po

xgettext  `find . -name \*.js` --keyword=_:1,2c --from-code=UTF-8 --output=po/example.pot

for file in po/*.po
do
    msgmerge -Uq --backup=off "$file" po/example.pot
done
