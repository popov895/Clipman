#!/bin/bash

xgettext --keyword=_:1,2c --from-code=UTF-8 --output=po/example.pot *.js

for file in po/*.po
do
    msgmerge -Uq --backup=off "$file" po/example.pot
done
