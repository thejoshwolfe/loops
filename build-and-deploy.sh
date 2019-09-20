./build.sh

s3cmd sync -P --no-preserve --add-header="Cache-Control: max-age=0, must-revalidate" public/ s3://wolfesoftware.com/loops/ || exit 1
