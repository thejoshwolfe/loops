npm install || exit 1

./node_modules/.bin/tsc --sourceMap --removeComments --strict --noImplicitAny --strictNullChecks --strictFunctionTypes --strictPropertyInitialization --noImplicitThis --alwaysStrict --noUnusedLocals --noUnusedParameters --noImplicitReturns --noFallthroughCasesInSwitch public/a.ts || exit 1
