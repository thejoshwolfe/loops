npm install || exit 1

./node_modules/.bin/tsc --sourceMap --removeComments --strict --noImplicitAny --strictNullChecks --strictFunctionTypes --strictPropertyInitialization --noImplicitThis --alwaysStrict --noUnusedLocals --noUnusedParameters --noImplicitReturns --noFallthroughCasesInSwitch public/a.ts || exit 1

s3cmd sync -P --no-preserve --add-header="Cache-Control: max-age=0, must-revalidate" public/ s3://wolfesoftware.com/loops/ || exit 1
