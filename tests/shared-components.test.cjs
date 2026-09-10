const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const React = require('react');
const {renderToStaticMarkup} = require('react-dom/server');
const {transform} = require('next/dist/build/swc');

async function loadComponent(name) {
  const filename = path.resolve('src/components/shared', name + '.jsx');
  const {code} = await transform(fs.readFileSync(filename, 'utf8'), {
    filename,
    jsc: {parser: {syntax: 'ecmascript', jsx: true}, transform: {react: {runtime: 'automatic'}}},
    module: {type: 'commonjs'},
  });
  const mod = new Module(filename, module);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(path.dirname(filename));
  mod._compile(code, filename);
  return mod.exports;
}

test('pagination bounds navigation and preserves custom summary', async () => {
  const {default: Pagination} = await loadComponent('Pagination');
  const changes = [];
  const first = Pagination({page: 1, totalPages: 3, onChange: page => changes.push(page)});
  assert.equal(first.props.children[0].props.disabled, true);
  first.props.children[0].props.onClick();
  first.props.children[2].props.onClick();
  assert.deepEqual(changes, [1, 2]);
  const summary = React.createElement('span', null, '15 vendedores');
  const last = Pagination({page: 3, totalPages: 3, onChange: page => changes.push(page), children: summary});
  assert.equal(last.props.children[2].props.disabled, true);
  assert.equal(last.props.children[1], summary);
  last.props.children[2].props.onClick();
  assert.equal(changes.at(-1), 3);
});

test('page size converts numeric values and keeps the all option', async () => {
  const {PageSizeSelector} = await loadComponent('Pagination');
  const changes = [];
  const tree = PageSizeSelector({value: 15, minimum: 15, total: 80, onChange: value => changes.push(value)});
  const select = tree.props.children[1];
  select.props.onChange({target: {value: '25'}});
  select.props.onChange({target: {value: 'all'}});
  assert.deepEqual(changes, [25, 'all']);
  assert.deepEqual(select.props.children[0].map(option => option.props.value), [15, 25, 50]);
});

test('modal ignores inside clicks and preserves caller saving guard', async () => {
  const {default: ModalBackdrop} = await loadComponent('ModalBackdrop');
  let closed = 0, saving = true;
  const modal = ModalBackdrop({onClose: () => { if (!saving) closed++; }, className: 'modal-bg receipt-print-root'});
  const background = {};
  modal.props.onMouseDown({target: {}, currentTarget: background});
  assert.equal(closed, 0);
  modal.props.onMouseDown({target: background, currentTarget: background});
  assert.equal(closed, 0);
  saving = false;
  modal.props.onMouseDown({target: background, currentTarget: background});
  assert.equal(closed, 1);
  assert.equal(modal.props.className, 'modal-bg receipt-print-root');
});

test('search preserves input attributes and only shows clear for populated fields', async () => {
  const {default: SearchInput} = await loadComponent('SearchInput');
  const render = value => renderToStaticMarkup(React.createElement(SearchInput, {
    value, onChange() {}, onClear() {}, clearable: true, required: true, 'aria-label': 'Buscar vendedor',
  }));
  assert.match(render('Ana'), /aria-label="Limpar busca"/);
  assert.match(render('Ana'), /required=""/);
  assert.match(render('Ana'), /aria-label="Buscar vendedor"/);
  assert.doesNotMatch(render(''), /aria-label="Limpar busca"/);
});
