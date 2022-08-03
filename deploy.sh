#!/bin/bash
git checkout master && \
export VERSION=`git show --pretty="format:%aI.%h" -s` && \
echo VERSION: $VERSION && \
hatool content/script.yaml script.$VERSION.json && \
md5 script.$VERSION.json || md5sum script.$VERSION.json && \
export SCRIPT_VERSION=`(md5 script.$VERSION.json || md5sum script.$VERSION.json) |cut -f 1 -d ' '` && \
mv script.$VERSION.json ui/projects/businessgate/src/assets/script.$SCRIPT_VERSION.json && \
echo "export const VERSION='$VERSION';" > ui/projects/businessgate/src/app/version.ts && \
echo "export const SCRIPT_VERSION='$SCRIPT_VERSION';" >> ui/projects/businessgate/src/app/version.ts && \
git add ui/projects/businessgate/src/assets/script.$SCRIPT_VERSION.json || true && \
git commit -m "Automatic update of script for version $SCRIPT_VERSION" || true && \
git push || true && \
(git branch -D dist || true) && \
git checkout -b dist && \
(cd data && python prepare_stacks.py) && \
rm ui/.gitignore && \
(cd ui && npm run prod) && \
cp ui/dist/businessgate/index.html ui/dist/businessgate/404.html && \
cp CNAME ui/dist/businessgate/ && \
git add ui/dist/businessgate && \
git commit -m dist && \
(git branch -D gh-pages || true) && \
git subtree split --prefix ui/dist/businessgate -b gh-pages && \
git push -f origin gh-pages:gh-pages && \
git checkout master && \
git branch -D gh-pages && \
git branch -D dist && \
git checkout . 
