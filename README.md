# taciturn

> Promises for tacit programming. Thread context through your chains without
  the ceremony.

[![npm version](https://badge.fury.io/js/taciturn.svg)](https://www.npmjs.com/package/taciturn)
[![CI](https://github.com/tonyfischetti/taciturn/actions/workflows/ci.yml/badge.svg)](https://github.com/tonyfischetti/taciturn/actions/workflows/ci.yml)


## Installation

npm install taciturn


## Quick Start

```javascript
import { TacitPromise } from 'taciturn';

TacitPromise.create({ userId: 123 })
  .then((_, ctx) => fetch(`/api/user/${ctx.userId}`))
  .then(response => response.json())
  .tap('user')  // Store in context
  .then((user, ctx) => {
    console.log('Loaded user:', ctx.user);
    return user;
  });
```


## API

### Creating Promises

#### `TacitPromise.create(context)`
Start with just context, value is `undefined`.
```javascript
TacitPromise.create({ debug: true })
  .then((_, ctx) => console.log('Debug:', ctx.debug));
```

#### `TacitPromise.begin(value, context)`
Start with both value and context.
```javascript
TacitPromise.begin(42, { multiplier: 2 })
  .then((val, ctx) => val * ctx.multiplier);
```

### Core Methods

#### `.then(onFulfilled, onRejected)`
Like Promise.then, but callbacks receive `(value, context)`.
```javascript
.then((value, ctx) => {
  ctx.count++;
  return value * 2;
})
```

#### `.catch(onRejected)`
Like Promise.catch, but callback receives `(error, context)`.
```javascript
.catch((error, ctx) => {
  console.error(`Request ${ctx.requestId} failed:`, error);
})
```

### Helper Methods

#### `.tap(key)`
Store current value in context under `key`.
```javascript
TacitPromise.begin(42)
  .tap('original')
  .then((val, ctx) => {
    console.log('Started with:', ctx.original);
    return val * 2;
  });
```

#### `.map(fn)`
Transform value without accessing context.
```javascript
TacitPromise.begin(5)
  .map(x => x * 2)
  .map(x => x + 10);
```

#### `.when(predicate, fn)`
Conditionally execute function.
```javascript
TacitPromise.create({ debug: true })
  .then(() => getData())
  .when(
    (_, ctx) => ctx.debug,
    (data) => {
      console.log('Debug:', data);
      return data;
    }
  );
```

#### `.filter(fn)`
Filter array values.
```javascript
TacitPromise.begin([1, 2, 3, 4, 5])
  .filter(x => x > 2)
  // [3, 4, 5]
```

#### `.mapcar(fn)`
Map over array values.
```javascript
TacitPromise.begin([1, 2, 3])
  .mapcar(x => x * 2)
  // [2, 4, 6]
```

### Extraction Methods

#### `.getValue()`
Get just the value as a regular Promise.
```javascript
const value = await promise.getValue();
```

#### `.getContext()`
Get just the context as a regular Promise.
```javascript
const context = await promise.getContext();
```

#### `.toObject()`
Get both value and context.
```javascript
const { value, context } = await promise.toObject();
```

## Real-World Example

Building a database indexer:
```javascript
TacitPromise.create({ 
  CODEX_ROOT: process.env.CODEX_ROOT,
  DEBUG: false 
})
  .then(removeOldDB)
  .then(createDB)
  .then(getAllFilesRecursively)
  .tap('allFiles')
  .filter(file => file.isFile())
  .filter(file => !isBlacklisted(file.path))
  .when(
    (_, ctx) => ctx.DEBUG,
    (files) => {
      console.log(`Processing ${files.length} files`);
      return files;
    }
  )
  .mapcar(file => addMetadata(file))
  .then(insertIntoDatabase)
  .then((_, ctx) => {
    console.log(`Indexed ${ctx.allFiles.length} files`);
  })
  .catch((err, ctx) => {
    console.error(`Failed at ${ctx.CODEX_ROOT}:`, err);
  });
```


## What's in a name?

The name comes from *tacit programming* (point-free style), where you compose
functions without explicitly mentioning their arguments. TacitPromise
encourages this style by:

1. Threading context implicitly
2. Encouraging bare function references
3. Making pipelines read like declarative recipes


## TypeScript

Full TypeScript support with generics for both value and context types:
```typescript
interface MyContext {
  userId: number;
  debug: boolean;
}

const promise: TacitPromise = 
  TacitPromise.create({ userId: 123, debug: true });

```

## Development Status

⚠️ **Pre-1.0**: API may change. Feedback welcome!


## License

GPL-3
