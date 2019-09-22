npm install || exit 1

ALL_THE_OPTIONS_PLEASE='--removeComments --strict --noImplicitAny --strictNullChecks --strictFunctionTypes --strictPropertyInitialization --noImplicitThis --alwaysStrict --noUnusedLocals --noUnusedParameters --noImplicitReturns --noFallthroughCasesInSwitch'

./node_modules/.bin/tsc --lib es2015,DOM,ES5,ScriptHost ${ALL_THE_OPTIONS_PLEASE} public/a.ts || exit 1
