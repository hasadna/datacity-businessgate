#!/bin/sh
git checkout master && \
export VERSION=`git show --pretty="format:%aI.%h"` && \
echo "export const VERSION='$VERSION';" > ui/projects/businessgate/src/app/version.ts && \
hatool content/script.yaml ui/projects/businessgate/src/assets/script.$VERSION.json && \
git add ui/projects/businessgate/src/assets/script.$VERSION.json && \
git commit -m "Automatic update of script for version $VERSION" && \
git push && \
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