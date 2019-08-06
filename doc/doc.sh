#!/bin/bash

set -eu

export DOC_DIR=5
export SITE_BASE=/sdk/js/5/

# Used to specify --no-cache for example
ARGS=${2:-""}

if [ ! -d "./$DOC_DIR" ]
then
  echo "Cannot find $DOC_DIR/. You must run this script from doc/ directory."
  exit 1
fi

case $1 in
  prepare)
    echo "Clone documentation framework"
    git clone --depth 10 --single-branch --branch master https://github.com/kuzzleio/documentation.git framework/
    git -C framework/ pull origin master

    echo "Install dependencies"
    npm --prefix framework/ install
  ;;

  dev)
    ./framework/node_modules/.bin/vuepress dev $DOC_DIR/ $ARGS
  ;;

  build)
    ./framework/node_modules/.bin/vuepress build $DOC_DIR/ $ARGS
  ;;

  upload)
    aws s3 sync $DOC_DIR/.vuepress/dist s3://$S3_BUCKET$SITE_BASE
  ;;

  cloudfront)
    aws cloudfront create-invalidation --distribution-id $CLOUDFRONT_DISTRIBUTION_ID --paths "$SITE_BASE*"
  ;;

  *)
    echo "Usage : $0 <prepare|dev|build|upload|cloudfront>"
    exit 1
  ;;
esac
