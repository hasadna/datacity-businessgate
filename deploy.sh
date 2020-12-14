#!/bin/zsh -l
git checkout master && \
(git branch -D dist || true) && \
git checkout -b dist && \
rm ui/.gitignore && \
(cd ui && ng build --prod --base-href=/) && \
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
git checkout . && \
git push
