const expressionFunctions = new Set([
 'tileHasTag', 'tileColumn', 'tileRow', 'audioLevel', 'min', 'max', 'abs', 'floor', 'ceil', 'round', 'sqrt',
 'sin', 'cos', 'random', 'clamp', 'len', 'at', 'str', 'num', 'lerp',
]);
const expressionPrecedence = Object.freeze({
 '||': 1, '&&': 2, '==': 3, '===': 3, '!=': 3, '!==': 3,
 '<': 4, '>': 4, '<=': 4, '>=': 4, '+': 5, '-': 5, '*': 6, '/': 6, '%': 6,
});
const strictOperator = operator => ({ '==': '===', '!=': '!==' })[operator] ?? operator;

function parseEventExpression(source) {
 const text = String(source ?? '0');
 const token = /\s*(?:(\d+(?:\.\d*)?|\.\d+)(?:([eE][+-]?\d+))?|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|([A-Za-z_$][\w$]*)|(===|!==|==|!=|<=|>=|&&|\|\||[+\-*/%<>()!.,]))/gy;
 const tokens = [];
 let offset = 0;
 while (offset < text.length && text.slice(offset).trim()) {
  token.lastIndex = offset;
  const match = token.exec(text);
  if (!match) throw Error('Invalid expression near ' + text.slice(offset));
  offset = token.lastIndex;
  if (match[1]) tokens.push(['literal', Number(match[1] + (match[2] || ''))]);
  else if (match[3]) tokens.push(['literal', match[3].slice(1,-1).replace(/\\([nrt'"\\])/g, (_, letter) =>
   ({ n: '\n', r: '\r', t: '\t' })[letter] || letter)]);
  else if (match[4]) tokens.push(['name', match[4]]);
  else tokens.push(['operator', match[5]]);
 }
 let index = 0;
 const peek = () => tokens[index]?.[1];
 const take = () => tokens[index++];
 const expect = value => {
  if (peek() !== value) throw Error('Expected ' + value + ' in ' + text);
  index++;
 };

 function atom() {
  const current = take();
  if (!current) throw Error('Incomplete expression: ' + text);
  const [kind, value] = current;
  if (kind === 'operator' && value === '(') {
   const expression = parse(0);
   expect(')');
   return expression;
  }
  if (kind === 'operator' && ['!', '-', '+'].includes(value)) return { kind: 'unary', operator: value, value: atom() };
  if (kind === 'literal') return { kind, value };
  if (kind !== 'name') throw Error('Unexpected ' + value);
  if (peek() === '(') {
   index++;
   const args = [];
   if (peek() !== ')') {
    while (true) {
     args.push(parse(0));
     if (peek() !== ',') break;
     index++;
    }
   }
   expect(')');
   if (!expressionFunctions.has(value)) throw Error('Unknown function ' + value);
   return { kind: 'call', name: value, args };
  }
  const path = [value];
  while (peek() === '.') {
   index++;
   const property = take();
   if (property?.[0] !== 'name') throw Error('Expected property');
   path.push(property[1]);
  }
  return { kind: 'name', path };
 }

 function parse(minimum) {
  let left = atom();
  while (expressionPrecedence[peek()] >= minimum) {
   const operator = take()[1];
   left = { kind: 'binary', operator: strictOperator(operator), left,
    right: parse(expressionPrecedence[operator] + 1) };
  }
  return left;
 }

 const tree = parse(0);
 if (index !== tokens.length) throw Error('Unexpected token in ' + text);
 return tree;
}

const binaryExpression = {
 '+': (a,b) => a+b, '-': (a,b) => a-b, '*': (a,b) => a*b, '/': (a,b) => a/b, '%': (a,b) => a%b,
 '===': (a,b) => a===b, '!==': (a,b) => a!==b, '<': (a,b) => a<b, '<=': (a,b) => a<=b, '>': (a,b) => a>b, '>=': (a,b) => a>=b,
};

function bindEventExpression(node, environment) {
 switch (node.kind) {
  case 'literal': return () => node.value;
  case 'name': return context => environment.read(node.path, context);
  case 'call': {
   const args = node.args.map(arg => bindEventExpression(arg, environment));
   return context => environment.functions[node.name](...args.map(arg => arg(context)));
  }
  case 'unary': {
   const operand = bindEventExpression(node.value, environment);
   if (node.operator === '!') return context => !operand(context);
   if (node.operator === '-') return context => -operand(context);
   return context => +operand(context);
  }
  case 'binary': {
   const left = bindEventExpression(node.left, environment), right = bindEventExpression(node.right, environment);
   if (node.operator === '&&') return context => left(context) && right(context);
   if (node.operator === '||') return context => left(context) || right(context);
   const apply = binaryExpression[node.operator];
   return context => apply(left(context), right(context));
  }
 }
}

function eventJavaScriptLiteral(value) {
 if (typeof value === 'number' && !Number.isFinite(value)) return String(value);
 return JSON.stringify(value).replace(/[<\u2028\u2029]/g, character => '\\u' + character.charCodeAt(0).toString(16).padStart(4,'0'));
}

function printEventExpression(node) {
 switch (node.kind) {
  case 'literal': return eventJavaScriptLiteral(node.value);
  case 'name': return `env.read(${eventJavaScriptLiteral(node.path)}, context)`;
  case 'call': return `env.functions.${node.name}(${node.args.map(printEventExpression).join(', ')})`;
  case 'unary': return `(${node.operator}${printEventExpression(node.value)})`;
  case 'binary': return `(${printEventExpression(node.left)} ${node.operator} ${printEventExpression(node.right)})`;
 }
}

function eventSheetSources(project) {
 return [['layout',project.layouts],['shared',project.eventSheets??[]],['behavior',project.behaviorSheets??[]]]
  .flatMap(([kind,sheets])=>sheets.map(({id,name,events})=>({kind,id,name,events})));
}

function* projectEventRows(project) {
 for (const {events,...source} of eventSheetSources(project)) {
  let number = 0;
  function* walk(events, depth) {
   for (const event of events) {
    if (!event.group && !event.include) yield { source, event, depth, number: ++number };
    yield* walk(event.children ?? [], depth + 1);
   }
  }
  yield* walk(events, 0);
 }
}

function eventRowShape({source,event}) {
 return JSON.stringify([source.kind, source.id, event.id, event.mode,
  event.conditions.length, event.actions.length, event.children?.length ?? 0, Boolean(event.otherwise)]);
}
